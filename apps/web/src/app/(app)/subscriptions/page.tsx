"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  StatusBadge,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import {
  byId,
  useActivateSubscription,
  useBranches,
  useMemberCtx,
  usePlans,
  useSubscriptionsPage,
  useTenantTier,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { PageSizeSelect } from "@/components/page-size-select";
import { usePageSize } from "@/lib/use-page-size";

type Filter = "all" | "active" | "pending" | "expired" | "cancelled";

export default function SubscriptionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("subscriptions");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const { subs, total, isLoading, isError } = useSubscriptionsPage({
    page,
    pageSize,
    status: filter === "all" ? undefined : filter,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const { members: rawMembers } = useMemberCtx();
  const { plans } = usePlans();
  const { branches } = useBranches();
  const { tier, isLoading: tierLoading } = useTenantTier();
  const activate = useActivateSubscription();
  const can = useCan();

  const memberMap = useMemo(
    () => new Map(rawMembers.map((m) => [m.id, m.full_name || m.first_name])),
    [rawMembers],
  );
  const planMap = byId(plans);
  const branchMap = byId(branches);

  const list = useMemo(
    () =>
      [...subs].sort((a, b) =>
        a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0,
      ),
    [subs],
  );

  async function activateSub(id: string) {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    try {
      await activate.mutateAsync(id);
      setToast({ type: "success", message: `${memberMap.get(sub.memberId) ?? "Member"}'s subscription activated` });
    } catch {
      setToast({ type: "error", message: "Could not activate subscription" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-16">
            {total} subscriptions
          </Count>
        </p>
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "expired", label: "Expired" },
          ]}
          value={filter}
          onChange={(v) => { setFilter(v as Filter); setPage(1); }}
        />
      </div>

      {can("membership.view") && (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="kicker">Gym plan</p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight">
              {tierLoading ? "…" : (tier?.tier_name ?? "—")}
              {tier?.description && (
                <span className="ml-2 text-[12px] font-normal text-ink-faint">
                  {tier.description}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-soft">
            <span>
              {tier?.price_minor != null ? `${inr(tier.price_minor)} / mo` : "Custom pricing"}
            </span>
            <span>
              Branches {tier?.branches_used ?? "—"}
              {tier ? ` of ${tier.max_branches ?? "∞"}` : ""}
            </span>
            <span>
              Members {tier?.members_used ?? "—"}
              {tier ? ` of ${tier.max_members ?? "∞"}` : ""}
            </span>
            <StatusBadge status={tier?.gym_status ?? "pending"} />
          </div>
        </Card>
      )}

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={7} rows={8} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const plan = planMap.get(s.planId);
                const branch = branchMap.get(s.branchId);
                return (
                  <tr key={s.id} className="group border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/members/${s.memberId}`} className="flex items-center gap-3">
                        <Avatar name={memberMap.get(s.memberId) ?? "Unknown"} size="sm" />
                        <span className="font-medium hover:text-accent">
                          {memberMap.get(s.memberId) ?? "Unknown member"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{plan?.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{branch?.code || branch?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {s.startAt} → {s.endAt}
                    </td>
                    <td className="px-4 py-3 font-medium">{inr(s.price)}</td>
                    <td className="px-5 py-3 text-right">
                      {s.status === "pending" && can("membership.manage") && (
                        <Button size="xs" onClick={() => activateSub(s.id)}>
                          Activate
                        </Button>
                      )}
                      {s.status === "expired" && (
                        <Badge tone="red">Overdue</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState title="No subscriptions in this view" />}
          {list.length > 0 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[12px] text-ink-faint">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <PageSizeSelect
                  value={pageSize}
                  onChange={(n) => { setPageSize(n); setPage(1); }}
                />
                <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </Async>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
