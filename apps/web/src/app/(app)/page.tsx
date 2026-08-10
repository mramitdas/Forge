"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  SectionTitle,
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
import { useBranches, useCheckins, useMemberCtx, useNotificationsData } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

const revenueBars = [
  { d: "Mon", v: 62 },
  { d: "Tue", v: 74 },
  { d: "Wed", v: 55 },
  { d: "Thu", v: 88 },
  { d: "Fri", v: 71 },
  { d: "Sat", v: 94 },
  { d: "Sun", v: 46 },
];

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
  const [toast, setToast] = useState<string | null>(null);

  const todayAllowed = checkins.filter(
    (c) => c.result === "granted" && c.time.startsWith("Today"),
  ).length;
  const firstName = me?.user.full_name?.split(" ")[0] ?? "there";
  const maxBranch = Math.max(...branches.map((b) => b.members), 1);
  const b0 = branches[0];

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
            <p className="mt-1.5 text-[13px] text-ink-faint">
              {b0?.name ?? "Workspace"} is{" "}
              <span className="font-semibold text-ink-soft">
                {b0 ? Math.min(100, Math.round((b0.members / maxBranch) * 100)) : 0}% full
              </span>{" "}
              right now · {todayAllowed} check-ins today
            </p>
          </div>
          {can("members.checkin") && (
            <Button onClick={() => setToast("Member checked in successfully")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Check in member
            </Button>
          )}
        </div>
      </Async>
      {toast && <Toast type="success" message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

function StatsGrid() {
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
    {
      label: "Total members",
      value: rawMembers.length.toLocaleString("en-IN"),
      delta: `+${newThisMonth}`,
      up: true,
    },
    { label: "Active today", value: String(todayAllowed), delta: "Today", up: true },
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
        <div className="mt-4 flex h-40 items-end gap-3">
          {revenueBars.map((b) => (
            <div key={b.d} className="group flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-md bg-gradient-to-t from-accent-deep to-accent transition-all duration-200 group-hover:from-accent-deep group-hover:to-accent-hover group-hover:shadow-[0_0_18px_var(--color-glow-strong)]"
                  style={{ height: `${b.v}%` }}
                />
              </div>
              <span className="text-[11px] text-ink-faint">{b.d}</span>
            </div>
          ))}
        </div>
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
  return (
    <div className="space-y-6">
      <OverviewHeader />
      <StatsGrid />
      <div className="grid gap-6 xl:grid-cols-3">
        <RevenueCard />
        <OccupancyCard />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <RecentCheckinsCard />
        <NotificationsCard />
      </div>
      <LeaderboardBar />
    </div>
  );
}
