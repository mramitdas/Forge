import type { CheckIn, CheckInResult, MemberStatus } from '@/lib/types';

const SEED: CheckIn[] = [
  {
    id: 'c-001',
    memberId: 'm-001',
    memberName: 'Aarav Sharma',
    at: '2026-11-13T06:42:00.000Z',
    result: 'allowed',
    reason: null,
  },
  {
    id: 'c-002',
    memberId: 'm-002',
    memberName: 'Diya Iyer',
    at: '2026-11-13T06:38:00.000Z',
    result: 'allowed',
    reason: null,
  },
  {
    id: 'c-003',
    memberId: 'm-004',
    memberName: 'Ishita Nair',
    at: '2026-11-13T06:31:00.000Z',
    result: 'denied',
    reason: 'Membership expired',
  },
  {
    id: 'c-004',
    memberId: 'm-005',
    memberName: 'Rohan Verma',
    at: '2026-11-13T06:20:00.000Z',
    result: 'duplicate',
    reason: 'Already checked in 40 minutes ago',
  },
  {
    id: 'c-005',
    memberId: 'm-006',
    memberName: 'Sneha Kulkarni',
    at: '2026-11-12T18:12:00.000Z',
    result: 'allowed',
    reason: null,
  },
];

let checkIns: CheckIn[] = [];

export function resetCheckIns(): void {
  checkIns = SEED.map((c) => ({ ...c }));
}

export function listCheckIns(limit = 5): CheckIn[] {
  return [...checkIns]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export function recordCheckIn(
  memberId: string,
  memberName: string,
  status: MemberStatus
): CheckIn {
  const recent = checkIns.find(
    (c) => c.memberId === memberId && Date.now() - Date.parse(c.at) < 60 * 60 * 1000
  );
  const result: CheckInResult =
    status === 'expired' ? 'denied' : recent ? 'duplicate' : 'allowed';
  const reason =
    status === 'expired'
      ? 'Membership expired'
      : recent
        ? 'Already checked in within the last hour'
        : null;
  const checkIn: CheckIn = {
    id: `c-${String(checkIns.length + 1).padStart(3, '0')}`,
    memberId,
    memberName,
    at: new Date().toISOString(),
    result,
    reason,
  };
  checkIns = [checkIn, ...checkIns];
  return checkIn;
}

resetCheckIns();
