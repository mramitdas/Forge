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
  useSubscriptionsData,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

type Filter = "all" | "active" | "pending" | "expired" | "cancelled";

export default function SubscriptionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const { subs, isLoading, isError } = useSubscriptionsData();
  const { members: rawMembers } = useMemberCtx();
  const { plans } = usePlans();
  const { branches } = useBranches();
  const activate = useActivateSubscription();
  const can = useCan();

  const memberMap = useMemo(
    () => new Map(rawMembers.map((m) => [m.id, m.full_name || m.first_name])),
    [rawMembers],
  );
  const planMap = byId(plans);
  const branchMap = byId(branches);

  const list = useMemo(() => {
    const sorted = [...subs].sort((a, b) =>
      a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0,
    );
    return filter === "all" ? sorted : sorted.filter((s) => s.status === filter);
  }, [filter, subs]);

  async function activateSub(id: string) {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    try {
      await activate.mutateAsync(id);
      setToast(`${memberMap.get(sub.memberId) ?? "Member"}'s subscription activated`);
    } catch {
      setToast("Could not activate subscription");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-16">
            {subs.length} subscriptions
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
          onChange={setFilter}
        />
      </div>

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
                      {s.status === "pending" && can("membership.subscriptions.activate") && (
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
        </Card>
      </Async>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
