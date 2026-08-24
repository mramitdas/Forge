"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { PlanGridSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import {
  useBranches,
  useCreatePlan,
  useDeletePlan,
  useMemberCtx,
  usePlans,
  useSubscribe,
  useUpdatePlan,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import type { Plan } from "@/lib/mock";

const periodLabel: Record<string, string> = {
  monthly: "per month",
  quarterly: "per quarter",
  yearly: "per year",
};

const periodValue: Record<string, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  yearly: "annual",
};

const emptyForm = {
  name: "",
  slug: "",
  branchId: "",
  description: "",
  billingPeriod: "monthly",
  amountMinor: "0",
  entryFeeMinor: "0",
  taxRateBp: "1800",
  durationMonths: "",
  autoRenew: true,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlansPage() {
  const [subscribeTo, setSubscribeTo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ memberId: "", branchId: "" });
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [planForm, setPlanForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [disableTarget, setDisableTarget] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const { plans, isLoading, isError } = usePlans();
  const { branches } = useBranches();
  const { members: rawMembers } = useMemberCtx();
  const subscribe = useSubscribe();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const can = useCan();

  const selected = subscribeTo ? plans.find((p) => p.id === subscribeTo) : null;
  const memberOptions = rawMembers
    .filter((m) => m.status !== "lead")
    .map((m) => ({ id: m.id, name: m.full_name || m.first_name }));

  const visiblePlans = plans.filter((p) => {
    if (branchFilter === "all") return true;
    if (branchFilter === "common") return p.branchId === null;
    return p.branchId === branchFilter;
  });

  const branchName = (id: string | null): string => {
    if (!id) return "All branches";
    return branches.find((b) => b.id === id)?.name ?? "Unknown branch";
  };

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

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPlan.mutateAsync({
        name: planForm.name,
        slug: planForm.slug || slugify(planForm.name),
        branch_id: planForm.branchId || null,
        description: planForm.description || undefined,
        billing_period: periodValue[planForm.billingPeriod],
        amount_minor: Number(planForm.amountMinor),
        entry_fee_minor: Number(planForm.entryFeeMinor),
        tax_rate_bp: Number(planForm.taxRateBp),
        duration_months: planForm.durationMonths ? Number(planForm.durationMonths) : null,
        auto_renew: planForm.autoRenew,
      });
      setCreateOpen(false);
      setPlanForm(emptyForm);
      setToast("Plan created");
    } catch {
      setToast("Could not create plan");
    }
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setEditForm({
      name: p.name,
      slug: "",
      branchId: p.branchId ?? "",
      description: p.description,
      billingPeriod: p.period,
      amountMinor: String(p.price),
      entryFeeMinor: String(p.entryFee),
      taxRateBp: String(p.taxBp),
      durationMonths: p.durationMonths ? String(p.durationMonths) : "",
      autoRenew: p.autoRenew,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updatePlan.mutateAsync({
        planId: editing.id,
        body: {
          name: editForm.name,
          branch_id: editForm.branchId || null,
          description: editForm.description || undefined,
          billing_period: periodValue[editForm.billingPeriod],
          amount_minor: Number(editForm.amountMinor),
          entry_fee_minor: Number(editForm.entryFeeMinor),
          tax_rate_bp: Number(editForm.taxRateBp),
          duration_months: editForm.durationMonths ? Number(editForm.durationMonths) : null,
          auto_renew: editForm.autoRenew,
        },
      });
      setEditing(null);
      setToast("Plan updated");
    } catch {
      setToast("Could not update plan");
    }
  }

  async function enablePlan(p: Plan) {
    try {
      await updatePlan.mutateAsync({ planId: p.id, body: { is_active: true } });
      setToast(`${p.name} enabled`);
    } catch {
      setToast("Could not enable plan");
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    try {
      await updatePlan.mutateAsync({
        planId: disableTarget.id,
        body: { is_active: false },
      });
      setToast(`${disableTarget.name} disabled · no longer sold`);
      setDisableTarget(null);
    } catch {
      setToast("Could not disable plan");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deletePlan.mutateAsync(deleteTarget.id);
      setToast(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch {
      setToast("Could not delete plan");
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
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New plan
          </Button>
        )}
      </div>

      {branches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBranchFilter("all")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              branchFilter === "all"
                ? "bg-ink text-accent-ink"
                : "bg-fill text-ink-soft hover:bg-fill-strong"
            }`}
          >
            All plans
          </button>
          <button
            type="button"
            onClick={() => setBranchFilter("common")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              branchFilter === "common"
                ? "bg-ink text-accent-ink"
                : "bg-fill text-ink-soft hover:bg-fill-strong"
            }`}
          >
            Common
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBranchFilter(b.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                branchFilter === b.id
                  ? "bg-ink text-accent-ink"
                  : "bg-fill text-ink-soft hover:bg-fill-strong"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <Async
        loading={isLoading}
        error={isError}
        skeleton={<PlanGridSkeleton count={visiblePlans.length || 5} />}
      >
        {visiblePlans.length === 0 ? (
          <EmptyState
            title={branchFilter === "all" ? "No plans yet" : "No plans for this branch"}
            hint={
              can("membership.plans.create")
                ? "Create a plan to start selling memberships."
                : "Ask the owner to create a plan."
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePlans.map((p) => (
              <Card
                key={p.id}
                className={`relative p-6 transition-shadow hover:shadow-md ${
                  p.popular ? "ring-2 ring-accent" : ""
                } ${p.isActive ? "" : "opacity-70"}`}
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
                  {p.isActive ? (
                    <Badge tone="green">{periodLabel[p.period]}</Badge>
                  ) : (
                    <Badge tone="red">Disabled</Badge>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
                  {branchName(p.branchId)}
                </p>
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
                {p.isActive && can("membership.subscriptions.activate") && (
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
                {(can("membership.plans.update") || can("membership.plans.delete")) && (
                  <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                    {can("membership.plans.update") && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                    )}
                    {can("membership.plans.update") &&
                      (p.isActive ? (
                        <Button variant="ghost" size="sm" onClick={() => setDisableTarget(p)}>
                          Disable
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => enablePlan(p)}>
                          Enable
                        </Button>
                      ))}
                    {can("membership.plans.delete") && (
                      <Button variant="ghost" size="sm" className="text-red hover:text-red" onClick={() => setDeleteTarget(p)}>
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New plan" subtitle="A plan sold at one branch or across all branches">
        <form onSubmit={addPlan} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name">
              <Input
                required
                placeholder="e.g. Monthly Flex"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              />
            </Field>
            <Field label="Slug">
              <Input
                placeholder={planForm.name ? slugify(planForm.name) : "auto-generated"}
                value={planForm.slug}
                onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Availability">
            <Select
              value={planForm.branchId}
              onChange={(e) => setPlanForm({ ...planForm, branchId: e.target.value })}
            >
              <option value="">Common · all branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Input
              placeholder="What's included"
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billing period">
              <Select
                value={planForm.billingPeriod}
                onChange={(e) => setPlanForm({ ...planForm, billingPeriod: e.target.value })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Annual</option>
              </Select>
            </Field>
            <Field label="Duration (months)">
              <Input
                type="number"
                min="1"
                placeholder="e.g. 1"
                value={planForm.durationMonths}
                onChange={(e) => setPlanForm({ ...planForm, durationMonths: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Price (₹, paise)">
              <Input
                type="number"
                min="0"
                required
                placeholder="e.g. 150000"
                value={planForm.amountMinor}
                onChange={(e) => setPlanForm({ ...planForm, amountMinor: e.target.value })}
              />
            </Field>
            <Field label="Entry fee (₹, paise)">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={planForm.entryFeeMinor}
                onChange={(e) => setPlanForm({ ...planForm, entryFeeMinor: e.target.value })}
              />
            </Field>
            <Field label="Tax (bp)">
              <Input
                type="number"
                min="0"
                max="10000"
                placeholder="1800"
                value={planForm.taxRateBp}
                onChange={(e) => setPlanForm({ ...planForm, taxRateBp: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={planForm.autoRenew}
              onChange={(e) => setPlanForm({ ...planForm, autoRenew: e.target.checked })}
              className="h-4 w-4 rounded border-line accent-accent"
            />
            Auto-renew
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createPlan.isPending}>
              {createPlan.isPending ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit plan" subtitle={editing?.name}>
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name">
              <Input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </Field>
            <Field label="Billing period">
              <Select
                value={editForm.billingPeriod}
                onChange={(e) => setEditForm({ ...editForm, billingPeriod: e.target.value })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Annual</option>
              </Select>
            </Field>
          </div>
          <Field label="Availability">
            <Select
              value={editForm.branchId}
              onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
            >
              <option value="">Common · all branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Input
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Duration (months)">
              <Input
                type="number"
                min="1"
                value={editForm.durationMonths}
                onChange={(e) => setEditForm({ ...editForm, durationMonths: e.target.value })}
              />
            </Field>
            <Field label="Price (₹, paise)">
              <Input
                type="number"
                min="0"
                required
                value={editForm.amountMinor}
                onChange={(e) => setEditForm({ ...editForm, amountMinor: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Entry fee (₹, paise)">
              <Input
                type="number"
                min="0"
                value={editForm.entryFeeMinor}
                onChange={(e) => setEditForm({ ...editForm, entryFeeMinor: e.target.value })}
              />
            </Field>
            <Field label="Tax (bp)">
              <Input
                type="number"
                min="0"
                max="10000"
                value={editForm.taxRateBp}
                onChange={(e) => setEditForm({ ...editForm, taxRateBp: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={editForm.autoRenew}
                  onChange={(e) => setEditForm({ ...editForm, autoRenew: e.target.checked })}
                  className="h-4 w-4 rounded border-line accent-accent"
                />
                Auto-renew
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={updatePlan.isPending}>
              {updatePlan.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        title={`Disable ${disableTarget?.name ?? ""}?`}
        subtitle="The plan will stop being sold, existing subscriptions keep running"
      >
        <p className="text-[13px] text-ink-soft">
          {disableTarget?.name ?? "This plan"} will no longer appear as purchasable. Existing memberships are unaffected. You can enable it anytime.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDisableTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={updatePlan.isPending} onClick={confirmDisable}>
            Disable plan
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ""}?`}
        subtitle="This plan will be removed permanently"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {deleteTarget?.name ?? "this plan"} is permanent and cannot be undone. Existing subscriptions keep their current terms.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={deletePlan.isPending} onClick={confirmDelete}>
            Delete plan
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
