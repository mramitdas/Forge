import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { authenticate, type FixtureSession } from '@/fixtures/session';
import { capabilitiesFor, type CapabilityCode, type Role } from '@/lib/capabilities';

export type Session = {
  email: string;
  name: string;
  role: Role;
  capabilities: CapabilityCode[];
  gymName: string;
  branchName: string;
  mustResetPassword: boolean;
};

export type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  session: Session | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => void;
  /** Phase 1 only: swap the signed-in persona to exercise the role matrix. */
  switchRole: (role: Role) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(fixture: FixtureSession): Session {
  return { ...fixture };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    // Phase 2 replaces this call with the real API — the signature stays.
    const result = authenticate(email, password);
    if (!result.ok) return result;
    setSession(toSession(result.session));
    return { ok: true };
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  const switchRole = useCallback((role: Role) => {
    setSession((current) =>
      current ? { ...current, role, capabilities: capabilitiesFor(role) } : current
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, switchRole }),
    [session, signIn, signOut, switchRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
