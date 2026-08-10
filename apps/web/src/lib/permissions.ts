"use client";

import { useAuth } from "./auth";

export function can(permissions: readonly string[], code: string): boolean {
  return permissions.includes(code);
}

export function canAny(
  permissions: readonly string[],
  codes: readonly string[],
): boolean {
  return codes.some((c) => permissions.includes(c));
}

export function usePermissions(): readonly string[] {
  const { me } = useAuth();
  return me?.permissions ?? [];
}

export function useCan(): (code: string) => boolean {
  const perms = usePermissions();
  return (code: string) => can(perms, code);
}
