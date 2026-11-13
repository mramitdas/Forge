import type { Invoice, InvoiceStatus } from '@/lib/types';

const SEED: Invoice[] = [
  {
    id: 'i-001',
    number: 'INV-1041',
    memberId: 'm-001',
    memberName: 'Aarav Sharma',
    issueDate: '2026-10-01',
    dueDate: '2026-10-08',
    currency: 'INR',
    totalMinor: 250000,
    paidMinor: 0,
    status: 'overdue',
  },
  {
    id: 'i-002',
    number: 'INV-1042',
    memberId: 'm-002',
    memberName: 'Diya Iyer',
    issueDate: '2026-11-01',
    dueDate: '2026-11-10',
    currency: 'INR',
    totalMinor: 180000,
    paidMinor: 0,
    status: 'pending',
  },
  {
    id: 'i-003',
    number: 'INV-1043',
    memberId: 'm-003',
    memberName: 'Kabir Mehta',
    issueDate: '2026-10-05',
    dueDate: '2026-10-12',
    currency: 'INR',
    totalMinor: 180000,
    paidMinor: 0,
    status: 'overdue',
  },
  {
    id: 'i-004',
    number: 'INV-1044',
    memberId: 'm-005',
    memberName: 'Rohan Verma',
    issueDate: '2026-11-02',
    dueDate: '2026-11-09',
    currency: 'INR',
    totalMinor: 250000,
    paidMinor: 250000,
    status: 'paid',
  },
  {
    id: 'i-005',
    number: 'INV-1045',
    memberId: 'm-006',
    memberName: 'Sneha Kulkarni',
    issueDate: '2026-11-06',
    dueDate: '2026-11-13',
    currency: 'INR',
    totalMinor: 120000,
    paidMinor: 0,
    status: 'pending',
  },
];

let invoices: Invoice[] = [];

export function resetInvoices(): void {
  invoices = SEED.map((i) => ({ ...i }));
}

export function listInvoices(filter: InvoiceStatus | 'all' = 'all'): Invoice[] {
  if (filter === 'all') return invoices;
  return invoices.filter((i) => i.status === filter);
}

export function getInvoice(id: string): Invoice | undefined {
  return invoices.find((i) => i.id === id);
}

export function billingSummary(): { unpaidTotalMinor: number; overdueTotalMinor: number } {
  const unpaid = invoices.filter((i) => i.status !== 'paid');
  return {
    unpaidTotalMinor: unpaid.reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0),
    overdueTotalMinor: invoices
      .filter((i) => i.status === 'overdue')
      .reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0),
  };
}

export function payInvoice(id: string): Invoice {
  const index = invoices.findIndex((i) => i.id === id);
  if (index === -1) throw new Error(`No invoice ${id}`);
  const invoice = invoices[index];
  if (invoice.status === 'paid') throw new Error('Invoice is already paid');
  invoices[index] = {
    ...invoice,
    paidMinor: invoice.totalMinor,
    status: 'paid',
  };
  return invoices[index];
}

resetInvoices();
