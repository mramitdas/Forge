import { useAuth } from '@/auth/auth-context';
import type { CapabilityCode } from '@/lib/capabilities';

/**
 * The single gate for what a person may do. Roles differ by action, never by
 * screen — a control without its capability is not rendered at all.
 */
export function useCan(code: CapabilityCode): boolean {
  const { session } = useAuth();
  return session?.capabilities.includes(code) ?? false;
}

export function useCanAny(codes: CapabilityCode[]): boolean {
  const { session } = useAuth();
  const held = session?.capabilities ?? [];
  return codes.some((code) => held.includes(code));
}
