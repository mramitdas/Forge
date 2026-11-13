import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { authenticate, type FixtureSession } from '@/fixtures/session';
import { readItem, removeItem, writeItem } from '@/lib/storage';
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

export type SignInResult = { ok: true; session: Session } | { ok: false; error: string };

const SESSION_KEY = 'fitwoody.session';

type AuthContextValue = {
  session: Session | null;
  signIn: (email: string, password: string, staySignedIn?: boolean) => Promise<SignInResult>;
  signOut: () => void;
  /** Marks a forced password reset as done. */
  completePasswordReset: () => void;
  /** Phase 1 only: swap the signed-in persona to exercise the role matrix. */
  switchRole: (role: Role) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(fixture: FixtureSession): Session {
  return { ...fixture };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    readItem(SESSION_KEY).then((stored) => {
      if (!stored) return;
      try {
        setSession(JSON.parse(stored) as Session);
      } catch {
        removeItem(SESSION_KEY);
      }
    });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, staySignedIn = false): Promise<SignInResult> => {
      // Phase 2 replaces this call with the real API — the signature stays.
      const result = authenticate(email, password);
      if (!result.ok) return result;
      const next = toSession(result.session);
      setSession(next);
      if (staySignedIn) writeItem(SESSION_KEY, JSON.stringify(next));
      return { ok: true, session: next };
    },
    []
  );

  const signOut = useCallback(() => {
    setSession(null);
    removeItem(SESSION_KEY);
  }, []);

  const completePasswordReset = useCallback(() => {
    setSession((current) => (current ? { ...current, mustResetPassword: false } : current));
  }, []);

  const switchRole = useCallback((role: Role) => {
    setSession((current) =>
      current ? { ...current, role, capabilities: capabilitiesFor(role) } : current
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, completePasswordReset, switchRole }),
    [session, signIn, signOut, completePasswordReset, switchRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
