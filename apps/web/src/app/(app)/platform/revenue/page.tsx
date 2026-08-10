"use client";

import { Card, EmptyState } from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { BarChartSkeleton, TableSkeleton } from "@/components/skeletons";
import { usePlatformRevenue } from "@/lib/hooks";
import type { SoldSubscriptionOut } from "@/lib/types";

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor);
}

function shortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function MoMChart() {
  const { revenue, isLoading, isError } = usePlatformRevenue();
  const currency = revenue?.sold[0]?.currency ?? "INR";
  const max = Math.max(...(revenue?.series.map((p) => p.revenue_minor) ?? []), 1);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Subscription revenue</h3>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          Sales by month across every gym on the platform
        </p>
      </div>
      <Async loading={isLoading} error={isError} skeleton={<BarChartSkeleton />}>
        <div className="space-y-5 p-5">
          <div className="flex items-end justify-between">
            <p className="text-[24px] font-semibold tracking-tight">
              <Count loading={isLoading} width="inline-block h-5 w-32">
                {money(revenue?.total_minor ?? 0, currency)}
              </Count>
            </p>
            <p className="text-[12px] text-ink-faint">last 12 months</p>
          </div>
          <div className="flex h-44 items-end gap-2">
            {(revenue?.series ?? []).map((p) => {
              const h = max > 0 ? Math.max((p.revenue_minor / max) * 100, 2) : 2;
              const current = p.revenue_minor > 0;
              return (
                <div
                  key={p.month}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                  title={`${shortLabel(p.month)}: ${money(p.revenue_minor, currency)} · ${p.subscriptions_sold} sold`}
                >
                  <div
                    className={`w-full rounded-md transition-colors ${
                      current ? "bg-accent group-hover:bg-accent-deep" : "bg-fill"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[10px] font-medium text-ink-faint">
                    {shortLabel(p.month)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Async>
    </Card>
  );
}

function SoldList({ sold }: { sold: SoldSubscriptionOut[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Subscriptions sold</h3>
        <p className="mt-0.5 text-[12px] text-ink-faint">Latest member subscriptions first</p>
      </div>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
            <th className="px-5 py-3 font-medium">Member</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Gym / branch</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-5 py-3 text-right font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {sold.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0 hover:bg-accent-soft/40">
              <td className="px-5 py-3 font-medium">{s.member_name}</td>
              <td className="px-4 py-3">{s.plan_name}</td>
              <td className="px-4 py-3 text-ink-soft">{s.gym_name} · {s.branch_name}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                    s.status === "active" ? "bg-green-soft text-green" : "bg-fill text-ink-soft"
                  }`}
                >
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-soft">
                {new Date(s.start_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </td>
              <td className="px-5 py-3 text-right font-medium">{money(s.price_minor, s.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sold.length === 0 && <EmptyState title="No subscriptions sold yet" />}
    </Card>
  );
}

export default function PlatformRevenuePage() {
  const { revenue, isLoading, isError } = usePlatformRevenue();

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-faint">
        <Count loading={isLoading} width="inline-block h-3 w-56">
          {revenue?.sold.length ?? 0} subscriptions sold across the platform
        </Count>
      </p>
      <MoMChart />
      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={6} rows={4} />}>
        <SoldList sold={revenue?.sold ?? []} />
      </Async>
    </div>
  );
}
