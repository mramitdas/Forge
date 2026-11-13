import type { AppNotification } from '@/lib/types';

const SEED: AppNotification[] = [
  {
    id: 'n-001',
    title: 'Payment received',
    body: 'Rohan Verma paid INV-1044 in full.',
    createdAt: '2026-11-13T05:52:00.000Z',
    read: false,
  },
  {
    id: 'n-002',
    title: 'Membership ending soon',
    body: 'Diya Iyer’s Silver plan ends on 15 Nov 2026.',
    createdAt: '2026-11-12T09:15:00.000Z',
    read: false,
  },
  {
    id: 'n-003',
    title: 'New member',
    body: 'Kabir Mehta joined Bandra on 2 Nov 2026.',
    createdAt: '2026-11-02T11:02:00.000Z',
    read: true,
  },
  {
    id: 'n-004',
    title: 'Failed payment',
    body: 'Aarav Sharma’s card payment for INV-1041 was declined.',
    createdAt: '2026-11-01T08:30:00.000Z',
    read: true,
  },
];

let notifications: AppNotification[] = [];

export function resetNotifications(): void {
  notifications = SEED.map((n) => ({ ...n }));
}

export function listNotifications(): AppNotification[] {
  return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCount(): number {
  return notifications.filter((n) => !n.read).length;
}

export function markRead(id: string): void {
  notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function markAllRead(): void {
  notifications = notifications.map((n) => ({ ...n, read: true }));
}

resetNotifications();
