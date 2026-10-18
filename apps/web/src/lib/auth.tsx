"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, getAccessToken, setTokens } from "@/lib/api";
import { clearImpersonationOrigin } from "@/lib/impersonation";
import type { MeOut, TokenResponse } from "@/lib/types";

interface AuthContextValue {
  me: MeOut | null;
  loading: boolean;
  mustChange: boolean;
  login: (email: string, password: string) => Promise<MeOut | null>;
  logout: () => Promise<void>;
  refreshMe: (
    data?: MeOut | ((prev: MeOut | null) => MeOut | null),
  ) => Promise<void>;
  completePasswordChange: (tokens: TokenResponse) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    const handler = () => setMustChange(true);
    window.addEventListener("auth:must-change", handler);
    return () => window.removeEventListener("auth:must-change", handler);
  }, []);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<MeOut>("/auth/me");
      setMe(data);
      if (data.must_change) setMustChange(true);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMe = useCallback(
    async (data?: MeOut | ((prev: MeOut | null) => MeOut | null)) => {
      if (typeof data === "function") {
        setMe((prev) => data(prev));
        return;
      }
      if (data) {
        setMe(data);
        return;
      }
      await loadMe();
    },
    [loadMe],
  );

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
    if (tokens.must_change) {
      setMustChange(true);
      setMe(null);
      setLoading(false);
      return null;
    }
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
    setMustChange(false);
  }, []);

  const completePasswordChange = useCallback(
    async (tokens: TokenResponse) => {
      setTokens(tokens);
      setMustChange(false);
      await loadMe();
    },
    [loadMe],
  );

  return (
    <AuthContext.Provider
      value={{ me, loading, mustChange, login, logout, refreshMe, completePasswordChange }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
