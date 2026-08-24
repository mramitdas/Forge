"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, SectionTitle, Select, Toast } from "@/components/ui";
import { Async, Count, Skeleton } from "@/components/skeleton";
import { BranchGridSkeleton } from "@/components/skeletons";
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { TIMEZONES } from "@/lib/timezones";
import { COUNTRY_CODES, dialFor } from "@/lib/countries";
import type { Branch } from "@/lib/mock";

const emptyForm = {
  name: "",
  code: "",
  address: "",
  phone: "",
  country_code: "+91",
  gst_number: "",
  timezone: "Asia/Kolkata",
};

function phoneParts(phone: string, fallbackDial: string): { dial: string; number: string } {
  const dials = COUNTRY_CODES.map((c) => c.dial).sort((a, b) => b.length - a.length);
  for (const dial of dials) {
    if (phone.startsWith(dial)) return { dial, number: phone.slice(dial.length).trim() };
  }
  return { dial: fallbackDial, number: phone };
}

function displayPhone(b: Branch): string {
  if (!b.phone || b.phone === "—") return "—";
  if (b.phone.startsWith("+")) return b.phone;
  const dial = dialFor(b.country_code);
  return dial ? `${dial} ${b.phone}` : b.phone;
}

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {COUNTRY_CODES.map((c) => (
        <option key={c.dial} value={c.dial}>
          {c.dial} · {c.iso} · {c.name}
        </option>
      ))}
    </Select>
  );
}

