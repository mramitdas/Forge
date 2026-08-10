"use client";

import { Card, cn } from "./ui";
import { Skeleton, SkeletonText } from "./skeleton";

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between">
            <SkeletonText width="w-16" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function OverviewHeaderSkeleton() {
  return (
    <div className="flex items-end justify-between">
      <div className="space-y-2">
        <SkeletonText width="w-44" />
        <Skeleton className="h-7 w-64" />
        <SkeletonText width="w-80" className="mt-1" />
      </div>
      <Skeleton className="h-9 w-36 rounded-lg" />
    </div>
  );
}

export function OccupancySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="mb-1.5 flex items-center justify-between">
            <SkeletonText width="w-28" />
            <SkeletonText width="w-16" height="h-2.5" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CheckinListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonText width="w-40" />
            <SkeletonText width="w-56" height="h-2.5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function NotificationListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonText width="w-48" />
            <SkeletonText width="w-36" height="h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BarChartSkeleton() {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-end justify-between">
        <Skeleton className="h-6 w-32" />
        <SkeletonText width="w-20" height="h-3" />
      </div>
      <div className="flex h-44 items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="skeleton w-full rounded-md"
              style={{ height: `${30 + ((i * 37) % 60)}px` }}
            />
            <SkeletonText width="w-7" height="h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PricingCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <SkeletonText width="w-12" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
          <SkeletonText width="w-40" className="mt-2" />
          <Skeleton className="mt-4 h-7 w-24" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
                <SkeletonText width="w-40" height="h-3" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-6 border-b border-line bg-fill px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-40" : "w-20")} />
        ))}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-3.5">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: Math.max(0, columns - 2) }).map((_, c) => (
              <Skeleton key={c} className="h-4 w-20" />
            ))}
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BranchGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-3 space-y-1.5">
            <SkeletonText width="w-40" height="h-4" />
            <SkeletonText width="w-52" height="h-2.5" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <SkeletonText width="w-28" />
            <SkeletonText width="w-16" />
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <SkeletonText width="w-16" height="h-2.5" />
              <SkeletonText width="w-10" height="h-2.5" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function PlanGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonText width="w-32" height="h-4" />
              <SkeletonText width="w-44" height="h-2.5" />
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <Skeleton className="h-7 w-20" />
            <SkeletonText width="w-12" height="h-2.5" />
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, k) => (
              <SkeletonText key={k} width="w-40" height="h-2.5" />
            ))}
          </div>
          <Skeleton className="mt-5 h-9 w-full rounded-lg" />
        </Card>
      ))}
    </div>
  );
}

export function RoleCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-fill px-5 py-4">
            <div className="space-y-1.5">
              <SkeletonText width="w-36" height="h-4" />
              <SkeletonText width="w-56" height="h-2.5" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <div className="grid gap-x-6 gap-y-2.5 px-5 py-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <SkeletonText width="w-40" height="h-3" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function MemberHeaderSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start gap-5">
        <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonText width="w-40" height="h-5" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonText width="w-52" height="h-2.5" />
          <div className="flex gap-4">
            <SkeletonText width="w-24" height="h-2.5" />
            <SkeletonText width="w-32" height="h-2.5" />
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <SkeletonText width="w-16" height="h-2.5" />
            <SkeletonText width="w-20" height="h-4" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function MemberPanelSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}

export function TimelineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="relative space-y-0 pl-5">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-line-strong" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="relative flex items-start gap-4 pb-5">
          <span className="absolute -left-5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-elevated bg-fill-strong" />
          <div className="space-y-1.5">
            <SkeletonText width="w-40" height="h-3" />
            <SkeletonText width="w-64" height="h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsBranchSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonText width="w-32" height="h-4" />
          <SkeletonText width="w-64" height="h-2.5" />
          <SkeletonText width="w-72" height="h-2.5" />
        </div>
        <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
      </div>
    </Card>
  );
}

export function GymRegistrySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3">
          <div className="space-y-1.5">
            <SkeletonText width="w-40" height="h-3" />
            <SkeletonText width="w-56" height="h-2.5" />
          </div>
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function InlineListSkeleton({ rows = 3, fullWidth = false }: { rows?: number; fullWidth?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-11 rounded-xl", fullWidth ? "w-full" : "w-3/4")} />
      ))}
    </div>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-canvas/85">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-[9px]" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="px-4 pb-3">
          <SkeletonText width="w-24" height="h-2.5" />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2">
              <Skeleton className="h-[18px] w-[18px] rounded-md" />
              <SkeletonText width="w-28" height="h-3" />
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-fill px-2.5 py-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <SkeletonText width="w-24" height="h-3" />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-6">
          <SkeletonText width="w-24" height="h-4" />
          <SkeletonText width="w-32" height="h-3" />
        </header>
        <main className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div className="space-y-2">
            <SkeletonText width="w-44" height="h-2.5" />
            <Skeleton className="h-7 w-64" />
            <SkeletonText width="w-80" height="h-3" />
          </div>
          <StatsGridSkeleton count={4} />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
      </div>
    </div>
  );
}
