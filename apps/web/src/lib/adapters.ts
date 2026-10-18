import { inr } from "./mock.ts";
import type {
  BranchOut,
  CheckInOut,
  InvoiceOut,
  MemberOut,
  MemberTimelineOut,
  NotificationOut,
  PlanOut,
  SubscriptionOut,
} from "./types";
import type {
  Branch,
  CheckinRecord,
  Invoice,
  Member,
  Notification,
  Plan,
  Subscription,
  TimelineEntry,
} from "./mock";

const DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtListDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function checkinTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return `Today · ${fmtTime(iso)}`;
  if (days === 1) return `Yesterday · ${fmtTime(iso)}`;
  return `${d.toLocaleDateString("en-US", { day: "numeric", month: "short" })} · ${fmtTime(iso)}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

const PERIOD: Record<string, Plan["period"]> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
};

export function toUiPlan(p: PlanOut): Plan {
  const perks = ["Unlimited visits", "All branches"];
  if (p.entry_fee_minor > 0) perks.push(`One-time entry fee ${inr(p.entry_fee_minor)}`);
  if (p.duration_months) {
    perks.push(
      `${p.duration_months} month${p.duration_months > 1 ? "s" : ""} period`,
    );
  }
  if (p.auto_renew) perks.push("Auto-renews");
  return {
    id: p.id,
    name: p.name,
    period: PERIOD[p.billing_period] ?? "monthly",
    price: p.amount_minor,
    entryFee: p.entry_fee_minor,
    taxBp: p.tax_rate_bp,
    description: p.description ?? `${p.name} membership.`,
    durationMonths: p.duration_months,
    autoRenew: p.auto_renew,
    isActive: p.is_active,
    branchId: p.branch_id,
    popular: p.auto_renew && p.billing_period === "monthly",
    perks,
  };
}

function initialsOf(m: MemberOut): string {
  const first = (m.first_name || m.full_name || "").trim();
  const last = (m.last_name || "").trim();
  const a = first.charAt(0) ?? "";
  const b = last.charAt(0) ?? "";
  return (a + b || "?").toUpperCase();
}

function memberTags(m: MemberOut, ctx: MemberCtx): string[] {
  const tags: string[] = [];
  if (m.status === "lead") tags.push("LEAD");
  const now = Date.now();
  const joined = m.joined_at ? new Date(m.joined_at).getTime() : 0;
  if (joined && now - joined < 30 * DAY) tags.push("NEW");
  const overdue = ctx.invoices.some(
    (i) =>
      i.member_id === m.id &&
      i.status === "open" &&
      new Date(i.due_date).getTime() < now,
  );
  if (overdue) tags.push("OVERDUE");
  const sub = ctx.subscriptions.find((s) => s.member_id === m.id);
  if (sub && (sub.status === "active" || sub.status === "pending") && sub.price_minor >= 90000) {
    tags.push("PLATINUM");
  }
  return tags;
}

function computeStreak(checkins: { recorded_at: string }[]): number {
  const days = new Set(
    checkins.map((c) => {
      const d = new Date(c.recorded_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * DAY);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (days.has(key)) streak += 1;
    else if (i > 0) break;
  }
  return streak;
}

export interface MemberCtx {
  subscriptions: SubscriptionOut[];
  checkins: CheckInOut[];
  invoices: InvoiceOut[];
}

export function toUiMember(m: MemberOut, ctx: MemberCtx): Member {
  const memberCheckins = ctx.checkins.filter((c) => c.member_id === m.id);
  const last = memberCheckins.length
    ? memberCheckins.reduce((a, b) =>
        new Date(a.recorded_at) > new Date(b.recorded_at) ? a : b,
      )
    : null;
  const sub = ctx.subscriptions.find((s) => s.member_id === m.id);
  return {
    id: m.id,
    name: m.full_name || `${m.first_name} ${m.last_name ?? ""}`.trim(),
    initials: initialsOf(m),
    email: m.email ?? "",
    phone: m.phone ?? "",
    countryCode: m.country_code ?? "",
    gender: m.gender ?? "—",
    age: 0,
    status: mapMemberStatus(m.status),
    isActive: m.is_active,
    avatarPath: m.avatar_path ?? null,
    branchId: m.branch_id,
    planId: sub?.plan_id ?? "",
    joinedAt: fmtListDate(m.joined_at ?? m.created_at),
    lastCheckIn: last ? checkinTimeLabel(last.recorded_at) : null,
    visits: memberCheckins.length,
    streak: computeStreak(memberCheckins),
    tags: memberTags(m, ctx),
  };
}

function mapMemberStatus(s: string): Member["status"] {
  switch (s) {
    case "active":
    case "prospect":
      return "active";
    case "frozen":
      return "paused";
    case "lapsed":
    case "cancelled":
      return "expired";
    case "lead":
      return "lead";
    default:
      return "lead";
  }
}

export function toUiSubscription(s: SubscriptionOut): Subscription {
  return {
    id: s.id,
    memberId: s.member_id,
    planId: s.plan_id,
    branchId: s.branch_id,
    status: mapSubStatus(s.status),
    startAt: fmtListDate(s.start_at),
    endAt: s.end_at ? fmtListDate(s.end_at) : "—",
    startAtIso: s.start_at,
    endAtIso: s.end_at ?? null,
    price: s.price_minor,
    currency: s.currency,
  };
}

function mapSubStatus(s: string): Subscription["status"] {
  switch (s) {
    case "active":
    case "frozen":
    case "expired":
    case "cancelled":
      return s === "frozen" ? "paused" : s;
    case "pending":
    default:
      return "pending";
  }
}

export function toUiInvoice(i: InvoiceOut): Invoice {
  const now = Date.now();
  let status: Invoice["status"];
  if (i.status === "paid") status = "paid";
  else if (i.status === "void") status = "void";
  else if (
    (i.status === "open" || i.status === "partial") &&
    new Date(i.due_date).getTime() < now
  )
    status = "overdue";
  else status = "open";
  return {
    id: i.id,
    number: i.number,
    memberId: i.member_id,
    status,
    issueDate: fmtShortDate(i.issue_date),
    dueDate: fmtShortDate(i.due_date),
    currency: i.currency,
    lines: i.lines.map((l) => ({
      description: l.description,
      qty: l.quantity,
      amount: l.amount_minor,
    })),
    subtotal: i.subtotal_minor,
    tax: i.tax_minor,
    total: i.total_minor,
    paid: i.paid_minor,
  };
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  qr: "QR",
  rfid: "RFID",
  kiosk: "Kiosk",
  biometric: "Biometric",
};

export function toUiCheckin(
  c: CheckInOut,
  memberNames: Map<string, string>,
  branchNames: Map<string, string>,
): CheckinRecord {
  return {
    id: c.id,
    memberId: c.member_id,
    memberName: memberNames.get(c.member_id) ?? "Unknown member",
    branchName: branchNames.get(c.branch_id) ?? "Unknown branch",
    time: checkinTimeLabel(c.recorded_at),
    source: SOURCE_LABEL[c.source] ?? c.source,
    result: c.result === "allowed" ? "granted" : c.result === "denied" ? "denied" : "duplicate",
    reason: c.reason,
  };
}

export function toUiNotification(n: NotificationOut): Notification {
  const title = n.title.toLowerCase();
  let type: Notification["type"] = "system";
  if (n.type === "billing" || title.includes("payment") || title.includes("invoice")) {
    type = "payment";
  } else if (title.includes("renew") || title.includes("expir")) {
    type = "renewal";
  } else if (title.includes("check-in") || title.includes("checkin")) {
    type = "checkin";
  }
  return {
    id: n.id,
    type,
    title: n.title,
    message: n.body ?? "",
    time: relativeTime(n.created_at),
    read: n.read_at != null,
  };
}

function prettifyAction(action: string): string {
  const cleaned = action.replace(/^members\./, "").replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned;
}

export function toUiTimeline(t: MemberTimelineOut): TimelineEntry {
  const payload = t.payload ?? {};
  let detail = "";
  if (typeof payload.plan_name === "string") detail = `Plan: ${payload.plan_name}`;
  else if (typeof payload.amount_minor === "number") detail = inr(payload.amount_minor);
  else if (typeof payload.status === "string") detail = `Status: ${payload.status}`;
  const actor = typeof payload.actor_name === "string" ? payload.actor_name : null;
  let who = "";
  if (t.action === "member.updated" && Array.isArray(payload.fields)) {
    const labels = (payload.fields as string[]).map(
      (f) => f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    );
    who = `Updated by ${actor ?? "unknown"} — changed: ${labels.join(", ")}`;
  } else if (actor) {
    who = `By ${actor}`;
  }
  return {
    id: t.id,
    action: prettifyAction(t.action),
    detail: who || detail,
    time: relativeTime(t.created_at),
  };
}

export function toUiBranch(b: BranchOut, memberCount: number): Branch {
  return {
    id: b.id,
    name: b.name,
    code: b.code ?? "",
    address: b.address ?? "—",
    phone: b.phone ?? "—",
    country_code: b.country_code ?? "",
    gst_number: b.gst_number ?? "",
    timezone: b.timezone,
    members: memberCount,
    is_active: b.is_active,
    open: "05:00",
    close: "23:00",
  };
}
