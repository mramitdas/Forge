"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "./api";
import { useCan } from "./permissions";
import {
  toUiBranch,
  toUiCheckin,
  toUiInvoice,
  toUiMember,
  toUiNotification,
  toUiPlan,
  toUiSubscription,
  toUiTimeline,
  type MemberCtx,
} from "./adapters";
import type {
  BranchOut,
  CheckInOut,
  ExpenseOut,
  GymOut,
  GymOwnerOut,
  GymSettingsOut,
  GymSubscriptionOut,
  InvoiceOut,
  MemberOut,
  MemberTimelineOut,
  NotificationOut,
  PageOut,
  PaymentCaptureResult,
  PermissionOut,
  PlanOut,
  PlatformRevenueOut,
  PlatformSummaryOut,
  RoleOut,
  SubscriptionEventOut,
  SubscriptionOut,
  SubscriptionTierOut,
  TokenResponse,
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

export function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

async function fetchPaged<T>(path: string, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 100;
  for (let page = 1; page <= maxPages; page++) {
    const res = await apiFetch<PageOut<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=${pageSize}`,
    );
    out.push(...res.items);
    if (!res.total || res.total <= out.length) break;
  }
  return out;
}

/* ────────────────────────────────────────────── data hooks ───── */

export function useBranches(): {
  branches: Branch[];
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiFetch<BranchOut[]>("/branches"),
    enabled: can("tenancy.branches.view"),
  });
  const membersQ = useQuery({
    queryKey: ["members", "all"],
    queryFn: () => fetchPaged<MemberOut>("/members"),
    enabled: can("members.view"),
  });

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of membersQ.data ?? []) {
      counts.set(m.branch_id, (counts.get(m.branch_id) ?? 0) + 1);
    }
    return {
      branches: (branchesQ.data ?? []).map((b) =>
        toUiBranch(b, counts.get(b.id) ?? 0),
      ),
      isLoading: branchesQ.isLoading || membersQ.isLoading,
      isError: branchesQ.isError || membersQ.isError,
    };
  }, [branchesQ.data, membersQ.data, branchesQ.isLoading, membersQ.isLoading, branchesQ.isError, membersQ.isError]);
}

export function usePlans(): { plans: Plan[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiFetch<PlanOut[]>("/plans"),
  });
  return useMemo(
    () => ({ plans: (q.data ?? []).map(toUiPlan), isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug: string;
      branch_id?: string | null;
      description?: string;
      billing_period: string;
      amount_minor: number;
      entry_fee_minor?: number;
      tax_rate_bp?: number;
      duration_months?: number | null;
      auto_renew?: boolean;
    }) => apiFetch<PlanOut>("/plans", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      planId: string;
      body: {
        name?: string;
        branch_id?: string | null;
        description?: string;
        billing_period?: string;
        amount_minor?: number;
        entry_fee_minor?: number;
        tax_rate_bp?: number;
        duration_months?: number | null;
        auto_renew?: boolean;
        is_active?: boolean;
      };
    }) =>
      apiFetch<PlanOut>(`/plans/${args.planId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiFetch<void>(`/plans/${planId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      code?: string;
      address?: string;
      phone?: string;
      country_code?: string;
      gst_number?: string;
      timezone?: string;
    }) => apiFetch<BranchOut>("/branches", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      branchId: string;
      body: {
        name?: string;
        code?: string;
        address?: string;
        phone?: string;
        country_code?: string;
        gst_number?: string;
        timezone?: string;
        is_active?: boolean;
      };
    }) =>
      apiFetch<BranchOut>(`/branches/${args.branchId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId: string) =>
      apiFetch<void>(`/branches/${branchId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useMemberCtx(): {
  ctx: MemberCtx;
  members: MemberOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const membersQ = useQuery({
    queryKey: ["members", "all"],
    queryFn: () => fetchPaged<MemberOut>("/members"),
    enabled: can("members.view"),
  });
  const subsQ = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => apiFetch<SubscriptionOut[]>("/plans/subscriptions"),
    enabled: can("membership.subscriptions.view"),
  });
  const checkinsQ = useQuery({
    queryKey: ["checkins", "all"],
    queryFn: () => fetchPaged<CheckInOut>("/checkin"),
    enabled: can("attendance.records.view"),
  });
  const invoicesQ = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiFetch<InvoiceOut[]>("/invoices"),
    enabled: can("billing.invoices.view"),
  });

  return useMemo(
    () => ({
      ctx: {
        subscriptions: subsQ.data ?? [],
        checkins: checkinsQ.data ?? [],
        invoices: invoicesQ.data ?? [],
      },
      members: membersQ.data ?? [],
      isLoading:
        membersQ.isLoading || subsQ.isLoading || checkinsQ.isLoading || invoicesQ.isLoading,
      isError:
        membersQ.isError || subsQ.isError || checkinsQ.isError || invoicesQ.isError,
    }),
    [membersQ, subsQ, checkinsQ, invoicesQ],
  );
}

export interface MembersPageParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  branchId?: string;
}

export function useMembersPage(params: MembersPageParams): {
  members: Member[];
  total: number;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["members", "page", params],
    queryFn: () => {
      const sp = new URLSearchParams({
        page: String(params.page),
        page_size: String(params.pageSize),
      });
      if (params.search) sp.set("search", params.search);
      if (params.status && params.status !== "all") sp.set("status", params.status);
      if (params.branchId && params.branchId !== "all") sp.set("branch_id", params.branchId);
      return apiFetch<PageOut<MemberOut>>(`/members?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const ctxQ = useMemberCtx();

  return useMemo(() => {
    const page = q.data ?? { items: [] as MemberOut[], total: 0 };
    return {
      members: page.items.map((m) => toUiMember(m, ctxQ.ctx)),
      total: page.total ?? page.items.length,
      isLoading: q.isLoading,
      isError: q.isError || ctxQ.isError,
    };
  }, [q.data, q.isLoading, q.isError, ctxQ.ctx, ctxQ.isError]);
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      memberId: string;
      body: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        country_code?: string;
        gender?: string;
        status?: string;
        is_active?: boolean;
      };
    }) =>
      apiFetch<MemberOut>(`/members/${args.memberId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member", vars.memberId] });
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      apiFetch<void>(`/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; file: File }) => {
      const form = new FormData();
      form.append("file", args.file);
      return apiFetch<{ avatar_path: string | null }>(
        `/members/${args.memberId}/avatar`,
        { method: "PUT", body: form },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member", vars.memberId] });
    },
  });
}

