"use client";

import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { Async, Count, Skeleton } from "@/components/skeleton";
import { BranchGridSkeleton } from "@/components/skeletons";
import { useBranches } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

export default function BranchesPage() {
  const { branches, isLoading, isError } = useBranches();
  const can = useCan();
  const totalMembers = branches.reduce((s, b) => s + b.members, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-40">
            {branches.length} locations · {totalMembers} members across branches
          </Count>
        </p>
        {can("tenancy.branches.create") && (
          <Button variant="secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add branch
          </Button>
        )}
      </div>

      <Async
        loading={isLoading}
        error={isError}
        skeleton={<BranchGridSkeleton count={branches.length || 3} />}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </div>
                <Badge tone={b.open === "24/7" ? "green" : "gray"}>
                  {b.open === "24/7" ? "Open 24/7" : `${b.open} – ${b.close}`}
                </Badge>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold tracking-tight">{b.name}</h3>
              <p className="mt-0.5 text-[12px] text-ink-faint">{b.address}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
                <span className="text-ink-soft">{b.phone}</span>
                <span className="font-medium">{b.members} members</span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[12px] text-ink-faint">
                  <span>Capacity</span>
                  <span>{Math.round((b.members / 500) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-fill-strong">
                  <div
                    className={`h-full rounded-full ${b.members > 400 ? "bg-amber" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, (b.members / 500) * 100)}%` }}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Async>

      <Card className="p-5">
        <SectionTitle title="Timezone coverage" subtitle="All locations operate on shared availability rules" />
        <Async
          loading={isLoading}
          error={isError}
          skeleton={<Skeleton className="h-8 w-64 rounded-full" />}
        >
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <span
                key={b.id}
                className="rounded-full bg-fill px-3 py-1.5 text-[12px] font-medium text-ink-soft"
              >
                {b.name} · {b.timezone}
              </span>
            ))}
          </div>
        </Async>
      </Card>
    </div>
  );
}
