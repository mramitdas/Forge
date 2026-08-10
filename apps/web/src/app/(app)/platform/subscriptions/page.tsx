"use client";

import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Switch,
  Textarea,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { PricingCardsSkeleton } from "@/components/skeletons";
import {
  useCreateTier,
  useDeleteTier,
  usePlatformTiers,
  useUpdateTier,
} from "@/lib/hooks";
import type { SubscriptionTierOut } from "@/lib/types";

function price(price_minor: number | null): string {
  if (price_minor == null) return "Custom";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price_minor);
}

function tierFeatures(t: SubscriptionTierOut): string[] {
  const f: string[] = [];
  f.push(
    t.max_branches === 1
      ? "1 branch"
      : t.max_branches != null
        ? `Up to ${t.max_branches} branches`
        : "Unlimited branches",
  );
  f.push(
    t.max_members != null
      ? `Up to ${t.max_members} members`
      : "Unlimited members",
  );
  f.push("Member check-ins & attendance");
  f.push("Membership plans & renewals");
  f.push("Invoices & payment capture");
  f.push("Staff roles & permissions");
  f.push(t.max_branches != null && t.max_branches > 1 ? "Cross-branch member access" : "Dedicated main branch");
  f.push("Email notifications to members");
  return f;
}

function TierFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: SubscriptionTierOut | null;
}) {
  const createTier = useCreateTier();
  const updateTier = useUpdateTier();
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    price_minor: "",
    max_branches: "",
    max_members: "",
  });
  const [toast, setToast] = useState<string | null>(null);

  function reset(editing: SubscriptionTierOut | null) {
    setForm({
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      description: editing?.description ?? "",
      price_minor: editing?.price_minor != null ? String(editing.price_minor) : "",
      max_branches: editing?.max_branches != null ? String(editing.max_branches) : "",
      max_members: editing?.max_members != null ? String(editing.max_members) : "",
    });
  }

  function toBody() {
    return {
      description: form.description || null,
      price_minor: form.price_minor ? Number(form.price_minor) : null,
      max_branches: form.max_branches ? Number(form.max_branches) : undefined,
      max_members: form.max_members ? Number(form.max_members) : undefined,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await updateTier.mutateAsync({ code: editing.code, body: { name: form.name, ...toBody() } });
        setToast("Tier updated");
      } else {
        await createTier.mutateAsync({ code: form.code, name: form.name, ...toBody() });
        setToast("Tier created");
      }
      onClose();
    } catch {
      setToast(editing ? "Could not update tier" : "Could not create tier");
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editing ? "Edit tier" : "New subscription tier"}
        subtitle={
          editing
            ? editing.code
            : "SaaS plan gyms can be provisioned onto or switched to"
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {!editing && (
            <Field label="Code">
              <Input
                required
                pattern="[a-z0-9-]+"
                placeholder="e.g. premium"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
          )}
          <Field label="Name">
            <Input
              required
              placeholder="e.g. Premium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly price (₹)">
              <Input
                type="number"
                min={0}
                placeholder="e.g. 799"
                value={form.price_minor}
                onChange={(e) => setForm({ ...form, price_minor: e.target.value })}
              />
            </Field>
            <Field label="Max branches">
              <Input
                type="number"
                min={1}
                placeholder="Empty = unlimited"
                value={form.max_branches}
                onChange={(e) => setForm({ ...form, max_branches: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max members">
              <Input
                type="number"
                min={1}
                placeholder="Empty = unlimited"
                value={form.max_members}
                onChange={(e) => setForm({ ...form, max_members: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                placeholder="e.g. For growing operators"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTier.isPending || updateTier.isPending}>
              {createTier.isPending || updateTier.isPending ? "Saving…" : editing ? "Save changes" : "Create tier"}
            </Button>
          </div>
        </form>
      </Modal>
      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

export default function PlatformSubscriptionsPage() {
  const { tiers, isLoading, isError } = usePlatformTiers();
  const updateTier = useUpdateTier();
  const deleteTier = useDeleteTier();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SubscriptionTierOut | null>(null);
  const [deleting, setDeleting] = useState<SubscriptionTierOut | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function toggleActive(tier: SubscriptionTierOut, next: boolean) {
    updateTier
      .mutateAsync({ code: tier.code, body: { is_active: next } })
      .then(() => setToast(`${tier.name} is now ${next ? "active" : "disabled"}`))
      .catch(() => setToast("Could not update tier"));
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteTier.mutateAsync(deleting.code);
      setDeleting(null);
      setToast(`${deleting.name} deleted`);
    } catch {
      setToast("Could not delete tier — is it in use by a gym?");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-44">
            {tiers.length} plans · {tiers.filter((t) => t.is_active).length} available to gyms
          </Count>
        </p>
        <Button onClick={() => setCreating(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New tier
        </Button>
      </div>

      <Async loading={isLoading} error={isError} skeleton={<PricingCardsSkeleton count={3} />}>
        {tiers.length === 0 ? (
          <EmptyState title="No tiers yet" hint="Create the first subscription tier to start provisioning gyms." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {tiers.map((t) => (
              <Card
                key={t.code}
                className={`flex flex-col p-5 ${!t.is_active ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="kicker uppercase">{t.code}</p>
                    <h3 className="mt-0.5 font-display text-[18px] font-bold tracking-tight">
                      {t.name}
                    </h3>
                  </div>
                  <Switch
                    checked={t.is_active}
                    onChange={(next) => toggleActive(t, next)}
                    label={`Toggle ${t.name}`}
                  />
                </div>

                {t.description && (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{t.description}</p>
                )}

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[26px] font-semibold tracking-tight">
                    {price(t.price_minor)}
                  </span>
                  <span className="text-[12px] text-ink-faint">/ month</span>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {tierFeatures(t).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-ink-soft">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="mt-0.5 shrink-0 text-green"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex gap-2 border-t border-line pt-4">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red hover:bg-red-soft/50 hover:text-red"
                    onClick={() => setDeleting(t)}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>

      <TierFormModal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} editing={editing} />

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete tier" subtitle={deleting?.name ?? ""}>
        <div className="space-y-4">
          <p className="text-[13px] text-ink-soft">
            This removes <span className="font-medium capitalize">{deleting?.code}</span> as an
            option for new or changed subscriptions. Tiers currently assigned to a gym can&apos;t be
            deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={deleteTier.isPending} onClick={confirmDelete}>
              {deleteTier.isPending ? "Deleting…" : "Delete tier"}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
