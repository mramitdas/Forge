export type MemberStatus = 'active' | 'pending' | 'expired';

export type Member = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  joinedAt: string;
  branchName: string;
  planId: string | null;
};

export type InvoiceStatus = 'pending' | 'overdue' | 'paid';

export type Invoice = {
  id: string;
  number: string;
  memberId: string;
  memberName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  status: InvoiceStatus;
};

export type ExpenseCategory = 'operations' | 'maintenance' | 'utilities' | 'supplies' | 'other';

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'netbanking' | 'credit' | 'wallet';

export type Expense = {
  id: string;
  category: ExpenseCategory;
  description: string | null;
  date: string;
  amountMinor: number;
  method: PaymentMethod;
  currency: string;
};

export type CheckInResult = 'allowed' | 'denied' | 'duplicate';

export type CheckIn = {
  id: string;
  memberId: string;
  memberName: string;
  at: string;
  result: CheckInResult;
  reason: string | null;
};

export type SubscriptionStatus = 'active' | 'pending' | 'expired' | 'cancelled';

export type Subscription = {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
  planPriceMinor: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: SubscriptionStatus;
  branchName: string;
};

export type Plan = {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  billingPeriod: string;
  autoRenew: boolean;
  durationMonths: number | null;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};
