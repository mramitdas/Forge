import { capabilitiesFor, type CapabilityCode, type Role } from '@/lib/capabilities';

export type FixtureSession = {
  email: string;
  name: string;
  role: Role;
  capabilities: CapabilityCode[];
  gymName: string;
  branchName: string;
  mustResetPassword: boolean;
};

const PLATFORM_OWNER: FixtureSession = {
  email: 'owner@platform.dev',
  name: 'Priya Platform',
  role: 'platform_owner',
  capabilities: capabilitiesFor('platform_owner'),
  gymName: 'All gyms',
  branchName: 'All branches',
  mustResetPassword: false,
};

const GYM_OWNER: FixtureSession = {
  email: 'owner@gym-erp.dev',
  name: 'Raghav Kapoor',
  role: 'gym_owner',
  capabilities: capabilitiesFor('gym_owner'),
  gymName: 'Iron Temple Fitness',
  branchName: 'Andheri',
  mustResetPassword: false,
};

const EMPLOYEE: FixtureSession = {
  email: 'desk@gym-erp.dev',
  name: 'Neha Pillai',
  role: 'employee',
  capabilities: capabilitiesFor('employee'),
  gymName: 'Iron Temple Fitness',
  branchName: 'Andheri',
  mustResetPassword: false,
};

const FORCED_RESET: FixtureSession = {
  ...GYM_OWNER,
  email: 'reset@gym-erp.dev',
  name: 'Raghav Kapoor',
  mustResetPassword: true,
};

export const FIXTURE_SESSIONS: FixtureSession[] = [PLATFORM_OWNER, GYM_OWNER, EMPLOYEE];

export const FIXTURE_PASSWORD = 'fitwoody-pass';

export function authenticate(
  email: string,
  password: string
): { ok: true; session: FixtureSession } | { ok: false; error: string } {
  if (password !== FIXTURE_PASSWORD) {
    return { ok: false, error: 'That email or password is not right.' };
  }
  const session = [PLATFORM_OWNER, GYM_OWNER, EMPLOYEE, FORCED_RESET].find(
    (s) => s.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!session) return { ok: false, error: 'That email or password is not right.' };
  return { ok: true, session };
}
