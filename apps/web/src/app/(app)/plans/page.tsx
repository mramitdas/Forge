"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Modal,
  Select,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { PlanGridSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { useBranches, useMemberCtx, usePlans, useSubscribe } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

const periodLabel: Record<string, string> = {
  monthly: "per month",
  quarterly: "per quarter",
  yearly: "per year",
};

export default function PlansPage() {
  const [subscribeTo, setSubscribeTo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ memberId: "", branchId: "" });

  const { plans, isLoading, isError } = usePlans();
  const { branches } = useBranches();
  const { members: rawMembers } = useMemberCtx();
  const subscribe = useSubscribe();
  const can = useCan();

  const selected = subscribeTo ? plans.find((p) => p.id === subscribeTo) : null;
  const memberOptions = rawMembers
    .filter((m) => m.status !== "lead")
    .map((m) => ({ id: m.id, name: m.full_name || m.first_name }));

  async function subscribePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !form.memberId || !form.branchId) return;
    try {
      await subscribe.mutateAsync({
        member_id: form.memberId,
        plan_id: selected.id,
        branch_id: form.branchId,
      });
      const member = memberOptions.find((m) => m.id === form.memberId);
      const tax = Math.round((selected.price * selected.taxBp) / 10000);
      const total = selected.price + selected.entryFee + tax;
      setSubscribeTo(null);
      setForm({ memberId: "", branchId: "" });
      setToast(`Subscription created for ${member?.name ?? "member"} · ${inr(total)} due`);
    } catch {
      setToast("Could not create subscription");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-40">
            {plans.length} plans · GST {plans[0]?.taxBp ? plans[0].taxBp / 100 : 18}% applies
          </Count>
        </p>
        {can("membership.plans.create") && (
          <Button variant="secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New plan
          </Button>
        )}
      </div>

      <Async
        loading={isLoading}
        error={isError}
        skeleton={<PlanGridSkeleton count={plans.length || 5} />}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card
              key={p.id}
              className={`relative p-6 transition-shadow hover:shadow-md ${
                p.popular ? "ring-2 ring-accent" : ""
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                  Most popular
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight">{p.name}</h3>
                  <p className="mt-0.5 text-[12px] text-ink-faint">{p.description}</p>
                </div>
                <Badge tone="gray">{periodLabel[p.period]}</Badge>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[26px] font-semibold tracking-tight">{inr(p.price)}</span>
                <span className="text-[12px] text-ink-faint">/ {periodLabel[p.period].replace("per ", "")}</span>
              </div>
              {p.entryFee > 0 && (
                <p className="mt-1 text-[12px] text-ink-faint">+ {inr(p.entryFee)} one-time entry fee</p>
              )}
              <ul className="mt-4 space-y-1.5">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-[13px] text-ink-soft">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-green" strokeWidth="2.4">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {perk}
                  </li>
                ))}
              </ul>
              {can("membership.subscriptions.activate") && (
                <Button
                  variant={p.popular ? "primary" : "secondary"}
                  className="mt-5 w-full"
                  onClick={() => {
                    setForm({ memberId: "", branchId: branches[0]?.id ?? "" });
                    setSubscribeTo(p.id);
                  }}
                >
                  Subscribe
                </Button>
              )}
            </Card>
          ))}
        </div>
      </Async>

      <Modal
        open={subscribeTo !== null}
        onClose={() => setSubscribeTo(null)}
        title={`Subscribe to ${selected?.name ?? ""}`}
        subtitle={selected ? `${inr(selected.price)} · ${periodLabel[selected.period]}` : undefined}
      >
        <form onSubmit={subscribePlan} className="space-y-4">
          <Field label="Member">
            <Select
              required
              value={form.memberId}
              onChange={(e) => setForm({ ...form, memberId: e.target.value })}
            >
              <option value="">Select a member…</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Branch">
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          {selected && selected.entryFee > 0 && (
            <div className="rounded-xl bg-amber-soft px-4 py-3 text-[13px] text-amber">
              Includes a one-time {inr(selected.entryFee)} entry fee. GST {selected.taxBp / 100}% applies.
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSubscribeTo(null)}>
              Cancel
            </Button>
            <Button type="submit">Create subscription</Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
