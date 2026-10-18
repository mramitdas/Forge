import type { TokenResponse } from "./types";

const ACCESS_KEY = "gym_access_token";
const REFRESH_KEY = "gym_refresh_token";

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

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(t: TokenResponse): void {
  localStorage.setItem(ACCESS_KEY, t.access_token);
  localStorage.setItem(REFRESH_KEY, t.refresh_token);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  const res = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const body = (await res.json()) as TokenResponse;
  setTokens(body);
  return body.access_token;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api/v1${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    refreshPromise = refreshPromise ?? refreshAccessToken();
    const fresh = await refreshPromise;
    refreshPromise = null;
    if (fresh) return apiFetch<T>(path, init, false);
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
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
      window.dispatchEvent(new Event("auth:must-change"));
    }
    throw apiError;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
