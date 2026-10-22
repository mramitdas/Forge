export type MemberStatus = "active" | "inactive" | "frozen";
export type PlanPeriod = "day" | "monthly" | "quarterly" | "yearly" | "pt";
export type SubStatus = "pending" | "active" | "paused" | "expired" | "cancelled";
export type InvoiceStatus = "open" | "paid" | "overdue" | "void";
export type CheckinResult = "granted" | "denied" | "duplicate";

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  country_code: string;
  gst_number: string;
  timezone: string;
  members: number;
  is_active: boolean;
  open: string;
  close: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  countryCode: string;
  gender: string;
  age: number;
  status: MemberStatus;
  rawStatus: string;
  isActive: boolean;
  avatarPath: string | null;
  branchId: string;
  planId: string;
  joinedAt: string;
  lastCheckIn: string | null;
  visits: number;
  streak: number;
  tags: string[];
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  period: PlanPeriod;
  price: number;
  entryFee: number;
  taxBp: number;
  description: string;
  durationMonths: number | null;
  autoRenew: boolean;
  isActive: boolean;
  branchId: string | null;
  popular?: boolean;
  perks: string[];
}

export interface Subscription {
  id: string;
  memberId: string;
  planId: string;
  branchId: string;
  status: SubStatus;
  startAt: string;
  endAt: string;
  startAtIso: string;
  endAtIso: string | null;
  price: number;
  currency: string;
}

export interface InvoiceLine {
  description: string;
  qty: number;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  memberId: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
}

export interface Notification {
  id: string;
  type: "payment" | "checkin" | "renewal" | "system";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export interface CheckinRecord {
  id: string;
  memberId: string;
  memberName: string;
  branchName: string;
  time: string;
  source: string;
  result: CheckinResult;
  reason: string | null;
}

export interface TimelineEntry {
  id: string;
  action: string;
  detail: string;
  time: string;
}

export function inr(minor: number): string {
  // Amounts arrive from the API in minor units (paise); divide before
  // formatting so ₹1,50,000 doesn't stand in for ₹1,500.
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
