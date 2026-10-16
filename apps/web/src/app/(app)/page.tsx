"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  StatusBadge,
  Toast,
} from "@/components/ui";
import { Async, Count, Skeleton } from "@/components/skeleton";
import {
  CheckinListSkeleton,
  NotificationListSkeleton,
  OccupancySkeleton,
  OverviewHeaderSkeleton,
  StatsGridSkeleton,
} from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { useAuth } from "@/lib/auth";
import { useBranches, useCheckinMutation, useCheckins, useMemberCtx, useNotificationsData } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const todayStr = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function OverviewHeader() {
  const { me } = useAuth();
  const can = useCan();
  const { branches, isLoading: bl, isError: be } = useBranches();
  const { items: checkins, isLoading: cl, isError: ce } = useCheckins();
  const { members: rawMembers } = useMemberCtx();
  const checkinMut = useCheckinMutation();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [source, setSource] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (open && !branchId && branches[0]) setBranchId(branches[0].id);
  }, [open, branches, branchId]);

  const member = memberId ? rawMembers.find((m) => m.id === memberId) : undefined;

  async function submitCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !(branchId || member.branch_id)) return;
    const targetBranch = branchId || member.branch_id;
    setBusy(true);
    try {
      const res = await checkinMut.mutateAsync({
        member_id: member.id,
        branch_id: targetBranch,
        source,
      });
      const outcome =
        res.result === "allowed" ? "granted" : res.result === "denied" ? "denied" : "duplicate";
      const name = member.full_name || member.first_name;
      setToast({
        type: outcome === "granted" ? "success" : outcome === "denied" ? "error" : "info",
        message: `${name} — ${
          outcome === "granted"
            ? "access granted"
            : outcome === "denied"
              ? "access denied (no active membership)"
              : "duplicate check-in"
        }`,
      });
      setOpen(false);
      setMemberId("");
    } catch {
      setToast({ type: "error", message: "Check-in failed — could not reach the server" });
    } finally {
      setBusy(false);
    }
  }

  const todayAllowed = checkins.filter(
    (c) => c.result === "granted" && c.time.startsWith("Today"),
  ).length;
  const firstName = me?.user.full_name?.split(" ")[0] ?? "there";
  const maxBranch = Math.max(...branches.map((b) => b.members), 1);
  const b0 = branches[0];
  const showOccupancy = can("tenancy.branches.view");
  const showCheckins = can("attendance.records.view");

  return (
    <>
      <Async loading={bl || cl} error={be || ce} skeleton={<OverviewHeaderSkeleton />}>
        <div className="flex items-end justify-between">
          <div>
            <p className="kicker mb-1.5">
              {todayStr()} · {b0?.name ?? "Workspace"}
            </p>
            <h2 className="font-display text-[28px] font-bold tracking-tight">
              Good morning, <span className="text-gradient">{firstName}</span>
            </h2>
            {(showOccupancy || showCheckins) && (
              <p className="mt-1.5 text-[13px] text-ink-faint">
                {showOccupancy && b0 ? (
                  <>
                    {b0.name} is{" "}
                    <span className="font-semibold text-ink-soft">
                      {Math.min(100, Math.round((b0.members / maxBranch) * 100))}% full
                    </span>{" "}
                    right now{showCheckins && " · "}
                  </>
                ) : null}
                {showCheckins && (
                  <span className="font-medium">{todayAllowed} check-ins today</span>
                )}
              </p>
            )}
          </div>
          {can("attendance.checkin") && (
            <Button onClick={() => setOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Check in member
            </Button>
          )}
        </div>
      </Async>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Check in member"
        subtitle="Search for a member to record an entry"
      >
        <form onSubmit={submitCheckin} className="space-y-4">
          <Field label="Member">
            <div className="relative">
              <Input
                placeholder="Search member…"
                value={member ? member.full_name || member.first_name : ""}
                onChange={(e) => {
                  const q = e.target.value.toLowerCase();
                  const hit = rawMembers.find((m) =>
                    (m.full_name || m.first_name).toLowerCase().includes(q),
                  );
                  setMemberId(hit?.id ?? "");
                }}
                list="overview-member-list"
                autoFocus
              />
              <datalist id="overview-member-list">
                {rawMembers.map((m) => (
                  <option key={m.id} value={m.full_name || m.first_name} />
                ))}
              </datalist>
            </div>
          </Field>
          {member && (
            <div className="flex items-center gap-3 rounded-xl bg-accent-soft/50 px-3.5 py-2.5">
              <Avatar name={member.full_name || member.first_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">
                  {member.full_name || member.first_name}
                </p>
                <p className="text-[12px] text-ink-faint">{member.email || "No email"}</p>
              </div>
              <StatusBadge status={member.status} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {branches.length > 0 && (
              <Field label="Branch">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Source">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="biometric">Biometric</option>
                <option value="qr">QR</option>
                <option value="rfid">RFID</option>
                <option value="manual">Manual</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!member || !(branchId || member.branch_id) || busy}>
              {busy ? "Checking in…" : "Check in"}
            </Button>
          </div>
        </form>
      </Modal>
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </>
  );
}

function StatsGrid() {
  const can = useCan();
  const { items: checkins, isLoading: cl, isError: ce } = useCheckins();
  const { ctx, members: rawMembers, isLoading: ml, isError: me } = useMemberCtx();

  const todayAllowed = checkins.filter(
    (c) => c.result === "granted" && c.time.startsWith("Today"),
  ).length;
  const now = Date.now();
  const DAY = 86_400_000;
  const newThisMonth = rawMembers.filter((m) => {
    const j = m.joined_at ? new Date(m.joined_at).getTime() : 0;
    return j && now - j < 30 * DAY;
  }).length;
  const revenueThisMonth = ctx.invoices
    .filter((i) => {
      if (i.status !== "paid") return false;
      const d = new Date(i.issue_date);
      const n = new Date();
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    })
    .reduce((s, i) => s + i.total_minor, 0);
  const overdueInvoices = ctx.invoices.filter(
    (i) => i.status === "open" && new Date(i.due_date).getTime() < now,
  );
  const overdueAmount = overdueInvoices.reduce((s, i) => s + i.total_minor, 0);

  const stats = [
    ...(can("members.view")
      ? [
          {
            label: "Total members",
            value: rawMembers.length.toLocaleString("en-IN"),
            delta: `+${newThisMonth}`,
            up: true,
          },
        ]
      : []),
    ...(can("attendance.records.view")
      ? [{ label: "Active today", value: String(todayAllowed), delta: "Today", up: true }]
      : []),
    ...(can("billing.invoices.view")
      ? [
          {
            label: "Monthly revenue",
            value: inr(revenueThisMonth),
            delta: "This month",
            up: true,
          },
          {
            label: "Overdue invoices",
            value: inr(overdueAmount),
            delta: `${overdueInvoices.length} open`,
            up: false,
          },
        ]
      : []),
  ];

  return (
    <Async loading={cl || ml} error={ce || me} skeleton={<StatsGridSkeleton count={4} />}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.label} className="group relative overflow-hidden p-4">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/[0.07] blur-xl transition-opacity group-hover:opacity-100 opacity-60" />
            <div className="flex items-center justify-between">
              <p className="kicker">{s.label}</p>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-fill text-ink-faint">
                {[
                  <svg key="m" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5" /><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /></svg>,
                  <svg key="c" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" strokeLinecap="round" /></svg>,
                  <svg key="r" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></svg>,
                  <svg key="t" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" strokeLinecap="round" /></svg>,
                ][i]}
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-[26px] font-bold tracking-tight">{s.value}</span>
              <span
                className={`text-[12px] font-semibold ${s.up ? "text-green" : "text-red"}`}
              >
                {s.delta}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Async>
  );
}

function RevenueCard() {
  const { ctx, isLoading, isError } = useMemberCtx();
  const revenueThisMonth = ctx.invoices
    .filter((i) => {
      if (i.status !== "paid") return false;
      const d = new Date(i.issue_date);
      const n = new Date();
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    })
    .reduce((s, i) => s + i.total_minor, 0);

  const { bars, weekTotal } = useMemo(() => {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    const sums = new Array<number>(7).fill(0);
    for (const i of ctx.invoices) {
      if (i.status !== "paid") continue;
      const d = new Date(i.issue_date);
      if (d < monday || d >= sunday) continue;
      sums[(d.getDay() + 6) % 7] += i.total_minor;
    }
    const max = Math.max(...sums, 1);
    return {
      bars: sums.map((v, idx) => ({
        d: WEEKDAYS[idx],
        amount: v,
        v: Math.round((v / max) * 100),
      })),
      weekTotal: sums.reduce((s, v) => s + v, 0),
    };
  }, [ctx.invoices]);

  return (
    <Card className="p-5 xl:col-span-2">
      <SectionTitle
        title="Revenue this week"
        subtitle={
          isLoading ? (
            <Skeleton className="h-3 w-48" />
          ) : (
            `${inr(revenueThisMonth)} collected this month`
          )
        }
        action={
          <Link href="/billing" className="text-[13px] font-medium text-accent hover:underline">
            View billing
          </Link>
        }
      />
      <Async loading={isLoading} error={isError} skeleton={<Skeleton className="h-40 w-full rounded-xl" />}>
        {weekTotal === 0 ? (
          <EmptyState
            title="No collections this week"
            hint="Paid invoices issued this week will appear here."
          />
        ) : (
          <div className="mt-4 flex h-40 items-end gap-3">
            {bars.map((b) => (
              <div key={b.d} className="group flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    title={inr(b.amount)}
                    className="w-full rounded-md bg-gradient-to-t from-accent-deep to-accent transition-all duration-200 group-hover:from-accent-deep group-hover:to-accent-hover group-hover:shadow-[0_0_18px_var(--color-glow-strong)]"
                    style={{ height: `${Math.max(4, b.v)}%` }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">{b.d}</span>
              </div>
            ))}
          </div>
        )}
      </Async>
    </Card>
  );
}

function OccupancyCard() {
  const { branches, isLoading, isError } = useBranches();
  const maxBranch = Math.max(...branches.map((b) => b.members), 1);

  return (
    <Card className="p-5">
      <SectionTitle title="Occupancy" subtitle="Members per branch" />
      <Async loading={isLoading} error={isError} skeleton={<OccupancySkeleton rows={3} />}>
        <div className="space-y-4">
          {branches.map((b) => (
            <div key={b.id}>
              <div className="mb-1 flex items-center justify-between text-[13px]">
                <span className="font-medium">{b.name}</span>
                <span className="text-ink-faint">{b.members} members</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-fill-strong">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent"
                  style={{ width: `${Math.min(100, Math.round((b.members / maxBranch) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Async>
    </Card>
  );
}

function RecentCheckinsCard() {
  const { items: checkins, isLoading, isError } = useCheckins();

  return (
    <Card className="p-5 xl:col-span-2">
      <SectionTitle
        title="Recent check-ins"
        action={
          <Link href="/checkins" className="text-[13px] font-medium text-accent hover:underline">
            View all
          </Link>
        }
      />
      <Async loading={isLoading} error={isError} skeleton={<CheckinListSkeleton rows={5} />}>
        <div className="divide-y divide-line">
          {checkins.slice(0, 5).map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={c.memberName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.memberName}</p>
                <p className="text-[12px] text-ink-faint">{c.branchName} · {c.time}</p>
              </div>
              <StatusBadge status={c.result} />
            </div>
          ))}
        </div>
      </Async>
    </Card>
  );
}

function NotificationsCard() {
  const { notifications, isLoading, isError } = useNotificationsData();

  return (
    <Card className="p-5">
      <SectionTitle
        title="Notifications"
        action={
          <Link href="/notifications" className="text-[13px] font-medium text-accent hover:underline">
            View all
          </Link>
        }
      />
      <Async loading={isLoading} error={isError} skeleton={<NotificationListSkeleton rows={4} />}>
        <div className="space-y-3">
          {notifications.slice(0, 4).map((n) => (
            <div key={n.id} className="flex gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.read ? "bg-fill-strong" : "bg-accent shadow-[0_0_10px_var(--color-glow-strong)]"
                }`}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-faint">{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      </Async>
    </Card>
  );
}

function LeaderboardBar() {
  const { items: checkins, isLoading } = useCheckins();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="blue">Leaderboard</Badge>
      <span className="text-[12px] text-ink-faint">
        <Count loading={isLoading} width="inline-block h-3 w-44">
          Top this week: {checkins[0]?.memberName ?? "—"} · {checkins.length} check-ins recorded
        </Count>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[12px] text-ink-faint">Team FORGE</span>
      </span>
    </div>
  );
}

export default function OverviewPage() {
  const can = useCan();
  const showRevenue = can("billing.invoices.view");
  const showOccupancy = can("tenancy.branches.view");
  const showCheckins = can("attendance.records.view");
  const showNotifications = can("notifications.view");

  return (
    <div className="space-y-6">
      <OverviewHeader />
      <StatsGrid />
      {(showRevenue || showOccupancy) && (
        <div className="grid gap-6 xl:grid-cols-3">
          {showRevenue && <RevenueCard />}
          {showOccupancy && <OccupancyCard />}
        </div>
      )}
      {(showCheckins || showNotifications) && (
        <div className="grid gap-6 xl:grid-cols-3">
          {showCheckins && <RecentCheckinsCard />}
          {showNotifications && <NotificationsCard />}
        </div>
      )}
      {showCheckins && <LeaderboardBar />}
    </div>
  );
}