export function useMemberDetail(id: string): {
  member: Member | null;
  subs: Subscription[];
  invoices: Invoice[];
  timeline: TimelineEntry[];
  isLoading: boolean;
  isError: boolean;
  memberLoading: boolean;
  memberError: boolean;
  subsLoading: boolean;
  subsError: boolean;
  timelineLoading: boolean;
  timelineError: boolean;
} {
  const memberQ = useQuery({
    queryKey: ["member", id],
    queryFn: () => apiFetch<MemberOut>(`/members/${id}`),
    enabled: !!id,
  });
  const ctxQ = useMemberCtx();
  const can = useCan();
  const subsQ = useQuery({
    queryKey: ["subscriptions", id],
    queryFn: () =>
      apiFetch<SubscriptionOut[]>(`/plans/subscriptions?member_id=${id}`),
    enabled: !!id && can("membership.subscriptions.view"),
  });
  const timelineQ = useQuery({
    queryKey: ["member", id, "timeline"],
    queryFn: () => apiFetch<MemberTimelineOut[]>(`/members/${id}/timeline`),
    enabled: !!id,
  });

  return useMemo(() => {
    const m = memberQ.data;
    const invoices = ctxQ.ctx.invoices
      .filter((i) => i.member_id === id)
      .map(toUiInvoice);
    const subs = (subsQ.data ?? []).map(toUiSubscription);
    return {
      member: m ? toUiMember(m, ctxQ.ctx) : null,
      subs,
      invoices,
      timeline: (timelineQ.data ?? []).map(toUiTimeline),
      isLoading:
        memberQ.isLoading || ctxQ.isLoading || subsQ.isLoading || timelineQ.isLoading,
      isError:
        memberQ.isError || ctxQ.isError || subsQ.isError || timelineQ.isError,
      memberLoading: memberQ.isLoading || ctxQ.isLoading,
      memberError: memberQ.isError || ctxQ.isError,
      subsLoading: subsQ.isLoading,
      subsError: subsQ.isError,
      timelineLoading: timelineQ.isLoading,
      timelineError: timelineQ.isError,
    };
  }, [memberQ.data, memberQ.isLoading, memberQ.isError, ctxQ, subsQ.data, subsQ.isLoading, subsQ.isError, timelineQ.data, timelineQ.isLoading, timelineQ.isError, id]);
}

