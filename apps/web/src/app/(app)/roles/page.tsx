"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Modal, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { RoleCardSkeleton } from "@/components/skeletons";
import { PermissionPills } from "@/components/permission-pills";
import { RolePermissionPills } from "@/components/role-permission-pills";
import { ApiError } from "@/lib/api";
import { useCreateRole, useDeleteRole, usePermissionCatalog, useRoles, useUpdateRole } from "@/lib/hooks";
import { useInFlight } from "@/lib/inflight";
import type { PermissionOut } from "@/lib/types";

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const d = err.detail as { message?: string; error?: { message?: string } } | null;
    return d?.error?.message ?? d?.message ?? fallback;
  }
  return fallback;
}

export default function RolesPage() {
  const { roles, isLoading: rolesLoading, isError: rolesError } = useRoles();
  const { permissions, isLoading: permsLoading, isError: permsError } = usePermissionCatalog();
  const updateRole = useUpdateRole();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const addGuard = useInFlight();
  const saveGuard = useInFlight();
  const toggleGuard = useInFlight();
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    description: string;
    perms: Set<string>;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const isLoading = rolesLoading || permsLoading;
  const isError = rolesError || permsError;

  const catalog: PermissionOut[] = useMemo(() => permissions.filter((p) => p.module !== "platform"), [permissions]);

  function toggleExpanded(roleId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  function closeCreateModal() {
    setCreating(false);
    setNewName("");
    setNewDesc("");
    setNewPerms(new Set());
  }

  async function submitNewRole() {
    if (createRole.isPending) return;
    if (newName.trim().length < 2) {
      setToast({ type: "error", message: "Could not create role — name must be at least 2 characters" });
      return;
    }
    const dupe = roles.some((r) => r.name.trim().toLowerCase() === newName.trim().toLowerCase());
    if (dupe) {
      setToast({ type: "error", message: `Could not create role — a role named ${newName.trim()} already exists` });
      return;
    }
    await addGuard.run(async () => {
      try {
        await createRole.mutateAsync({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          permission_codes: [...newPerms],
        });
        closeCreateModal();
        setToast({ type: "success", message: `Created ${newName.trim()}` });
      } catch (err) {
        setToast({ type: "error", message: errMsg(err, "Could not create role") });
      }
    });
  }

  function openEdit(role: { id: string; name: string; description: string | null; permission_codes: string[] }) {
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      perms: new Set(role.permission_codes),
    });
  }

  async function submitEdit() {
    if (!editing || updateRole.isPending) return;
    if (editing.name.trim().length < 2) {
      setToast({ type: "error", message: "Could not save role — name must be at least 2 characters" });
      return;
    }
    const dupe = roles.some(
      (r) => r.id !== editing.id && r.name.trim().toLowerCase() === editing.name.trim().toLowerCase(),
    );
    if (dupe) {
      setToast({ type: "error", message: `Could not save role — a role named ${editing.name.trim()} already exists` });
      return;
    }
    await saveGuard.run(async () => {
      try {
        await updateRole.mutateAsync({
          roleId: editing.id,
          body: {
            name: editing.name.trim(),
            description: editing.description.trim() || undefined,
            permission_codes: [...editing.perms],
          },
        });
        setToast({ type: "success", message: `Saved ${editing.name.trim()}` });
        setEditing(null);
      } catch (err) {
        setToast({ type: "error", message: errMsg(err, "Could not save role — it may be locked") });
      }
    });
  }

  async function toggleActive(role: { id: string; name: string; is_active: boolean; permission_codes: string[] }) {
    const next = !role.is_active;
    await toggleGuard.run(async () => {
      try {
        await updateRole.mutateAsync({
          roleId: role.id,
          body: { name: role.name, permission_codes: role.permission_codes, is_active: next },
        });
        setToast({
          type: "success",
          message: next ? `${role.name} enabled — staff can sign in again` : `${role.name} disabled — staff can no longer sign in`,
        });
      } catch (err) {
        setToast({ type: "error", message: errMsg(err, `Could not ${next ? "enable" : "disable"} role`) });
      }
    });
  }

  async function confirmDeleteRole() {
    if (!deleteTarget) return;
    try {
      await deleteRole.mutateAsync(deleteTarget.id);
      setToast({ type: "success", message: `${deleteTarget.name} deleted` });
      setDeleteTarget(null);
    } catch (err) {
      setToast({ type: "error", message: errMsg(err, "Could not delete role") });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New role
        </Button>
      </div>

      <Async loading={isLoading} error={isError} skeleton={<RoleCardSkeleton count={3} />}>
        <div className="space-y-4">
          {roles.map((role) => {
            const open = expanded.has(role.id);
            return (
              <Card key={role.id} className="overflow-hidden">
                <div className="flex w-full items-center justify-between gap-3 border-b border-line bg-fill px-5 py-4 text-left">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleExpanded(role.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.repeat) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpanded(role.id);
                      }
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className={`shrink-0 text-ink-faint ${open ? "" : "-rotate-90"}`}
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[15px] font-semibold tracking-tight">{role.name}</h3>
                        {!role.is_active && <Badge tone="red">Disabled</Badge>}
                        {!role.is_editable && (
                          <Badge tone="gray">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                            Locked
                          </Badge>
                        )}
                      </div>
                      {role.description && <p className="text-[12px] text-ink-faint">{role.description}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[12px] text-ink-faint">{role.permission_codes.length} permissions</span>
                    {role.is_editable && role.is_active && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(role)}>
                        Edit
                      </Button>
                    )}
                    {role.is_editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggleGuard.busy}
                        onClick={() => toggleActive(role)}
                      >
                        {role.is_active ? "Disable" : "Enable"}
                      </Button>
                    )}
                    {role.is_editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red hover:bg-red-soft"
                        onClick={() => setDeleteTarget({ id: role.id, name: role.name })}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="px-5 py-4">
                    {role.permission_codes.length > 0 ? (
                      <PermissionPills permissions={role.permission_codes} />
                    ) : (
                      <p className="text-[13px] text-ink-faint">No permissions granted.</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Async>

      <Modal
        open={creating}
        onClose={closeCreateModal}
        title="New role"
        subtitle="Pick the permissions this role starts with"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Name</span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Front Desk Lead"
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Description</span>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="max-h-[45vh] overflow-y-auto pr-1">
            <RolePermissionPills catalog={catalog} value={newPerms} onChange={setNewPerms} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button onClick={submitNewRole} disabled={addGuard.busy || createRole.isPending}>
              {createRole.isPending ? "Creating…" : `Create role (${newPerms.size} perms)`}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit role"
        subtitle={editing?.name}
        width="max-w-2xl"
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Name</span>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Front Desk Lead"
                  maxLength={100}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Description</span>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="max-h-[45vh] overflow-y-auto pr-1">
              <RolePermissionPills catalog={catalog} value={editing.perms} onChange={(next) => setEditing({ ...editing, perms: next })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={submitEdit} disabled={saveGuard.busy || updateRole.isPending}>
                {updateRole.isPending ? "Saving…" : `Save changes (${editing.perms.size} perms)`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ""}?`}
        subtitle="Staff assigned to this role will lose its permissions"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {deleteTarget?.name ?? "this role"} is permanent and cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={deleteRole.isPending}
            onClick={confirmDeleteRole}
          >
            Delete role
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
