import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Role = 'platform_owner' | 'gym_owner' | 'employee';

export type Session = {
  email: string;
  name: string;
  role: Role;
};

type AuthContextValue = {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      signIn: setSession,
      signOut: () => setSession(null),
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
