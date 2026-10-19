export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  is_platform: boolean;
  created_at: string;
}

export interface MeOut {
  user: User;
  tenant_id: string;
  tenant_name: string | null;
  is_platform: boolean;
  permissions: string[];
  branches: { id: string; name: string }[];
  must_change?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  must_change?: boolean;
}

export interface MemberOut {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  gender: string | null;
  status: string;
  is_active: boolean;
  avatar_path: string | null;
  joined_at: string | null;
  created_at: string;
  version: number;
}

export interface PlanOut {
  id: string;
  name: string;
  slug: string;
  branch_id: string | null;
  description: string | null;
  billing_period: string;
  amount_minor: number;
  entry_fee_minor: number;
  tax_rate_bp: number;
  duration_months: number | null;
  auto_renew: boolean;
  is_active: boolean;
}

export interface BranchOut {
  id: string;
  gym_id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  country_code: string | null;
  gst_number: string | null;
  timezone: string;
  is_active: boolean;
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
  lines: { id: string; description: string; quantity: number; amount_minor: number }[];
}

export interface TenantTierOut {
  tier_code: string;
  tier_name: string;
  description: string | null;
  price_minor: number | null;
  max_branches: number | null;
  max_members: number | null;
  branches_used: number;
  members_used: number;
  gym_status: string;
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

export interface PageOut<T> {
  items: T[];
  total: number | null;
  page: number;
  page_size: number;
}

export interface SubscriptionOut {
  id: string;
  member_id: string;
  plan_id: string;
  branch_id: string;
  status: string;
  start_at: string;
  end_at: string | null;
  auto_renew: boolean;
  price_minor: number;
  currency: string;
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

export interface MemberTimelineOut {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface PaymentOut {
  id: string;
  invoice_id: string;
  amount_minor: number;
  currency: string;
  method: string;
  status: string;
  gateway: string;
  gateway_ref: string | null;
  paid_at: string | null;
  failure_reason: string | null;
}

export interface PaymentCaptureResult {
  payment: PaymentOut;
  invoice: InvoiceOut;
  idempotent_replay: boolean;
}

export interface GymOut {
  id: string;
  name: string;
  slug: string;
  status: string;
  tier_code: string;
  timezone: string;
  currency: string;
  cross_branch_access: boolean;
  created_at: string;
}

export interface GymOwnerOut {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  gym_id: string;
  gym_name: string;
  gym_status: string;
  gym_tier: string;
  created_at: string | null;
}

export interface SubscriptionTierOut {
  code: string;
  name: string;
  description: string | null;
  price_minor: number | null;
  max_branches: number | null;
  max_members: number | null;
  limits: Record<string, unknown>;
  is_active: boolean;
}

export interface SubscriptionEventOut {
  id: string;
  gym_id: string;
  gym_name: string;
  actor_email: string | null;
  event_type: string;
  from_tier_code: string | null;
  to_tier_code: string;
  created_at: string;
}

export interface RevenuePointOut {
  month: string;
  revenue_minor: number;
  subscriptions_sold: number;
}

export interface SoldSubscriptionOut {
  id: string;
  member_name: string;
  plan_name: string;
  gym_name: string;
  branch_name: string;
  status: string;
  price_minor: number;
  currency: string;
  start_at: string;
}

export interface PlatformRevenueOut {
  series: RevenuePointOut[];
  sold: SoldSubscriptionOut[];
  total_minor: number;
}

export interface PlatformSummaryOut {
  gyms_total: number;
  gyms_trial: number;
  gyms_active: number;
  gyms_suspended: number;
  owners_total: number;
  active_subscriptions: number;
  mrr_minor: number;
}

export interface GymSubscriptionOut {
  gym_id: string;
  gym_name: string;
  gym_status: string;
  tier_code: string;
  tier_name: string;
  max_branches: number | null;
  max_members: number | null;
  members_count: number;
  active_subscriptions: number;
}

export interface GymSettingsOut {
  name: string;
  timezone: string;
  currency: string;
  cross_branch_access: boolean;
}

export interface RoleOut {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_editable: boolean;
  permission_codes: string[];
}

export interface PermissionOut {
  code: string;
  module: string;
  description: string;
}
