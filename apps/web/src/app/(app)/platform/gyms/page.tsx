"use client";

import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { CURRENCIES, currencyByCode } from "@/lib/currencies";
import { TIMEZONES } from "@/lib/timezones";
import {
  useDeleteGym,
  usePlatformGyms,
  usePlatformTiers,
  useProvisionGym,
  useUpdateGym,
} from "@/lib/hooks";
import type { GymOut } from "@/lib/types";

export default function PlatformGymsPage() {
  const { gyms, isLoading, isError } = usePlatformGyms();
  const { tiers } = usePlatformTiers();
  const provision = useProvisionGym();
  const updateGym = useUpdateGym();
  const deleteGym = useDeleteGym();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GymOut | null>(null);
  const [deleting, setDeleting] = useState<GymOut | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_email: "",
    owner_name: "",
    owner_password: "",
    tier_code: "starter",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    timezone: "",
    currency: "",
    tier_code: "starter",
  });

  async function provisionGym(e: React.FormEvent) {
    e.preventDefault();
    try {
      await provision.mutateAsync(form);
      setOpen(false);
      setToast("Gym provisioned — owner can log in now");
    } catch {
      setToast("Could not provision gym");
    }
  }

  function openEdit(gym: GymOut) {
    setEditForm({
      name: gym.name,
      timezone: gym.timezone,
      currency: gym.currency,
      tier_code: gym.tier_code,
    });
    setEditing(gym);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateGym.mutateAsync({
        gymId: editing.id,
        body: {
          name: editForm.name,
          timezone: editForm.timezone,
          currency: editForm.currency,
          tier_code: editForm.tier_code,
        },
      });
      setEditing(null);
      setToast("Gym updated");
    } catch {
      setToast("Could not update gym");
    }
  }

  async function setStatus(gym: GymOut, next: string) {
    try {
      await updateGym.mutateAsync({ gymId: gym.id, body: { status: next } });
      setToast(next === "active" ? `${gym.name} is now active` : `${gym.name} suspended`);
    } catch {
      setToast("Could not update gym status");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteGym.mutateAsync(deleting.id);
      setDeleting(null);
      setToast(`${deleting.name} deleted`);
    } catch {
      setToast("Could not delete gym");
    }
  }

  function toggleCrossBranch(gymId: string, next: boolean) {
    updateGym
      .mutateAsync({ gymId, body: { cross_branch_access: next } })
      .then(() => setToast("Gym setting updated"))
      .catch(() => setToast("Could not update gym"));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-24">
            {gyms.length} gyms on the platform
          </Count>
        </p>
        <Button onClick={() => setOpen(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Provision gym
        </Button>
      </div>

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={6} rows={4} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Gym</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Cross-branch</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gyms.map((g) => (
                <tr key={g.id} className="border-b border-line last:border-0 hover:bg-accent-soft/40">
                  <td className="px-5 py-3">
                    <p className="font-medium">{g.name}</p>
                    <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                      <span className="inline-flex h-4 w-6 items-center justify-center overflow-hidden rounded-[3px] bg-fill text-[9px] font-bold text-ink-soft">
                        {currencyByCode(g.currency).cc}
                      </span>
                      {g.currency} · {g.timezone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{g.slug}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        g.status === "active"
                          ? "bg-green-soft text-green"
                          : g.status === "trial"
                            ? "bg-amber-soft text-amber"
                            : "bg-red-soft text-red"
                      }`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-fill px-2 py-0.5 text-[12px] capitalize">{g.tier_code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={g.cross_branch_access}
                      onChange={(next) => toggleCrossBranch(g.id, next)}
                      label={`Cross-branch access for ${g.name}`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => openEdit(g)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setStatus(g, g.status === "suspended" ? "active" : "suspended")}
                      >
                        {g.status === "suspended" ? "Enable" : "Suspend"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-red hover:bg-red-soft/50 hover:text-red"
                        onClick={() => setDeleting(g)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && gyms.length === 0 && <EmptyState title="No gyms provisioned" hint="Provision the first gym to get started." />}
        </Card>
      </Async>

      <Modal open={open} onClose={() => setOpen(false)} title="Provision a gym" subtitle="Creates the gym tenant and its owner account">
        <form onSubmit={provisionGym} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gym name">
              <Input required id="gym-name" aria-label="Gym name" placeholder="e.g. Iron Temple" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Slug">
              <Input required id="gym-slug" aria-label="Slug" placeholder="e.g. iron-temple" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </Field>
          </div>
          <Field label="Tier">
            <Select id="gym-tier" aria-label="Tier" value={form.tier_code} onChange={(e) => setForm({ ...form, tier_code: e.target.value })}>
              {tiers.filter((t) => t.is_active).map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner name">
              <Input required id="gym-owner-name" aria-label="Owner name" placeholder="e.g. Aisha Kapoor" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
            </Field>
            <Field label="Owner email">
              <Input required id="gym-owner-email" aria-label="Owner email" type="email" placeholder="owner@gym.com" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
            </Field>
          </div>
          <Field label="Owner password">
            <Input required id="gym-owner-password" aria-label="Owner password" type="text" placeholder="min 8 chars" value={form.owner_password} onChange={(e) => setForm({ ...form, owner_password: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={provision.isPending}>
              {provision.isPending ? "Provisioning…" : "Provision gym"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit gym" subtitle={editing?.name ?? ""}>
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Gym name">
            <Input required id="gym-edit-name" aria-label="Gym name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone">
              <Select
                id="gym-edit-timezone"
                aria-label="Timezone"
                value={editForm.timezone}
                onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <div className="flex items-center gap-2">
                <span
                  title={currencyByCode(editForm.currency).name}
                  className="inline-flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-line bg-fill text-[10px] font-bold text-ink-soft"
                >
                  {currencyByCode(editForm.currency).cc}
                </span>
                <Select
                  id="gym-edit-currency"
                  aria-label="Currency"
                  value={editForm.currency}
                  onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.cc} · {c.code} · {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          </div>
          <Field label="Tier">
            <Select id="gym-edit-tier" aria-label="Tier" value={editForm.tier_code} onChange={(e) => setEditForm({ ...editForm, tier_code: e.target.value })}>
              {tiers
                .filter((t) => t.is_active || t.code === editForm.tier_code)
                .map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={updateGym.isPending}>
              {updateGym.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete gym" subtitle={deleting?.name ?? ""}>
        <div className="space-y-4">
          <p className="text-[13px] text-ink-soft">
            This soft-deletes the gym and every account inside it. {deleting?.name} will disappear
            from the registry and its owner will no longer be able to log in. This can&apos;t be
            undone from the UI.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button type="button" variant="danger" disabled={deleteGym.isPending} onClick={confirmDelete}>
              {deleteGym.isPending ? "Deleting…" : "Delete gym"}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
