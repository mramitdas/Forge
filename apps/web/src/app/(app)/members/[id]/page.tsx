"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  StatusBadge,
  Toast,
  statusTone,
} from "@/components/ui";
import { Async } from "@/components/skeleton";
import { MemberHeaderSkeleton, MemberPanelSkeleton, TimelineSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { byId, useActivateSubscription, useBranches, useMemberDetail, usePlans } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const [toast, setToast] = useState<string | null>(null);
  const {
    member,
    subs,
    invoices,
    timeline,
    memberLoading,
    memberError,
    subsLoading,
    subsError,
    timelineLoading,
    timelineError,
  } = useMemberDetail(params.id);
  const { plans } = usePlans();
  const { branches } = useBranches();
  const activate = useActivateSubscription();
  const can = useCan();

  if (!memberLoading && !member) {
    return (
      <div>
        <EmptyState title="Member not found" hint="They may have been removed." />
        <div className="text-center">
          <Link href="/members" className="text-[13px] font-medium text-accent hover:underline">
            ← Back to members
          </Link>
        </div>
      </div>
    );
  }

  const planMap = byId(plans);
  const branchMap = byId(branches);
  const branch = branchMap.get(member?.branchId ?? "");
  const plan = planMap.get(member?.planId ?? "");
  const sub = subs[0];
  const memberInvoices = invoices;

  async function activateSub() {
    if (!sub) return;
    try {
      await activate.mutateAsync(sub.id);
      setToast("Subscription activated");
    } catch {
      setToast("Could not activate subscription");
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/members" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Members
      </Link>

      <Async loading={memberLoading} error={memberError} skeleton={<MemberHeaderSkeleton />}>
        {member && (
          <Card className="p-6">
            <div className="flex flex-wrap items-start gap-5">
              <Avatar name={member.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[22px] font-semibold tracking-tight">{member.name}</h2>
                  <StatusBadge status={member.status} />
                  {member.tags.map((t) => (
                    <Badge key={t} tone={t === "PLATINUM" ? "blue" : t === "OVERDUE" ? "red" : "gray"}>
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[13px] text-ink-faint">{member.email}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
                  <span className="text-ink-soft">{member.phone}</span>
                  <span className="text-ink-faint">•</span>
                  <span className="text-ink-soft">{member.gender} · {member.age > 0 ? member.age : "—"}</span>
                  <span className="text-ink-faint">•</span>
                  <span className="text-ink-soft">{branch?.name}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {can("members.update") && (
                  <Button variant="secondary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                    Edit
                  </Button>
                )}
                {can("members.checkin") && <Button>Check in</Button>}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
              {[
                { label: "Total visits", value: String(member.visits) },
                { label: "Current streak", value: `${member.streak} days` },
                { label: "Member since", value: member.joinedAt },
                { label: "Last check-in", value: member.lastCheckIn ?? "—" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[12px] text-ink-faint">{s.label}</p>
                  <p className="mt-0.5 text-[16px] font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Async>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Subscription" action={plan ? <Badge tone={statusTone(sub?.status ?? "lead")}>{sub?.status}</Badge> : undefined} />
          <Async loading={subsLoading} error={subsError} skeleton={<MemberPanelSkeleton />}>
            {sub ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-fill px-4 py-3 glass-edge">
                  <div>
                    <p className="font-medium">{plan?.name}</p>
                    <p className="text-[12px] text-ink-faint">
                      {sub.startAt}
                      {" – "}
                      {sub.endAt}
                    </p>
                  </div>
                  <span className="text-[16px] font-semibold">{inr(sub.price)}</span>
                </div>
                {sub.status === "pending" && can("membership.subscriptions.activate") && (
                  <Button className="w-full" onClick={activateSub}>
                    Activate subscription
                  </Button>
                )}
                {sub.status === "active" && (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1">Renew</Button>
                    <Button variant="secondary" className="flex-1">Upgrade plan</Button>
                  </div>
                )}
                <p className="text-[12px] text-ink-faint">
                  {plan?.autoRenew ? "Auto-renews · cancel anytime" : "Manual renewal · expires on the end date"}
                </p>
              </div>
            ) : (
              <EmptyState title="No active subscription" hint="Assign a plan to get started." />
            )}
          </Async>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Invoices" />
          <Async loading={memberLoading} error={memberError} skeleton={<MemberPanelSkeleton />}>
            {memberInvoices.length ? (
              <div className="space-y-2">
                {memberInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href="/billing"
                    className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 hover:bg-accent-soft/40 transition-colors"
                  >
                    <div>
                      <p className="text-[13px] font-medium">{inv.number}</p>
                      <p className="text-[12px] text-ink-faint">Due {inv.dueDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-semibold">{inr(inv.total)}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No invoices" />
            )}
          </Async>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Timeline" />
        <Async loading={timelineLoading} error={timelineError} skeleton={<TimelineSkeleton rows={4} />}>
          <div className="relative space-y-0 pl-5">
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-line-strong" />
            {timeline.map((t, i) => (
              <div key={t.id} className="relative flex gap-4 pb-5">
                <span
                  className={`absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-elevated ${
                    i === 0 ? "bg-accent shadow-[0_0_10px_var(--color-glow-strong)]" : "bg-fill-strong"
                  }`}
                />
                <div>
                  <p className="text-[13px] font-medium">{t.action}</p>
                  <p className="text-[12px] text-ink-faint">{t.detail}</p>
                </div>
                <span className="ml-auto text-[12px] text-ink-faint">{t.time}</span>
              </div>
            ))}
          </div>
        </Async>
      </Card>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
