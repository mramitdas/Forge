import type { Member } from '@/lib/types';

const SEED: Member[] = [
  {
    id: 'm-001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    fullName: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+91 98111 00001',
    status: 'active',
    joinedAt: '2025-01-12',
    branchName: 'Andheri',
    planId: 'p-gold',
  },
  {
    id: 'm-002',
    firstName: 'Diya',
    lastName: 'Iyer',
    fullName: 'Diya Iyer',
    email: 'diya.iyer@example.com',
    phone: '+91 98111 00002',
    status: 'active',
    joinedAt: '2025-03-04',
    branchName: 'Andheri',
    planId: 'p-silver',
  },
  {
    id: 'm-003',
    firstName: 'Kabir',
    lastName: 'Mehta',
    fullName: 'Kabir Mehta',
    email: 'kabir.mehta@example.com',
    phone: '+91 98111 00003',
    status: 'pending',
    joinedAt: '2026-11-02',
    branchName: 'Bandra',
    planId: 'p-silver',
  },
  {
    id: 'm-004',
    firstName: 'Ishita',
    lastName: 'Nair',
    fullName: 'Ishita Nair',
    email: 'ishita.nair@example.com',
    phone: '+91 98111 00004',
    status: 'expired',
    joinedAt: '2024-06-19',
    branchName: 'Andheri',
    planId: 'p-basic',
  },
  {
    id: 'm-005',
    firstName: 'Rohan',
    lastName: 'Verma',
    fullName: 'Rohan Verma',
    email: 'rohan.verma@example.com',
    phone: '+91 98111 00005',
    status: 'active',
    joinedAt: '2025-09-30',
    branchName: 'Bandra',
    planId: 'p-gold',
  },
  {
    id: 'm-006',
    firstName: 'Sneha',
    lastName: 'Kulkarni',
    fullName: 'Sneha Kulkarni',
    email: 'sneha.kulkarni@example.com',
    phone: null,
    status: 'active',
    joinedAt: '2026-02-21',
    branchName: 'Andheri',
    planId: 'p-basic',
  },
];

let members: Member[] = [];

export function resetMembers(): void {
  members = SEED.map((m) => ({ ...m }));
}

export function listMembers(query = ''): Member[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) =>
    [m.fullName, m.email ?? '', m.phone ?? ''].some((field) => field.toLowerCase().includes(q))
  );
}

export function getMember(id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

export function countMembers(): number {
  return members.length;
}

export function updateMember(id: string, patch: Partial<Member>): Member | undefined {
  const index = members.findIndex((m) => m.id === id);
  if (index === -1) return undefined;
  members[index] = { ...members[index], ...patch };
  return members[index];
}

resetMembers();
