"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Modal, Switch, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { RoleCardSkeleton } from "@/components/skeletons";
import { useCreateRole, usePermissionCatalog, useRoles, useUpdateRole } from "@/lib/hooks";
import { useInFlight } from "@/lib/inflight";

const MODULE_LABELS: Record<string, string> = {
  members: "Members",
  membership: "Memberships & plans",
  billing: "Billing",
  attendance: "Check-ins & attendance",
  notifications: "Notifications",
  reports: "Reports",
  tenancy: "Branches & settings",
  identity: "Roles & staff",
};

export default function RolesPage() {
  const { roles, isLoading: rolesLoading, isError: rolesError } = useRoles();
  const { permissions, isLoading: permsLoading, isError: permsError } = usePermissionCatalog();
  const updateRole = useUpdateRole();
  const createRole = useCreateRole();
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const addGuard = useInFlight();

  useEffect(() => {
    if (!initializedRef.current && roles.length > 0) {
      initializedRef.current = true;
      setCollapsed(new Set(roles.map((r) => r.id)));
    }
  }, [roles]);

  function toggleCollapsed(roleId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  const isLoading = rolesLoading || permsLoading;
  const isError = rolesError || permsError;

  const byModule = useMemo(() => {
    const map: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (p.module === "platform") continue;
      (map[p.module] ??= []).push(p);
    }
    return map;
  }, [permissions]);

  function toggle(roleId: string, code: string, base: string[]) {
    setDraft((d) => {
      const next = new Set(d[roleId] ?? base);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...d, [roleId]: next };
    });
  }

  function isDirty(roleId: string, base: string[]) {
    const cur = draft[roleId];
    if (!cur) return false;
    if (cur.size !== base.length) return true;
    for (const c of base) if (!cur.has(c)) return true;
    return false;
  }

  async function save(roleId: string, name: string) {
    const codes = draft[roleId] ? [...draft[roleId]] : [];
    setSaving(roleId);
    try {
      await updateRole.mutateAsync({ roleId, body: { permission_codes: codes } });
      setDraft((d) => ({ ...d, [roleId]: new Set(codes) }));
      setToast({ type: "success", message: `Saved ${name} permissions` });
    } catch {
      setToast({ type: "error", message: "Could not save role — it may be locked" });
    } finally {
      setSaving(null);
    }
  }

  function toggleNewPerm(code: string) {
    setNewPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
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
      } catch {
        setToast({ type: "error", message: "Could not create role" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-ink-faint">
          Tune what each staff role can view, edit and delete. The Gym Owner role is locked.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          New role
        </Button>
      </div>

      <Async loading={isLoading} error={isError} skeleton={<RoleCardSkeleton count={3} />}>
        <div className="space-y-4">
        {roles.map((role) => {
        const base = role.permission_codes;
        const dirty = isDirty(role.id, base);
        const current = draft[role.id] ?? new Set(base);
        return (
          <Card key={role.id} className="overflow-hidden">
            <div className="flex w-full items-center justify-between gap-3 border-b border-line bg-fill px-5 py-4 text-left">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed.has(role.id)}
                onClick={() => toggleCollapsed(role.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.repeat) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCollapsed(role.id);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch transition-colors hover:bg-fill-strong"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className={`shrink-0 text-ink-faint transition-transform duration-200 ${
                    collapsed.has(role.id) ? "-rotate-90" : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold tracking-tight">{role.name}</h3>
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
              <div className="shrink-0">
                {role.is_editable && dirty && (
                  <Button size="sm" disabled={saving === role.id} onClick={() => save(role.id, role.name)}>
                    {saving === role.id ? "Saving…" : `Save (${current.size} perms)`}
                  </Button>
                )}
                {role.is_editable && !dirty && (
                  <span className="text-[12px] text-ink-faint">{current.size} permissions</span>
                )}
              </div>
            </div>

            {!collapsed.has(role.id) && (role.is_editable ? (
              <div className="divide-y divide-line">
                {Object.entries(byModule).map(([module, perms]) => (
                  <div key={module} className="px-5 py-4">
                    <p className="kicker mb-2">{MODULE_LABELS[module] ?? module}</p>
                    <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {perms.map((p) => {
                        const on = current.has(p.code);
                        return (
                          <div
                            key={p.code}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggle(role.id, p.code, base)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggle(role.id, p.code, base);
                              }
                            }}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-fill"
                          >
                            <span className="min-w-0">
                              <span className={`block text-[13px] ${on ? "text-ink" : "text-ink-faint"}`}>
                                {p.description}
                              </span>
                              <span className="block font-mono text-[10px] text-ink-faint">{p.code}</span>
                            </span>
                            <span onClick={(e) => e.stopPropagation()}>
                              <Switch checked={on} onChange={() => toggle(role.id, p.code, base)} label={p.code} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-4">
                <EmptyState
                  title="Locked system role"
                  hint="This role is fixed and cannot be overridden."
                />
              </div>
            ))}
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
          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {Object.entries(byModule).map(([module, perms]) => (
              <div key={module}>
                <p className="kicker mb-1.5">{MODULE_LABELS[module] ?? module}</p>
                <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  {perms.map((p) => (
                    <div
                      key={p.code}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleNewPerm(p.code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleNewPerm(p.code);
                        }
                      }}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-fill"
                    >
                      <span className={`block text-[13px] ${newPerms.has(p.code) ? "text-ink" : "text-ink-faint"}`}>
                        {p.description}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={newPerms.has(p.code)}
                          onChange={() => toggleNewPerm(p.code)}
                          label={p.code}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
