"use client";

import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import {
  useImpersonateOwner,
  usePlatformOwners,
  useUpdateOwner,
} from "@/lib/hooks";
import { enterImpersonation } from "@/lib/impersonation";
import type { GymOwnerOut } from "@/lib/types";

export default function PlatformOwnersPage() {
  const { owners, isLoading, isError } = usePlatformOwners();
  const updateOwner = useUpdateOwner();
  const impersonate = useImpersonateOwner();
  const [editing, setEditing] = useState<GymOwnerOut | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });

  function openEdit(owner: GymOwnerOut) {
    setForm({ full_name: owner.full_name, email: owner.email, password: "" });
    setEditing(owner);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const body: { full_name: string; email: string; password?: string } = {
        full_name: form.full_name,
        email: form.email,
      };
      if (form.password) body.password = form.password;
      await updateOwner.mutateAsync({ ownerId: editing.id, body });
      setEditing(null);
      setToast("Owner updated");
    } catch {
      setToast("Could not update owner");
    }
  }

  async function toggleActive(owner: GymOwnerOut, next: boolean) {
    try {
      await updateOwner.mutateAsync({ ownerId: owner.id, body: { is_active: next } });
      setToast(next ? `${owner.full_name} can now log in` : `${owner.full_name}'s access disabled`);
    } catch {
      setToast("Could not update owner");
    }
  }

  async function loginAs(owner: GymOwnerOut) {
    try {
      const tokens = await impersonate.mutateAsync(owner.id);
      enterImpersonation(tokens);
    } catch {
      setToast("Could not open an owner session");
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-faint">
        <Count loading={isLoading} width="inline-block h-3 w-24">
          {owners.length} gym owners
        </Count>
      </p>

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={4} rows={4} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Gym</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-accent-soft/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={o.full_name} />
                      <div className="min-w-0">
                        <p className="font-medium">{o.full_name}</p>
                        <p className="text-[12px] text-ink-faint">{o.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{o.gym_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        !o.is_active
                          ? "bg-red-soft text-red"
                          : o.gym_status === "active"
                            ? "bg-green-soft text-green"
                            : o.gym_status === "trial"
                              ? "bg-amber-soft text-amber"
                              : "bg-red-soft text-red"
                      }`}
                    >
                      {!o.is_active ? "disabled" : o.gym_status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => openEdit(o)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className={o.is_active ? "text-red hover:bg-red-soft/50 hover:text-red" : "text-green hover:bg-green-soft/50 hover:text-green"}
                        onClick={() => toggleActive(o, !o.is_active)}
                      >
                        {o.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="subtle" size="xs" onClick={() => loginAs(o)} disabled={impersonate.isPending}>
                        Login
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && owners.length === 0 && <EmptyState title="No gym owners yet" />}
        </Card>
      </Async>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit gym owner" subtitle={editing?.gym_name ?? ""}>
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Full name">
            <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Reset password">
            <Input type="text" placeholder="Leave blank to keep current" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={updateOwner.isPending}>
              {updateOwner.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