export function useSubscriptionsData(): {
  subs: Subscription[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => apiFetch<SubscriptionOut[]>("/plans/subscriptions"),
  });
  return useMemo(
    () => ({ subs: (q.data ?? []).map(toUiSubscription), isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useCheckins(): { items: CheckinRecord[]; isLoading: boolean; isError: boolean } {
  const can = useCan();
  const q = useQuery({
    queryKey: ["checkins", "all"],
    queryFn: () => fetchPaged<CheckInOut>("/checkin"),
    enabled: can("attendance.records.view"),
  });
  const ctxQ = useMemberCtx();
  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiFetch<BranchOut[]>("/branches"),
    enabled: can("tenancy.branches.view"),
  });

  return useMemo(() => {
    const memberNames = new Map(
      ctxQ.members.map((m) => [m.id, m.full_name || m.first_name]),
    );
    const branchNames = new Map(
      (branchesQ.data ?? []).map((b) => [b.id, b.name]),
    );
    const items = (q.data ?? []).map((c) =>
      toUiCheckin(c, memberNames, branchNames),
    );
    return { items, isLoading: q.isLoading, isError: q.isError || ctxQ.isError || branchesQ.isError };
  }, [q.data, q.isLoading, q.isError, ctxQ.members, ctxQ.isError, branchesQ.data, branchesQ.isError]);
}

export function useInvoicesData(): { invoices: Invoice[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiFetch<InvoiceOut[]>("/invoices"),
  });
  return useMemo(
    () => ({ invoices: (q.data ?? []).map(toUiInvoice), isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useExpensesData(): {
  expenses: ExpenseOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["expenses"],
    queryFn: () => fetchPaged<ExpenseOut>("/expenses"),
    enabled: can("expenses.view"),
  });
  return useMemo(
    () => ({ expenses: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      category: string;
      description?: string;
      amount_minor: number;
      method: string;
      paid_at?: string;
    }) => apiFetch<ExpenseOut>("/expenses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useInvoiceDetail(id: string): {
  invoice: Invoice | null;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiFetch<InvoiceOut>(`/invoices/${id}`),
    enabled: !!id,
  });
  return useMemo(
    () => ({ invoice: q.data ? toUiInvoice(q.data) : null, isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useNotificationsData(): {
  notifications: Notification[];
  unread: number;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationOut[]>("/notifications"),
    staleTime: 0,
  });
  const unreadQ = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    staleTime: 0,
  });
  return useMemo(
    () => ({
      notifications: (q.data ?? []).map(toUiNotification),
      unread: unreadQ.data?.count ?? 0,
      isLoading: q.isLoading || unreadQ.isLoading,
      isError: q.isError || unreadQ.isError,
    }),
    [q.data, q.isLoading, q.isError, unreadQ.data, unreadQ.isLoading, unreadQ.isError],
  );
}

/* ────────────────────────────────────────────── mutations ───── */

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      first_name: string;
      last_name?: string;
      email?: string;
      phone?: string;
      country_code?: string;
      gender?: string;
      branch_id: string;
      status?: string;
    }) => apiFetch<MemberOut>("/members", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      member_id: string;
      plan_id: string;
      branch_id: string;
      start_at?: string;
    }) =>
      apiFetch<SubscriptionOut>("/plans/subscribe", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useActivateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SubscriptionOut>(`/plans/subscriptions/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["member"] });
    },
  });
}

export function useRenewSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; start_at?: string }) =>
      apiFetch<SubscriptionOut>(`/plans/subscriptions/${args.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ start_at: args.start_at ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["member"] });
    },
  });
}

export function useUpgradeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { subscriptionId: string; planId: string }) =>
      apiFetch<SubscriptionOut>(`/plans/subscriptions/${args.subscriptionId}/upgrade`, {
        method: "POST",
        body: JSON.stringify({ plan_id: args.planId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["member"] });
    },
  });
}

