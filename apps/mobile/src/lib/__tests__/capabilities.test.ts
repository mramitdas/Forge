import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ALL_GYM_CAPABILITIES,
  CAPABILITY_CATALOG,
  EMPLOYEE_CAPABILITIES,
  capabilitiesFor,
  type CapabilityCode,
} from '@/lib/capabilities';

const BACKEND_CATALOG = path.resolve(
  __dirname,
  '../../../../../backend/app/modules/identity/permissions.py'
);

function backendCodes(): string[] {
  const source = readFileSync(BACKEND_CATALOG, 'utf8');
  return [...source.matchAll(/"code":\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe('capability catalog', () => {
  it('matches the backend catalog exactly (gym scope)', () => {
    const gymScoped = backendCodes().filter((code) => !code.startsWith('platform.'));
    expect([...ALL_GYM_CAPABILITIES].sort()).toEqual(gymScoped.sort());
  });

  it('never carries a platform capability — platform tooling is web-only', () => {
    expect(Object.keys(CAPABILITY_CATALOG).some((code) => code.startsWith('platform.'))).toBe(
      false
    );
  });

  it('gives every module a view capability, and a manage capability except notifications', () => {
    const modules = Object.values(CAPABILITY_CATALOG);
    expect(modules).toContain('notifications');
    expect(modules.filter((m) => m === 'notifications')).toHaveLength(1);
    for (const module of ['tenancy', 'members', 'membership', 'billing', 'expenses', 'attendance', 'identity']) {
      expect(modules.filter((m) => m === module)).toHaveLength(2);
    }
  });
});

describe('role presets', () => {
  it('gives owners every gym capability', () => {
    expect(capabilitiesFor('gym_owner')).toEqual(ALL_GYM_CAPABILITIES);
    expect(capabilitiesFor('platform_owner')).toEqual(ALL_GYM_CAPABILITIES);
  });

  it('gives the front desk only what the job needs', () => {
    expect(EMPLOYEE_CAPABILITIES).toEqual([
      'members.view',
      'attendance.view',
      'attendance.manage',
      'billing.view',
      'notifications.view',
    ]);
  });

  it('never grants the front desk a manage capability over money, plans or members', () => {
    const employee = capabilitiesFor('employee');
    expect(employee).not.toContain('members.manage');
    expect(employee).not.toContain('billing.manage');
    expect(employee).not.toContain('expenses.view');
    expect(employee).not.toContain('membership.view');
    expect(employee).not.toContain('tenancy.manage');
  });

  it('returns a copy so callers cannot mutate the preset', () => {
    const first = capabilitiesFor('employee');
    first.push('identity.manage');
    expect(capabilitiesFor('employee')).not.toContain('identity.manage');
  });

  it('types every preset code as a known capability', () => {
    const known = Object.keys(CAPABILITY_CATALOG) as CapabilityCode[];
    for (const code of capabilitiesFor('employee')) expect(known).toContain(code);
  });
});
