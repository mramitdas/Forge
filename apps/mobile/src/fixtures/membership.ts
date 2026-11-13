import type { Plan, Subscription, SubscriptionStatus } from '@/lib/types';

export const PLANS: Plan[] = [
  {
    id: 'p-basic',
    name: 'Basic',
    priceMinor: 120000,
    currency: 'INR',
    billingPeriod: 'monthly',
    autoRenew: false,
    durationMonths: 1,
  },
  {
    id: 'p-silver',
    name: 'Silver',
    priceMinor: 180000,
    currency: 'INR',
    billingPeriod: 'monthly',
    autoRenew: true,
    durationMonths: 1,
  },
  {
    id: 'p-gold',
    name: 'Gold',
    priceMinor: 250000,
    currency: 'INR',
    billingPeriod: 'monthly',
    autoRenew: true,
    durationMonths: 3,
  },
];

const SEED: Subscription[] = [
  {
    id: 's-001',
    memberId: 'm-001',
    memberName: 'Aarav Sharma',
    planId: 'p-gold',
    planName: 'Gold',
    planPriceMinor: 250000,
    currency: 'INR',
    startDate: '2026-09-01',
    endDate: '2026-11-30',
    autoRenew: true,
    status: 'active',
    branchName: 'Andheri',
  },
  {
    id: 's-002',
    memberId: 'm-002',
    memberName: 'Diya Iyer',
    planId: 'p-silver',
    planName: 'Silver',
    planPriceMinor: 180000,
    currency: 'INR',
    startDate: '2026-10-15',
    endDate: '2026-11-15',
    autoRenew: true,
    status: 'active',
    branchName: 'Andheri',
  },
  {
    id: 's-003',
    memberId: 'm-003',
    memberName: 'Kabir Mehta',
    planId: 'p-silver',
    planName: 'Silver',
    planPriceMinor: 180000,
    currency: 'INR',
    startDate: '2026-11-20',
    endDate: '2026-12-20',
    autoRenew: false,
    status: 'pending',
    branchName: 'Bandra',
  },
  {
    id: 's-004',
    memberId: 'm-004',
    memberName: 'Ishita Nair',
    planId: 'p-basic',
    planName: 'Basic',
    planPriceMinor: 120000,
    currency: 'INR',
    startDate: '2025-06-19',
    endDate: '2025-07-19',
    autoRenew: false,
    status: 'expired',
    branchName: 'Andheri',
  },
  {
    id: 's-005',
    memberId: 'm-005',
    memberName: 'Rohan Verma',
    planId: 'p-gold',
    planName: 'Gold',
    planPriceMinor: 250000,
    currency: 'INR',
    startDate: '2026-08-02',
    endDate: null,
    autoRenew: true,
    status: 'cancelled',
    branchName: 'Bandra',
  },
];

let subscriptions: Subscription[] = [];

export function resetSubscriptions(): void {
  subscriptions = SEED.map((s) => ({ ...s }));
}

export function listSubscriptions(filter: SubscriptionStatus | 'all' = 'all'): Subscription[] {
  if (filter === 'all') return subscriptions;
  return subscriptions.filter((s) => s.status === filter);
}

export function getSubscription(id: string): Subscription | undefined {
  return subscriptions.find((s) => s.id === id);
}

export function activateSubscription(id: string): Subscription {
  const index = subscriptions.findIndex((s) => s.id === id);
  if (index === -1) throw new Error(`No subscription ${id}`);
  subscriptions[index] = { ...subscriptions[index], status: 'active' };
  return subscriptions[index];
}

resetSubscriptions();
