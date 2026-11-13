import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-context';
import { LoginScreen } from '@/screens/login';
import { ThemeProvider } from '@/theme/theme-context';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderLogin() {
  return renderRouter(
    {
      login: () => <LoginScreen />,
      '(tabs)/home': () => <Text>Home</Text>,
      '(tabs)/settings/password': () => <Text>Change password</Text>,
    },
    {
      initialUrl: '/login',
      wrapper: ({ children }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ),
    }
  );
}

describe('LoginScreen', () => {
  it('asks for an email and a password', async () => {
    await renderLogin();
    expect(screen.getByTestId('login-email')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
  });

  it('keeps the sign-in button disabled until the form is valid', async () => {
    await renderLogin();
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    await userEvent.type(screen.getByTestId('login-email'), 'owner@gym-erp.dev');
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    await userEvent.type(screen.getByTestId('login-password'), 'fitwoody-pass');
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('says plainly when the email or password is wrong', async () => {
    await renderLogin();
    await userEvent.type(screen.getByTestId('login-email'), 'owner@gym-erp.dev');
    await userEvent.type(screen.getByTestId('login-password'), 'wrong-pass');
    await userEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'That email or password is not right.'
    );
  });

  it('offers to stay signed in', async () => {
    await renderLogin();
    const toggle = screen.getByTestId('login-stay-signed-in');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await userEvent.press(toggle);
    expect(screen.getByTestId('login-stay-signed-in').props.accessibilityState.checked).toBe(true);
  });

  it('sends a forced reset straight to the password screen', async () => {
    const view = await renderLogin();
    await userEvent.type(screen.getByTestId('login-email'), 'reset@gym-erp.dev');
    await userEvent.type(screen.getByTestId('login-password'), 'fitwoody-pass');
    await userEvent.press(screen.getByTestId('login-submit'));
    expect(view.getPathname()).toBe('/settings/password');
  });
});
