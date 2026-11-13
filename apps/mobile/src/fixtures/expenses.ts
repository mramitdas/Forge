import type { Expense, ExpenseCategory, PaymentMethod } from '@/lib/types';

const SEED: Expense[] = [
  {
    id: 'e-001',
    category: 'utilities',
    description: 'Electricity bill — October',
    date: '2026-10-05',
    amountMinor: 420000,
    method: 'netbanking',
    currency: 'INR',
  },
  {
    id: 'e-002',
    category: 'maintenance',
    description: 'Treadmill belt replacement',
    date: '2026-10-11',
    amountMinor: 185000,
    method: 'card',
    currency: 'INR',
  },
  {
    id: 'e-003',
    category: 'supplies',
    description: 'Cleaning supplies',
    date: '2026-10-19',
    amountMinor: 96000,
    method: 'upi',
    currency: 'INR',
  },
  {
    id: 'e-004',
    category: 'operations',
    description: 'Front desk cover',
    date: '2026-11-02',
    amountMinor: 60000,
    method: 'cash',
    currency: 'INR',
  },
  {
    id: 'e-005',
    category: 'other',
    description: 'Guest water bottles',
    date: '2026-11-07',
    amountMinor: 24000,
    method: 'cash',
    currency: 'INR',
  },
];

let expenses: Expense[] = [];

export function resetExpenses(): void {
  expenses = SEED.map((e) => ({ ...e }));
}

export function listExpenses(): Expense[] {
  return [...expenses].sort((a, b) => b.date.localeCompare(a.date));
}

export function addExpense(input: {
  category: ExpenseCategory;
  description: string | null;
  amountMinor: number;
  method: PaymentMethod;
  date?: string;
}): Expense {
  const expense: Expense = {
    id: `e-${String(expenses.length + 1).padStart(3, '0')}`,
    category: input.category,
    description: input.description,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    amountMinor: input.amountMinor,
    method: input.method,
    currency: 'INR',
  };
  expenses = [expense, ...expenses];
  return expense;
}

resetExpenses();
