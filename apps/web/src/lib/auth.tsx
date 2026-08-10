"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, getAccessToken, setTokens } from "@/lib/api";
import { clearImpersonationOrigin } from "@/lib/impersonation";
import type { MeOut, TokenResponse } from "@/lib/types";

interface AuthContextValue {
  me: MeOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<MeOut>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeOut | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<MeOut>("/auth/me");
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiFetch<TokenResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    clearImpersonationOrigin();
    setTokens(tokens);
    const data = await apiFetch<MeOut>("/auth/me");
    setMe(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem("gym_refresh_token");
    if (refresh) {
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        // ignore
      }
    }
    clearImpersonationOrigin();
    localStorage.removeItem("gym_access_token");
    localStorage.removeItem("gym_refresh_token");
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