export default function BranchesPage() {
  const { branches, isLoading, isError } = useBranches();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();
  const can = useCan();
  const totalMembers = branches.reduce((s, b) => s + b.members, 0);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [disableTarget, setDisableTarget] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBranch.mutateAsync({
        name: form.name,
        code: form.code || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        country_code: form.country_code,
        gst_number: form.gst_number || undefined,
        timezone: form.timezone,
      });
      setCreateOpen(false);
      setForm(emptyForm);
      setToast("Branch added");
    } catch {
      setToast("Could not add branch");
    }
  }

  function openEdit(b: Branch) {
    const parts = phoneParts(b.phone === "—" ? "" : b.phone, b.country_code || "+91");
    setEditing(b);
    setEditForm({
      name: b.name,
      code: b.code,
      address: b.address === "—" ? "" : b.address,
      phone: parts.number,
      country_code: b.country_code || parts.dial,
      gst_number: b.gst_number,
      timezone: b.timezone,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateBranch.mutateAsync({
        branchId: editing.id,
        body: {
          name: editForm.name,
          code: editForm.code || undefined,
          address: editForm.address || undefined,
          phone: editForm.phone || undefined,
          country_code: editForm.country_code,
          gst_number: editForm.gst_number || undefined,
          timezone: editForm.timezone,
        },
      });
      setEditing(null);
      setToast("Branch updated");
    } catch {
      setToast("Could not update branch");
    }
  }

  async function enableBranch(b: Branch) {
    try {
      await updateBranch.mutateAsync({ branchId: b.id, body: { is_active: true } });
      setToast(`${b.name} enabled`);
    } catch {
      setToast("Could not enable branch");
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    try {
      await updateBranch.mutateAsync({
        branchId: disableTarget.id,
        body: { is_active: false },
      });
      setToast(
        `${disableTarget.name} disabled · ${disableTarget.members} member${
          disableTarget.members === 1 ? "" : "s"
        } frozen`,
      );
      setDisableTarget(null);
    } catch {
      setToast("Could not disable branch");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteBranch.mutateAsync(deleteTarget.id);
      setToast(
        `${deleteTarget.name} deleted · ${deleteTarget.members} member${
          deleteTarget.members === 1 ? "" : "s"
        } removed`,
      );
      setDeleteTarget(null);
    } catch {
      setToast("Could not delete branch");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-40">
            {branches.length} locations · {totalMembers} members across branches
          </Count>
        </p>
        {can("tenancy.branches.create") && (
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
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
        {branches.length === 0 ? (
          <EmptyState
            title="No branches yet"
            hint={
              can("tenancy.branches.create")
                ? "Add your first location to start managing members and check-ins."
                : "Your gym has no branches. Ask the owner to add one."
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {branches.map((b) => (
              <Card
                key={b.id}
                className={`p-5 transition-shadow hover:shadow-md ${
                  b.is_active ? "" : "opacity-70"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </div>
                  {b.is_active ? (
                    <Badge tone="green">Open</Badge>
                  ) : (
                    <Badge tone="red">Disabled</Badge>
                  )}
                </div>
                <h3 className="mt-3 text-[16px] font-semibold tracking-tight">{b.name}</h3>
                <p className="mt-0.5 text-[12px] text-ink-faint">{b.address}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
                  <span className="text-ink-soft">{displayPhone(b)}</span>
                  <span className="font-medium">{b.members} members</span>
                </div>
                {b.gst_number && (
                  <p className="mt-1 text-[12px] text-ink-faint">
                    GSTIN {b.gst_number}
                  </p>
                )}
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
                {(can("tenancy.branches.update") || can("tenancy.branches.delete")) && (
                  <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                    {can("tenancy.branches.update") && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                        Edit
                      </Button>
                    )}
                    {can("tenancy.branches.update") &&
                      (b.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => setDisableTarget(b)}>
                          Disable
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => enableBranch(b)}>
                          Enable
                        </Button>
                      ))}
                    {can("tenancy.branches.delete") && (
                      <Button variant="ghost" size="sm" className="text-red hover:text-red" onClick={() => setDeleteTarget(b)}>
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add a branch" subtitle="A new location your members can train at">
        <form onSubmit={addBranch} className="space-y-4">
          <Field label="Branch name">
            <Input
              required
              placeholder="e.g. Downtown"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code">
              <Input
                placeholder="e.g. DT"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Timezone">
              <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Address">
            <Input
              placeholder="Street, city"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country code">
              <CountryCodeSelect value={form.country_code} onChange={(v) => setForm({ ...form, country_code: v })} />
            </Field>
            <Field label="Phone">
              <Input
                placeholder="98765 43210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="GST number">
            <Input
              placeholder="e.g. 27ABCDE1234F1Z5"
              value={form.gst_number}
              onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createBranch.isPending}>
              {createBranch.isPending ? "Adding…" : "Add branch"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit branch" subtitle={editing?.name}>
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Branch name">
            <Input
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code">
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              />
            </Field>
            <Field label="Timezone">
              <Select value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country code">
              <CountryCodeSelect value={editForm.country_code} onChange={(v) => setEditForm({ ...editForm, country_code: v })} />
            </Field>
            <Field label="Phone">
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="GST number">
            <Input
              placeholder="e.g. 27ABCDE1234F1Z5"
              value={editForm.gst_number}
              onChange={(e) => setEditForm({ ...editForm, gst_number: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={updateBranch.isPending}>
              {updateBranch.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        title={`Disable ${disableTarget?.name ?? ""}?`}
        subtitle="Members at this branch will be frozen and unable to check in"
      >
        <p className="text-[13px] text-ink-soft">
          {disableTarget?.members ?? 0} active member{disableTarget?.members === 1 ? "" : "s"} at this branch will be disabled. You can enable the branch anytime to bring it back.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDisableTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={updateBranch.isPending} onClick={confirmDisable}>
            Disable branch
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ""}?`}
        subtitle="This branch and all of its members will be removed"
      >
        <p className="text-[13px] text-ink-soft">
          {deleteTarget?.members ?? 0} member{deleteTarget?.members === 1 ? "" : "s"} are assigned to this branch. Deleting it also removes them. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={deleteBranch.isPending} onClick={confirmDelete}>
            Delete branch
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
