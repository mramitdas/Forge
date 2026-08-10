import { setTokens } from "./api";
import type { TokenResponse } from "./types";

const ACCESS_KEY = "gym_access_token";
const REFRESH_KEY = "gym_refresh_token";
const ORIGIN_KEY = "gym_impersonation_origin";

interface OriginTokens {
  access: string;
  refresh: string;
}

export function saveImpersonationOrigin(): void {
  const access = localStorage.getItem(ACCESS_KEY);
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!access || !refresh) return;
  sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({ access, refresh }));
}

export function getImpersonationOrigin(): OriginTokens | null {
  const raw = sessionStorage.getItem(ORIGIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OriginTokens;
  } catch {
    return null;
  }
}

export function clearImpersonationOrigin(): void {
  sessionStorage.removeItem(ORIGIN_KEY);
}

export function enterImpersonation(tokens: TokenResponse): void {
  saveImpersonationOrigin();
  setTokens(tokens);
  window.location.href = "/";
}

export function exitImpersonation(): void {
  const origin = getImpersonationOrigin();
  clearImpersonationOrigin();
  if (origin) {
    localStorage.setItem(ACCESS_KEY, origin.access);
    localStorage.setItem(REFRESH_KEY, origin.refresh);
    window.location.href = "/platform";
  } else {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.location.href = "/login";
  }
}
