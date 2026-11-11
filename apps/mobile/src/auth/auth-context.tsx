"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, getAccessToken, getRefreshToken, setTokens, clearTokens } from "@/lib/api";
import { onMustChangePassword } from "@/lib/auth-events";
import type { TokenResponse, MeOut } from "@/lib/types";

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

const ME_CACHE_KEY = "forge_me_mobile";

async function getCachedMe(): Promise<MeOut | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MeOut;
  } catch {
    return null;
  }
}

async function setCachedMe(data: MeOut | null): Promise<void> {
  try {
    if (data) await AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(data));
    else await AsyncStorage.removeItem(ME_CACHE_KEY);
  } catch {
    // cache is best-effort
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    return onMustChangePassword(() => setMustChange(true));
  }, []);

  const loadMe = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<MeOut>("/auth/me");
      setMe(data);
      await setCachedMe(data);
      if (data.must_change) setMustChange(true);
    } catch {
      setMe(null);
      await setCachedMe(null);
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
    await setTokens(tokens);
    if (tokens.must_change) {
      setMustChange(true);
      setMe(null);
      await setCachedMe(null);
      setLoading(false);
      return null;
    }
    const data = await apiFetch<MeOut>("/auth/me");
    setMe(data);
    await setCachedMe(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const refresh = await getRefreshToken();
    if (refresh) {
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        // best-effort server-side revocation
      }
    }
    await clearTokens();
    setMe(null);
    await setCachedMe(null);
    setMustChange(false);
  }, []);

  const completePasswordChange = useCallback(
    async (tokens: TokenResponse) => {
      await setTokens(tokens);
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