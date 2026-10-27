"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
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
import { TableSkeleton } from "@/components/skeletons";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  useCreateEmployee,
  useDeleteEmployee,
  useEmployees,
  useRoles,
  useUpdateEmployee,
} from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { useInFlight } from "@/lib/inflight";
import type { EmployeeCreatedOut, EmployeeOut } from "@/lib/types";

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const d = err.detail as
      | { message?: string; error?: { message?: string } }
      | null;
    return d?.error?.message ?? d?.message ?? fallback;
  }
  return fallback;
}

function CountryCodeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select id={id} aria-label="Country code" value={value} onChange={(e) => onChange(e.target.value)}>
      {COUNTRY_CODES.map((c) => (
        <option key={c.dial} value={c.dial}>
          {c.dial} · {c.iso} · {c.name}
        </option>
      ))}
    </Select>
  );
}

function splitPhone(raw: string | null): { code: string; number: string } {
  if (!raw) return { code: "+91", number: "" };
  const match = [...COUNTRY_CODES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => raw.startsWith(`${c.dial} `) || raw === c.dial);
  if (!match) return { code: "+91", number: raw };
  return { code: match.dial, number: raw.slice(match.dial.length).trim() };
}

export default function EmployeesPage() {
  const can = useCan();
  const { me } = useAuth();
  const { employees, isLoading, isError } = useEmployees();
  const { roles } = useRoles();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const addGuard = useInFlight();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeOut | null>(null);
  const [created, setCreated] = useState<EmployeeCreatedOut | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const assignableRoles = useMemo(
    () => roles.filter((r) => r.is_active),
    [roles],
  );

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    countryCode: "+91",
    phone: "",
    roleId: "",
  });

  const [editForm, setEditForm] = useState({
    full_name: "",
    countryCode: "+91",
    phone: "",
    roleId: "",
    is_active: true,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  function openAdd() {
    setForm({
      full_name: "",
      email: "",
      countryCode: "+91",
      phone: "",
      roleId: assignableRoles[0]?.id ?? "",
    });
    setOpen(true);
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (createEmployee.isPending) return;
    if (!form.full_name.trim()) {
      setToast({ type: "error", message: "Enter the employee's name" });
      return;
    }
    await addGuard.run(async () => {
      try {
        const result = await createEmployee.mutateAsync({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          phone: form.phone.trim() ? `${form.countryCode} ${form.phone.trim()}` : null,
          role_ids: form.roleId ? [form.roleId] : [],
        });
        setOpen(false);
        setCreated(result);
        setToast({ type: "success", message: `${result.full_name} added` });
      } catch (err) {
        setToast({ type: "error", message: errMsg(err, "Could not add the employee") });
      }
    });
  }

  function openEdit(emp: EmployeeOut) {
    const phone = splitPhone(emp.phone);
    setEditForm({
      full_name: emp.full_name,
      countryCode: phone.code,
      phone: phone.number,
      roleId: emp.role_ids[0] ?? "",
      is_active: emp.is_active,
    });
    setEditing(emp);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || updateEmployee.isPending) return;
    try {
      await updateEmployee.mutateAsync({
        userId: editing.id,
        body: {
          full_name: editForm.full_name.trim(),
          phone: editForm.phone.trim()
            ? `${editForm.countryCode} ${editForm.phone.trim()}`
            : null,
          is_active: editForm.is_active,
          role_ids: editForm.roleId ? [editForm.roleId] : [],
        },
      });
      setEditing(null);
      setToast({ type: "success", message: "Employee updated" });
    } catch (err) {
      setToast({ type: "error", message: errMsg(err, "Could not update the employee") });
    }
  }

  async function toggleActive(emp: EmployeeOut) {
    const next = !emp.is_active;
    try {
      await updateEmployee.mutateAsync({
        userId: emp.id,
        body: { is_active: next },
      });
      setToast({ type: "success", message: next ? `${emp.full_name} enabled` : `${emp.full_name} disabled` });
    } catch (err) {
      setToast({ type: "error", message: errMsg(err, "Could not update the employee") });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteEmployee.mutateAsync(deleteTarget.id);
      setToast({ type: "success", message: `${deleteTarget.full_name} deleted` });
      setDeleteTarget(null);
    } catch (err) {
      setToast({ type: "error", message: errMsg(err, "Could not delete the employee") });
    }
  }

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporary_password);
      setToast({ type: "success", message: "Password copied" });
    } catch {
      setToast({ type: "error", message: "Could not copy — select and copy manually" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-16">
            {employees.length} {employees.length === 1 ? "employee" : "employees"}
          </Count>
        </p>
        {can("users.manage") && (
          <Button onClick={openAdd}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add employee
          </Button>
        )}
      </div>

      <div className="relative w-72">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <Input
          id="employee-search"
          name="employee-search"
          aria-label="Search name, email, phone"
          placeholder="Search name, email, phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={6} rows={6} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.full_name} />
                      <div className="min-w-0">
                        <p className="font-medium">{emp.full_name}</p>
                        <p className="text-[12px] text-ink-faint">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {emp.role_names.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {emp.role_names.map((n) => (
                          <Badge key={n} tone="gray">
                            {n}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{emp.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={emp.is_active ? "green" : "red"}>
                      {emp.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(emp.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {can("users.manage") && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}>
                          Edit
                        </Button>
                        {emp.email !== me?.user.email && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updateEmployee.isPending}
                              onClick={() => toggleActive(emp)}
                            >
                              {emp.is_active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red hover:bg-red-soft"
                              onClick={() => setDeleteTarget(emp)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <EmptyState
              title="No employees found"
              hint={search ? "Try a different search." : "Add your first employee to get started."}
            />
          )}
        </Card>
      </Async>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add employee"
        subtitle="A temporary password is generated automatically."
      >
        <form onSubmit={addEmployee} className="space-y-4">
          <Field label="Full name">
            <Input
              required
              id="employee-full-name"
              name="full_name"
              aria-label="Full name"
              placeholder="e.g. Priya Sharma"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              required
              type="email"
              id="employee-email"
              name="email"
              aria-label="Email"
              placeholder="priya@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country code">
              <CountryCodeSelect
                id="employee-country-code"
                value={form.countryCode}
                onChange={(v) => setForm({ ...form, countryCode: v })}
              />
            </Field>
            <Field label="Phone number">
              <Input
                id="employee-phone"
                name="phone"
                aria-label="Phone number"
                placeholder="90000 00000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Role">
            <Select
              id="employee-role"
              name="role_id"
              aria-label="Role"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              <option value="">{assignableRoles.length === 0 ? "No roles available" : "No role"}</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addGuard.busy || createEmployee.isPending}>
              {addGuard.busy ? "Adding…" : "Add employee"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit employee"
        subtitle={editing?.full_name ?? ""}
      >
        {editing && (
          <form onSubmit={saveEdit} className="space-y-4">
            <Field label="Full name">
              <Input
                required
                id="employee-edit-name"
                name="full_name"
                aria-label="Full name"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Country code">
                <CountryCodeSelect
                  id="employee-edit-country-code"
                  value={editForm.countryCode}
                  onChange={(v) => setEditForm({ ...editForm, countryCode: v })}
                />
              </Field>
              <Field label="Phone number">
                <Input
                  id="employee-edit-phone"
                  name="phone"
                  aria-label="Phone number"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Role">
                <Select
                  id="employee-edit-role"
                  name="role_id"
                  aria-label="Role"
                  value={editForm.roleId}
                  onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                >
                  <option value="">{assignableRoles.length === 0 ? "No roles available" : "No role"}</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  id="employee-edit-status"
                  name="status"
                  aria-label="Status"
                  value={editForm.is_active ? "active" : "inactive"}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === "active" })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateEmployee.isPending}>
                {updateEmployee.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.full_name ?? ""}?`}
        subtitle="They will no longer be able to sign in"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {deleteTarget?.full_name ?? "this employee"} removes their access permanently. This cannot be
          undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={deleteEmployee.isPending} onClick={confirmDelete}>
            Delete employee
          </Button>
        </div>
      </Modal>

      <Modal
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Employee added"
        subtitle="Share these sign-in details once — the password will not be shown again."
      >
        {created && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] font-medium text-ink-faint">Email</p>
              <p className="text-[13px] text-ink">{created.email}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-ink-faint">Temporary password</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-line bg-fill px-3 py-2 font-mono text-[13px] tracking-wide text-ink">
                  {created.temporary_password}
                </code>
                <Button type="button" variant="secondary" size="sm" onClick={copyPassword}>
                  Copy
                </Button>
              </div>
            </div>
            {created.role_names.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-ink-faint">Role</p>
                <p className="text-[13px] text-ink">{created.role_names.join(", ")}</p>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button type="button" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
