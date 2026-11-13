import { renderHook, waitFor } from '@testing-library/react-native';
import { useEffect, useState, type ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { FIXTURE_PASSWORD } from '@/fixtures/session';
import { useRecentCheckIns } from '@/query/hooks/attendance';
import { useInvoices } from '@/query/hooks/billing';
import { useExpenses } from '@/query/hooks/expenses';
import { useMembers } from '@/query/hooks/members';
import { useSubscriptions } from '@/query/hooks/membership';
import { useNotifications } from '@/query/hooks/notifications';
import { QueryProvider } from '@/query/provider';

/** A wrapper that signs the persona in before the hook under test runs. */
function signedInWrapper(email: string) {
  function SignIn({ children }: { children: ReactNode }) {
    const { signIn } = useAuth();
    const [ready, setReady] = useState(false);
    useEffect(() => {
      signIn(email, FIXTURE_PASSWORD).then(() => setReady(true));
    }, [signIn]);
    if (!ready) return null;
    return <QueryProvider>{children}</QueryProvider>;
  }

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider>
        <SignIn>{children}</SignIn>
      </AuthProvider>
    );
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>{children}</QueryProvider>
    </AuthProvider>
  );
}

describe('query hooks', () => {
  it('fetch for a gym owner', async () => {
    const { result } = await renderHook(() => useMembers(), {
      wrapper: signedInWrapper('owner@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(6);
  });

  it('do not fetch without the view capability', async () => {
    const { result } = await renderHook(() => useExpenses(), {
      wrapper: signedInWrapper('desk@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
  });

  it('let the front desk read invoices', async () => {
    const { result } = await renderHook(() => useInvoices(), {
      wrapper: signedInWrapper('desk@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('do not let the front desk read subscriptions', async () => {
    const { result } = await renderHook(() => useSubscriptions(), {
      wrapper: signedInWrapper('desk@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
  });

  it('let the front desk see check-ins', async () => {
    const { result } = await renderHook(() => useRecentCheckIns(), {
      wrapper: signedInWrapper('desk@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('load notifications', async () => {
    const { result } = await renderHook(() => useNotifications(), {
      wrapper: signedInWrapper('desk@gym-erp.dev'),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('fetch nothing at all when nobody is signed in', async () => {
    const { result } = await renderHook(() => useMembers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
  });
});
