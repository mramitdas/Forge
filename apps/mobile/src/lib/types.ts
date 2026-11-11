export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  must_change: boolean;
}

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  permissions: string[];
}

export interface BranchRef {
  id: string;
  name: string;
  timezone: string;
}

export interface MeOut {
  user: UserOut;
  tenant_id: string;
  tenant_name: string | null;
  role_name: string | null;
  is_platform: boolean;
  permissions: string[];
  branches: BranchRef[];
  must_change: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface PageOut<T> {
  items: T[];
  total: number | null;
  page: number;
  page_size: number;
}

export interface MemberOut {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  is_active: boolean;
  avatar_path: string | null;
  joined_at: string | null;
  created_at: string;
  version: number;
}

export interface CheckInOut {
  id: string;
  member_id: string;
  branch_id: string;
  recorded_at: string;
  source: string;
  result: string;
  reason: string | null;
}

export interface CheckInCreate {
  member_id: string;
  branch_id: string;
  source: string;
  device_id?: string | null;
}

export interface InvoiceOut {
  id: string;
  number: string;
  member_id: string;
  branch_id: string;
  subscription_id: string | null;
  status: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  paid_minor: number;
}

export interface InvoiceSummaryOut {
  outstanding_minor: number;
  collected_minor: number;
  overdue_minor: number;
  monthly: Record<string, number>;
}

export interface ExpenseOut {
  id: string;
  branch_id: string | null;
  category: string;
  description: string | null;
  amount_minor: number;
  currency: string;
  method: string;
  paid_at: string;
}

export interface ExpenseYearOut {
  monthly: Record<string, number>;
  total: number;
  expenses: ExpenseOut[];
  page: number;
  page_size: number;
}

export interface ExpenseCreate {
  category: string;
  description?: string | null;
  amount_minor: number;
  method: string;
  branch_id?: string | null;
  paid_at?: string | null;
}

export interface NotificationOut {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPageOut {
  items: NotificationOut[];
  total: number | null;
  page: number;
  page_size: number;
}
