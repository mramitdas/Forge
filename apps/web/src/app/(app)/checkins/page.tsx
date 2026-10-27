"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  StatusBadge,
  Toast,
} from "@/components/ui";
import { Async, Skeleton, SkeletonText } from "@/components/skeleton";
import { CheckinListSkeleton } from "@/components/skeletons";
import { type CheckinResult } from "@/lib/mock";
import {
  byId,
  useBranches,
  useCheckinMutation,
  useCheckins,
  useMemberCtx,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useInFlight } from "@/lib/inflight";

const sourceLabels = ["Biometric", "QR", "RFID", "Manual"];
const sourceValue: Record<string, string> = {
  Biometric: "biometric",
  QR: "qr",
  RFID: "rfid",
  Manual: "manual",
};
const sourceLabel: Record<string, string> = Object.fromEntries(
  Object.entries(sourceValue).map(([k, v]) => [v, k]),
);

function resultMeta(result: CheckinResult) {
  switch (result) {
    case "granted":
      return {
        title: "Access granted",
        sub: "Have a great workout!",
        tone: "bg-green-soft text-green",
        icon: (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };
    case "denied":
      return {
        title: "Access denied",
        sub: "No active membership",
        tone: "bg-red-soft text-red",
        icon: (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ),
      };
    default:
      return {
        title: "Duplicate check-in",
        sub: "Checked in recently — this visit was not recorded",
        tone: "bg-amber-soft text-amber",
        icon: (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" strokeLinecap="round" />
          </svg>
        ),
      };
  }
}

function QuickCheckinCard() {
  const [memberId, setMemberId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [source, setSource] = useState("manual");
  const [result, setResult] = useState<{
    memberId: string;
    memberName: string;
    result: CheckinResult;
    time: string;
  } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const { branches, isLoading: bl, isError: be } = useBranches();
  const { members: rawMembers, isLoading: ml, isError: me } = useMemberCtx();
  const doCheckinApi = useCheckinMutation();
  const can = useCan();
  const checkGuard = useInFlight();

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const memberMap = useMemo(
    () => new Map(rawMembers.map((m) => [m.id, m])),
    [rawMembers],
  );
  const member = memberId ? memberMap.get(memberId) : undefined;

  async function doCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    await checkGuard.run(async () => {
      try {
        const res = await doCheckinApi.mutateAsync({
          member_id: member.id,
          branch_id: branchId,
          source,
        });
        const outcome: CheckinResult =
          res.result === "allowed" ? "granted" : res.result === "denied" ? "denied" : "duplicate";
        setResult({
          memberId: member.id,
          memberName: member.full_name || member.first_name,
          result: outcome,
          time: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        });
        const message = `${member.full_name || member.first_name} — ${
          outcome === "granted"
            ? "access granted"
            : outcome === "denied"
              ? `access denied (${res.reason ?? "no active membership"})`
              : `duplicate check-in${res.reason ? ` · ${res.reason}` : ""}`
        }`;
        setToast({
          type: outcome === "granted" ? "success" : outcome === "denied" ? "error" : "info",
          message,
        });
      } catch {
        setToast({ type: "error", message: "Check-in failed — could not reach the server" });
      }
    });
  }

  const meta = result ? resultMeta(result.result) : null;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-fill px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight">Quick check-in</h2>
          <p className="text-[12px] text-ink-faint">Scan or search for a member</p>
        </div>
        <Async loading={bl || ml} error={be || me} skeleton={
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <SkeletonText width="w-14" height="h-2.5" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <SkeletonText width="w-14" height="h-2.5" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <SkeletonText width="w-14" height="h-2.5" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        }>
          <form onSubmit={doCheckin} className="space-y-4 p-5">
            <Field label="Member">
              <div className="relative">
                <Input
                  id="checkin-member-search"
                  name="checkin-member-search"
                  aria-label="Member"
                  placeholder="Search member…"
                  value={member?.full_name ?? ""}
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase();
                    const hit = rawMembers.find((m) =>
                      (m.full_name || m.first_name).toLowerCase().includes(q),
                    );
                    setMemberId(hit?.id ?? "");
                  }}
                  list="member-list"
                />
                <datalist id="member-list">
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
                  <p className="truncate text-[13px] font-medium">{member.full_name || member.first_name}</p>
                  <p className="text-[12px] text-ink-faint">
                    {member.phone
                      ? member.phone.startsWith("+")
                        ? member.phone
                        : `${member.country_code || "+91"} ${member.phone}`.trim()
                      : "No phone"}
                  </p>
                </div>
                <StatusBadge status={member.status} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Branch">
                <Select id="checkin-branch" aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Source">
                <Select id="checkin-source" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
                  {sourceLabels.map((s) => (
                    <option key={s} value={sourceValue[s]}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" size="lg" className="w-full rounded-xl" disabled={!member || checkGuard.busy}>
              Check in
            </Button>
          </form>
        </Async>
      </Card>

      {result && meta && (
        <Card className="overflow-hidden">
          <div className={`flex items-center gap-4 p-5 ${meta.tone} animate-modal-in`}>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/30 text-white shadow-[0_2px_10px_var(--color-shadow)]">
              {meta.icon}
            </div>
            <div>
              <h3 className="text-[18px] font-semibold tracking-tight">{meta.title}</h3>
              <p className="text-[13px] opacity-80">{meta.sub}</p>
              <p className="mt-0.5 text-[12px] opacity-70">
                {result.memberName} · {result.time} · {sourceLabel[source] ?? source}
              </p>
            </div>
          </div>
        </Card>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </>
  );
}

function RecentActivity() {
  const [filter, setFilter] = useState<"all" | CheckinResult>("all");
  const { items: checkins, isLoading, isError } = useCheckins();

  const recent = useMemo(() => {
    if (filter === "all") return checkins;
    return checkins.filter((c) => c.result === filter);
  }, [filter, checkins]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Recent activity</h2>
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "granted", label: "Granted" },
            { value: "denied", label: "Denied" },
            { value: "duplicate", label: "Duplicates" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <Async loading={isLoading} error={isError} skeleton={<CheckinListSkeleton rows={6} />}>
        <div className="divide-y divide-line">
          {recent.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={c.memberName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.memberName}</p>
                <p className="text-[12px] text-ink-faint">
                  {c.branchName} · {c.time} · {c.source}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.reason && <span className="text-[12px] text-ink-faint">{c.reason}</span>}
                <StatusBadge status={c.result} />
              </div>
            </div>
          ))}
          {recent.length === 0 && <EmptyState title="Nothing here yet" />}
        </div>
      </Async>
    </Card>
  );
}

export default function CheckinsPage() {
  const can = useCan();
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="space-y-6 xl:col-span-2">
        {can("attendance.manage") && <QuickCheckinCard />}
      </div>
      <div className="xl:col-span-3">
        <RecentActivity />
      </div>
    </div>
  );
}
