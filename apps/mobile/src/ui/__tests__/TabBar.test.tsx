import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useEffect, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { FIXTURE_PASSWORD } from '@/fixtures/session';
import { QueryProvider } from '@/query/provider';
import { TabBar } from '@/ui/TabBar';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function SignIn({ email, children }: { email: string; children: ReactNode }) {
  const { signIn } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    signIn(email, FIXTURE_PASSWORD).then(() => setReady(true));
  }, [email, signIn]);
  if (!ready) return null;
  return <>{children}</>;
}

async function renderBar(email: string) {
  return renderRouter(
    { home: () => <TabBar /> },
    {
      initialUrl: '/home',
      wrapper: ({ children }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <AuthProvider>
            <SignIn email={email}>
              <QueryProvider>{children}</QueryProvider>
            </SignIn>
          </AuthProvider>
        </SafeAreaProvider>
      ),
    }
  );
}

describe('TabBar', () => {
  it('shows the two tabs and the quick-action trigger', async () => {
    await renderBar('owner@gym-erp.dev');
    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText('Members')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-actions-trigger')).toBeOnTheScreen();
  });

  it('opens the quick actions sheet', async () => {
    await renderBar('owner@gym-erp.dev');
    await userEvent.press(screen.getByTestId('quick-actions-trigger'));
    expect(screen.getByTestId('quick-actions')).toBeOnTheScreen();
  });
});

describe('QuickActionsSheet', () => {
  it('lists every action an owner can perform', async () => {
    await renderBar('owner@gym-erp.dev');
    await userEvent.press(screen.getByTestId('quick-actions-trigger'));
    expect(screen.getByTestId('quick-action-checkin')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-action-expense')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-action-subscriptions')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-action-billing')).toBeOnTheScreen();
  });

  it('never lists an action the front desk cannot perform', async () => {
    await renderBar('desk@gym-erp.dev');
    await userEvent.press(screen.getByTestId('quick-actions-trigger'));
    expect(screen.getByTestId('quick-action-checkin')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-action-billing')).toBeOnTheScreen();
    expect(screen.queryByTestId('quick-action-expense')).toBeNull();
    expect(screen.queryByTestId('quick-action-subscriptions')).toBeNull();
  });
});