export function usePayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { invoice_id: string; method: string; idempotency_key: string }) =>
      apiFetch<PaymentCaptureResult>(`/invoices/${body.invoice_id}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: body.method, idempotency_key: body.idempotency_key }),
      }),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", body.invoice_id] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<InvoiceOut>(`/invoices/${invoiceId}/void`, { method: "POST" }),
    onSuccess: (_data, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

export function useCheckinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { member_id: string; branch_id: string; source: string }) =>
      apiFetch<CheckInOut>("/checkin", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<NotificationOut>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/* ───────────────────────────── platform console ─────────────── */

export function usePlatformSummary(): {
  summary: PlatformSummaryOut | null;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "summary"],
    queryFn: () => apiFetch<PlatformSummaryOut>("/platform/summary"),
  });
  return useMemo(
    () => ({ summary: q.data ?? null, isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function usePlatformGyms(): { gyms: GymOut[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["platform", "gyms"],
    queryFn: () => apiFetch<GymOut[]>("/platform/gyms"),
  });
  return useMemo(
    () => ({ gyms: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function usePlatformOwners(): { owners: GymOwnerOut[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["platform", "owners"],
    queryFn: () => apiFetch<GymOwnerOut[]>("/platform/owners"),
  });
  return useMemo(
    () => ({ owners: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function usePlatformSubscriptions(): {
  subs: GymSubscriptionOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "subscriptions"],
    queryFn: () => apiFetch<GymSubscriptionOut[]>("/platform/subscriptions"),
  });
  return useMemo(
    () => ({ subs: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useProvisionGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug: string;
      owner_email: string;
      owner_name: string;
      owner_password: string;
      tier_code: string;
    }) => apiFetch<GymOut>("/platform/gyms", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useUpdateGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      gymId: string;
      body: {
        name?: string;
        timezone?: string;
        currency?: string;
        status?: string;
        tier_code?: string;
        cross_branch_access?: boolean;
      };
    }) =>
      apiFetch<GymOut>(`/platform/gyms/${args.gymId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useDeleteGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gymId: string) =>
      apiFetch<void>(`/platform/gyms/${gymId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useUpdateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      ownerId: string;
      body: {
        full_name?: string;
        email?: string;
        password?: string;
        is_active?: boolean;
      };
    }) =>
      apiFetch<GymOwnerOut>(`/platform/owners/${args.ownerId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useImpersonateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ownerId: string) =>
      apiFetch<TokenResponse>(`/platform/owners/${ownerId}/impersonate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function usePlatformTiers(): {
  tiers: SubscriptionTierOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "tiers"],
    queryFn: () => apiFetch<SubscriptionTierOut[]>("/platform/tiers"),
  });
  return useMemo(
    () => ({ tiers: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useChangeGymTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { gymId: string; tier_code: string }) =>
      apiFetch<GymSubscriptionOut>(`/platform/subscriptions/${args.gymId}`, {
        method: "PATCH",
        body: JSON.stringify({ tier_code: args.tier_code }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      code: string;
      name: string;
      description?: string | null;
      price_minor?: number | null;
      max_branches?: number;
      max_members?: number;
    }) =>
      apiFetch<SubscriptionTierOut>("/platform/tiers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "tiers"] });
    },
  });
}

export function useUpdateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      code: string;
      body: {
        name?: string;
        description?: string | null;
        price_minor?: number | null;
        max_branches?: number;
        max_members?: number;
        is_active?: boolean;
      };
    }) =>
      apiFetch<SubscriptionTierOut>(`/platform/tiers/${args.code}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "tiers"] });
      qc.invalidateQueries({ queryKey: ["platform", "gyms"] });
    },
  });
}

export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<void>(`/platform/tiers/${code}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "tiers"] });
    },
  });
}

export function useSubscriptionEvents(): {
  events: SubscriptionEventOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "subscription-events"],
    queryFn: () => apiFetch<SubscriptionEventOut[]>("/platform/subscription-events"),
  });
  return useMemo(
    () => ({ events: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function usePlatformRevenue(): {
  revenue: PlatformRevenueOut | null;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "revenue"],
    queryFn: () => apiFetch<PlatformRevenueOut>("/platform/revenue"),
  });
  return useMemo(
    () => ({ revenue: q.data ?? null, isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

/* ───────────────────────────── gym settings ─────────────────── */

export function useGymSettings(): {
  settings: GymSettingsOut | null;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<GymSettingsOut>("/settings"),
    retry: false,
  });
  return useMemo(
    () => ({ settings: q.data ?? null, isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useUpdateGymSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { cross_branch_access: boolean }) =>
      apiFetch<GymSettingsOut>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

/* ───────────────────────────── roles & permissions ──────────── */

export function useRoles(): { roles: RoleOut[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<RoleOut[]>("/permissions/roles"),
    retry: false,
  });
  return useMemo(
    () => ({ roles: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function usePermissionCatalog(): { permissions: PermissionOut[]; isLoading: boolean; isError: boolean } {
  const q = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiFetch<PermissionOut[]>("/permissions"),
    retry: false,
  });
  return useMemo(
    () => ({ permissions: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      roleId: string;
      body: { permission_codes: string[]; description?: string };
    }) =>
      apiFetch<RoleOut>(`/permissions/roles/${args.roleId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}
