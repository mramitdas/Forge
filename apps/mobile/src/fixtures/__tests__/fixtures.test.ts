import {
  addExpense,
  authenticate,
  billingSummary,
  FIXTURE_PASSWORD,
  listCheckIns,
  listExpenses,
  listInvoices,
  listMembers,
  listNotifications,
  listSubscriptions,
  markAllRead,
  markRead,
  payInvoice,
  recordCheckIn,
  resetFixtures,
  activateSubscription,
} from '@/fixtures';

beforeEach(() => {
  resetFixtures();
});

describe('fixture coverage', () => {
  it('covers every member status', () => {
    const statuses = new Set(listMembers().map((m) => m.status));
    expect(statuses).toEqual(new Set(['active', 'pending', 'expired']));
  });

  it('covers every invoice state', () => {
    const statuses = new Set(listInvoices().map((i) => i.status));
    expect(statuses).toEqual(new Set(['pending', 'overdue', 'paid']));
  });

  it('covers every subscription state', () => {
    const statuses = new Set(listSubscriptions().map((s) => s.status));
    expect(statuses).toEqual(new Set(['active', 'pending', 'expired', 'cancelled']));
  });

  it('covers allowed, denied and duplicate check-ins', () => {
    const results = new Set(listCheckIns(10).map((c) => c.result));
    expect(results).toEqual(new Set(['allowed', 'denied', 'duplicate']));
  });

  it('covers read and unread notifications', () => {
    const reads = new Set(listNotifications().map((n) => n.read));
    expect(reads).toEqual(new Set([true, false]));
  });
});

describe('searching', () => {
  it('matches a name, a phone or an email', () => {
    expect(listMembers('aarav').map((m) => m.id)).toEqual(['m-001']);
    expect(listMembers('98111 00003').map((m) => m.id)).toEqual(['m-003']);
    expect(listMembers('rohan.verma@example.com').map((m) => m.id)).toEqual(['m-005']);
  });

  it('returns everyone for an empty query', () => {
    expect(listMembers()).toHaveLength(6);
  });
});

describe('mutations', () => {
  it('marks an invoice paid and moves the money into collected', () => {
    const before = billingSummary();
    const invoice = listInvoices('pending')[0];
    payInvoice(invoice.id);
    expect(listInvoices('pending').find((i) => i.id === invoice.id)).toBeUndefined();
    expect(billingSummary().unpaidTotalMinor).toBeLessThan(before.unpaidTotalMinor);
  });

  it('refuses to pay an invoice twice', () => {
    const invoice = listInvoices('pending')[0];
    payInvoice(invoice.id);
    expect(() => payInvoice(invoice.id)).toThrow();
  });

  it('denies a check-in for an expired member', () => {
    const expired = listMembers().find((m) => m.status === 'expired')!;
    const checkIn = recordCheckIn(expired.id, expired.fullName, expired.status);
    expect(checkIn.result).toBe('denied');
    expect(checkIn.reason).toContain('expired');
  });

  it('allows a check-in for an active member', () => {
    const active = listMembers().find((m) => m.status === 'active')!;
    const checkIn = recordCheckIn(active.id, active.fullName, active.status);
    expect(checkIn.result).toBe('allowed');
  });

  it('activates a pending subscription', () => {
    const pending = listSubscriptions('pending')[0];
    activateSubscription(pending.id);
    expect(listSubscriptions('pending')).toHaveLength(0);
    expect(listSubscriptions('active').map((s) => s.id)).toContain(pending.id);
  });

  it('adds an expense at the top of the list', () => {
    const before = listExpenses().length;
    addExpense({
      category: 'operations',
      description: 'Test entry',
      amountMinor: 1000,
      method: 'cash',
    });
    expect(listExpenses().length).toBe(before + 1);
  });

  it('marks notifications read, one and all', () => {
    const first = listNotifications().find((n) => !n.read)!;
    markRead(first.id);
    expect(listNotifications().find((n) => n.id === first.id)!.read).toBe(true);
    markAllRead();
    expect(listNotifications().every((n) => n.read)).toBe(true);
  });

  it('restores the seeded state on reset', () => {
    payInvoice(listInvoices('pending')[0].id);
    resetFixtures();
    expect(listInvoices('pending').length).toBeGreaterThan(0);
    expect(listNotifications().some((n) => !n.read)).toBe(true);
  });
});

describe('authentication', () => {
  it('signs in a known persona with the fixture password', () => {
    const result = authenticate('owner@gym-erp.dev', FIXTURE_PASSWORD);
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong password and an unknown email', () => {
    expect(authenticate('owner@gym-erp.dev', 'nope').ok).toBe(false);
    expect(authenticate('nobody@example.com', FIXTURE_PASSWORD).ok).toBe(false);
  });
});
