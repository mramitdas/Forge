/**
 * Capability codes, mirroring the backend catalog
 * (`backend/app/modules/identity/permissions.py`).
 *
 * The mobile app has no platform tooling — registering gyms, tiers, revenue and
 * platform settings live in the web console — so only the gym-scoped codes are
 * modelled here. A platform owner using the mobile app therefore holds the full
 * gym-scoped set: they see every screen with every action.
 */

export type CapabilityCode =
  | 'tenancy.view'
  | 'tenancy.manage'
  | 'members.view'
  | 'members.manage'
  | 'membership.view'
  | 'membership.manage'
  | 'billing.view'
  | 'billing.manage'
  | 'expenses.view'
  | 'expenses.manage'
  | 'attendance.view'
  | 'attendance.manage'
  | 'notifications.view'
  | 'identity.view'
  | 'identity.manage';

export type CapabilityModule =
  | 'tenancy'
  | 'members'
  | 'membership'
  | 'billing'
  | 'expenses'
  | 'attendance'
  | 'notifications'
  | 'identity';

export const CAPABILITY_CATALOG: Record<CapabilityCode, CapabilityModule> = {
  'tenancy.view': 'tenancy',
  'tenancy.manage': 'tenancy',
  'members.view': 'members',
  'members.manage': 'members',
  'membership.view': 'membership',
  'membership.manage': 'membership',
  'billing.view': 'billing',
  'billing.manage': 'billing',
  'expenses.view': 'expenses',
  'expenses.manage': 'expenses',
  'attendance.view': 'attendance',
  'attendance.manage': 'attendance',
  'notifications.view': 'notifications',
  'identity.view': 'identity',
  'identity.manage': 'identity',
};

/** Every gym-scoped capability. A gym owner holds all of them. */
export const ALL_GYM_CAPABILITIES: CapabilityCode[] = Object.keys(
  CAPABILITY_CATALOG
) as CapabilityCode[];

/**
 * The front desk needs to look members up, check people in and see what is
 * owed — but never change a member, take a payment, record an expense or
 * touch a plan.
 */
export const EMPLOYEE_CAPABILITIES: CapabilityCode[] = [
  'members.view',
  'attendance.view',
  'attendance.manage',
  'billing.view',
  'notifications.view',
];

export type Role = 'platform_owner' | 'gym_owner' | 'employee';

export const ROLE_PRESETS: Record<Role, CapabilityCode[]> = {
  platform_owner: ALL_GYM_CAPABILITIES,
  gym_owner: ALL_GYM_CAPABILITIES,
  employee: EMPLOYEE_CAPABILITIES,
};

export function capabilitiesFor(role: Role): CapabilityCode[] {
  return [...ROLE_PRESETS[role]];
}
