import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { FIXTURE_PASSWORD } from '@/fixtures/session';
import { useCan } from '@/permissions/useCan';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function signInAs(email: string) {
  const { result } = await renderHook(
    () => ({ auth: useAuth(), can: useCan('billing.manage') }),
    { wrapper }
  );
  await act(async () => {
    await result.current.auth.signIn(email, FIXTURE_PASSWORD);
  });
  return result;
}

describe('useCan', () => {
  it('denies everything when nobody is signed in', async () => {
    const { result } = await renderHook(() => useCan('members.view'), { wrapper });
    expect(result.current).toBe(false);
  });

  it('grants a gym owner the manage capabilities', async () => {
    const result = await signInAs('owner@gym-erp.dev');
    await waitFor(() => expect(result.current.can).toBe(true));
  });

  it('denies the front desk a manage capability', async () => {
    const result = await signInAs('desk@gym-erp.dev');
    await waitFor(() => expect(result.current.auth.session).not.toBeNull());
    expect(result.current.can).toBe(false);
  });

  it('reports a wrong password instead of signing in', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    let outcome: Awaited<ReturnType<(typeof result.current)['signIn']>> | null = null;
    await act(async () => {
      outcome = await result.current.signIn('owner@gym-erp.dev', 'wrong');
    });
    expect(outcome).toEqual({ ok: false, error: expect.any(String) });
    expect(result.current.session).toBeNull();
  });
});
