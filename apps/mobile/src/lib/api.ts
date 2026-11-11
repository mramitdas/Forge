import Constants from "expo-constants";
import { emitMustChangePassword } from "@/lib/auth-events";
import { getItem, setItem, removeItem } from "@/lib/storage";
import type { TokenResponse } from "./types";

const ACCESS_KEY = "gym_access_token";
const REFRESH_KEY = "gym_refresh_token";

const FALLBACK_API_BASE = "http://localhost:8000";

function resolveApiBase(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
  const url = extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL;
  return (url ?? FALLBACK_API_BASE).replace(/\/$/, "");
}

const API_BASE = `${resolveApiBase()}/api/v1`;

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }

  get code(): string | undefined {
    const d = this.detail as
      | { error?: { code?: string }; code?: string }
      | string
      | null;
    if (d && typeof d === "object") return d.error?.code ?? d.code;
    return undefined;
  }
}

export async function getAccessToken(): Promise<string | null> {
  return await getItem(ACCESS_KEY);
}

export async function setTokens(t: TokenResponse): Promise<void> {
  await setItem(ACCESS_KEY, t.access_token);
  await setItem(REFRESH_KEY, t.refresh_token);
}

export async function clearTokens(): Promise<void> {
  await removeItem(ACCESS_KEY);
  await removeItem(REFRESH_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return await getItem(REFRESH_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const body = (await res.json()) as TokenResponse;
  await setTokens(body);
  return body.access_token;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    refreshPromise = refreshPromise ?? refreshAccessToken();
    const fresh = await refreshPromise;
    refreshPromise = null;
    if (fresh) return apiFetch<T>(path, init, false);
    await clearTokens();
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    let detail: unknown = null;
    try {
      const body = await res.json();
      detail = body?.error ?? body?.detail ?? body;
    } catch {
      detail = await res.text();
    }
    const apiError = new ApiError(res.status, detail);
    if (apiError.code === "MUST_CHANGE_PASSWORD") {
      emitMustChangePassword();
    }
    throw apiError;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}