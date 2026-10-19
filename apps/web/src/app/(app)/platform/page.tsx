"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState, Select, Toast } from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { GymRegistrySkeleton, StatsGridSkeleton, TableSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { useAuth } from "@/lib/auth";
import {
  useChangeGymTier,
  usePlatformGyms,
  usePlatformSubscriptions,
  usePlatformSummary,
  usePlatformTiers,
} from "@/lib/hooks";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="group relative overflow-hidden p-4">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/[0.07] blur-xl" />
      <p className="kicker">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-ink-faint">{sub}</p>}
    </Card>
  );
}

function PlatformHeader() {
  const { me } = useAuth();
  const { summary, isLoading, isError } = usePlatformSummary();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const firstName = me?.user.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="kicker mb-1.5">{today} · Platform</p>
        <h2 className="font-display text-[28px] font-bold tracking-tight">
          Good morning, <span className="text-gradient">{firstName}</span>
        </h2>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-56">
            {summary?.gyms_total ?? 0} gyms on the platform ·{" "}
            {summary?.owners_total ?? 0} gym owners
          </Count>
        </p>
      </div>
    </div>
  );
}

function PlatformStats() {
  const { summary, isLoading, isError } = usePlatformSummary();

  return (
    <Async loading={isLoading} error={isError} skeleton={<StatsGridSkeleton count={4} />}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total gyms"
          value={String(summary?.gyms_total ?? 0)}
          sub={`${summary?.gyms_trial ?? 0} in trial`}
        />
        <StatCard
          label="Active gyms"
          value={String(summary?.gyms_active ?? 0)}
          sub={`${summary?.gyms_suspended ?? 0} suspended`}
        />
        <StatCard
          label="Gym owners"
          value={String(summary?.owners_total ?? 0)}
          sub="across all gyms"
        />
        <StatCard
          label="Monthly revenue"
          value={inr(summary?.mrr_minor ?? 0)}
          sub={`${summary?.active_subscriptions ?? 0} active subscriptions`}
        />
      </div>
    </Async>
  );
}

function GymSubscriptions() {
  const { subs, isLoading, isError } = usePlatformSubscriptions();
  const { tiers } = usePlatformTiers();
  const changeTier = useChangeGymTier();
  const [toast, setToast] = useState<string | null>(null);

  async function changeTierFor(gymId: string, tier_code: string) {
    try {
      await changeTier.mutateAsync({ gymId, tier_code });
      setToast("Subscription tier updated");
    } catch {
      setToast("Could not update subscription");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Gym subscriptions</h3>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-ink-faint sm:inline">
            Change a tier to upgrade or downgrade a gym&apos;s plan
          </span>
          <Link href="/platform/gyms" className="text-[12px] font-medium text-accent">
            View all gyms →
          </Link>
        </div>
      </div>
      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={5} rows={4} />}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
              <th className="px-5 py-3 font-medium">Gym</th>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-5 py-3 font-medium">Active subs</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.gym_id} className="border-b border-line last:border-0 hover:bg-accent-soft/40">
                <td className="px-5 py-3 font-medium">{s.gym_name}</td>
                <td className="px-4 py-3">
                  <Select
                    value={s.tier_code}
                    id="platform-tier-select"
                    aria-label="Tier"
                    disabled={changeTier.isPending}
                    onChange={(e) => changeTierFor(s.gym_id, e.target.value)}
                    className="h-8 w-[140px] px-2 text-[12px] capitalize"
                  >
                    {tiers
                      .filter((t) => t.is_active || t.code === s.tier_code)
                      .map((t) => (
                        <option key={t.code} value={t.code}>{t.name}</option>
                      ))}
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.gym_status === "active"
                        ? "bg-green-soft text-green"
                        : s.gym_status === "trial"
                          ? "bg-amber-soft text-amber"
                          : "bg-red-soft text-red"
                    }`}
                  >
                    {s.gym_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {s.members_count} / {s.max_members ?? "∞"}
                </td>
                <td className="px-5 py-3 text-ink-soft">{s.active_subscriptions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!subs.length && <EmptyState title="No gyms provisioned yet" />}
      </Async>
      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </Card>
  );
}

function GymRegistry() {
  const { gyms, isLoading, isError } = usePlatformGyms();

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Gym registry</h3>
      </div>
      <Async loading={isLoading} error={isError} skeleton={<GymRegistrySkeleton rows={5} />}>
        <ul className="divide-y divide-line">
          {gyms.slice(0, 5).map((g) => (
            <li key={g.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-[13px] font-medium">{g.name}</p>
                <p className="text-[12px] text-ink-faint">
                  {g.slug} · {g.tier_code} · cross-branch {g.cross_branch_access ? "on" : "off"}
                </p>
              </div>
              <Link href={`/platform/gyms`} className="text-[12px] font-medium text-accent">
                Manage →
              </Link>
            </li>
          ))}
        </ul>
      </Async>
    </Card>
  );
}

export default function PlatformPage() {
  return (
    <div className="space-y-6">
      <PlatformHeader />
      <PlatformStats />
      <GymSubscriptions />
      <GymRegistry />
    </div>
  );
}
