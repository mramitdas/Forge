"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  StatusBadge,
  Toast,
} from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { type Member } from "@/lib/mock";
import {
  byId,
  useBranches,
  useCreateMember,
  useDeleteMember,
  useMembersPage,
  usePlans,
  useUpdateMember,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { COUNTRY_CODES } from "@/lib/countries";
import { useInFlight } from "@/lib/inflight";

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select id="member-country-code" aria-label="Country code" value={value} onChange={(e) => onChange(e.target.value)}>
      {COUNTRY_CODES.map((c) => (
        <option key={c.dial} value={c.dial}>
          {c.dial} · {c.iso} · {c.name}
        </option>
      ))}
    </Select>
  );
}

const filters = ["All", "active", "inactive", "frozen"] as const;
const statusParam: Record<(typeof filters)[number], string | undefined> = {
  All: undefined,
  active: "active",
  inactive: "inactive",
  frozen: "frozen",
};

const PAGE_SIZE = 10;

export default function MembersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number]>("All");
  const [branch, setBranch] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const { branches } = useBranches();
  const { plans } = usePlans();
  const { members, total, isLoading, isError } = useMembersPage({
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    status: statusParam[status],
    branchId: branch,
  });

  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const can = useCan();
  const addGuard = useInFlight();

  const planMap = byId(plans);
  const branchMap = byId(branches);

  const [form, setForm] = useState({
    name: "",
    email: "",
    countryCode: "+91",
    phone: "",
    gender: "Male",
    branchId: "",
    planId: "",
  });
  const selectedPlan = form.planId ? form.planId : "";

  const visiblePlans = plans.filter(
    (p) => p.isActive && (p.branchId === null || p.branchId === form.branchId),
  );

  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    country_code: "+91",
    gender: "Male",
    status: "active",
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const nameParts = form.name.trim().split(/\s+/);
    if (!nameParts[0] || !form.planId) return;
    await addGuard.run(async () => {
      try {
        await createMember.mutateAsync({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" ") || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          country_code: form.countryCode || undefined,
          gender: form.gender,
          branch_id: form.branchId,
          plan_id: form.planId,
        });
        setOpen(false);
        setToast({ type: "success", message: `${form.name.trim()} added` });
        setForm({ name: "", email: "", countryCode: "+91", phone: "", gender: "Male", branchId: form.branchId, planId: "" });
      } catch {
        setToast({ type: "error", message: "Failed to add member" });
      }
    });
  }

  function openEdit(m: Member) {
    setEditForm({
      first_name: m.name.split(" ")[0] ?? "",
      last_name: m.name.split(" ").slice(1).join(" "),
      email: m.email,
      phone: m.phone,
      country_code: m.countryCode || "+91",
      gender: m.gender === "—" ? "Male" : m.gender,
      status: m.rawStatus,
    });
    setEditing(m);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateMember.mutateAsync({
        memberId: editing.id,
        body: {
          first_name: editForm.first_name,
          last_name: editForm.last_name || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          country_code: editForm.country_code,
          gender: editForm.gender,
          status: editForm.status,
        },
      });
      setEditing(null);
      setToast({ type: "success", message: "Member updated" });
    } catch {
      setToast({ type: "error", message: "Could not update member" });
    }
  }

  async function toggleActive(m: Member, next: boolean) {
    try {
      await updateMember.mutateAsync({ memberId: m.id, body: { is_active: next } });
      setToast({ type: "success", message: next ? `${m.name} enabled` : `${m.name} disabled` });
    } catch {
      setToast({ type: "error", message: "Could not update member" });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMember.mutateAsync(deleteTarget.id);
      setToast({ type: "success", message: `${deleteTarget.name} deleted` });
      setDeleteTarget(null);
    } catch {
      setToast({ type: "error", message: "Could not delete member" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-faint">
          <Count loading={isLoading} width="inline-block h-3 w-16">
            {total} members
          </Count>
        </p>
        {can("members.create") && (
          <Button onClick={() => {
            setForm((f) => ({ ...f, branchId: f.branchId || branches[0]?.id || "" }));
            setOpen(true);
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add member
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <Input
            id="member-search"
            name="member-search"
            aria-label="Search name, email, phone"
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
          id="members-branch-filter"
          aria-label="Filter by branch"
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setPage(1); }}
          className="w-44"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => { setStatus(f); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                status === f
                  ? "bg-accent text-accent-ink shadow-[0_2px_12px_var(--color-glow)]"
                  : "border border-line bg-fill text-ink-soft hover:text-ink"
              }`}
            >
              {f === "All" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={7} rows={8} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last check-in</th>
                <th className="px-4 py-3 font-medium">Visits</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m: Member) => {
                const plan = planMap.get(m.planId);
                const branch = branchMap.get(m.branchId);
                return (
                  <tr
                    key={m.id}
                    tabIndex={0}
                    onClick={() => router.push(`/members/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/members/${m.id}`);
                    }}
                    className="group cursor-pointer border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            {m.name}
                            {m.tags.length > 0 && (
                              <span className="text-[10px] text-accent">{m.tags.join(" · ")}</span>
                            )}
                          </p>
                          <p className="text-[12px] text-ink-faint">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{plan ? plan.name : "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{branch?.code || branch?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{m.lastCheckIn ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.visits}</span>
                        {m.streak > 3 && (
                          <Badge tone="amber">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                            </svg>
                            {m.streak}d
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {can("members.update") && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                            Edit
                          </Button>
                        )}
                        {can("members.update") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updateMember.isPending}
                            onClick={() => toggleActive(m, !m.isActive)}
                          >
                            {m.isActive ? "Disable" : "Enable"}
                          </Button>
                        )}
                        {can("members.delete") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red hover:bg-red-soft"
                            onClick={() => setDeleteTarget(m)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isLoading && members.length === 0 && (
            <EmptyState title="No members found" hint="Try a different search or filter." />
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[12px] text-ink-faint">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </Async>

      <Modal open={open} onClose={() => setOpen(false)} title="Add member" subtitle="Subscription starts immediately.">
        <form onSubmit={addMember} className="space-y-4">
          <Field label="Full name">
            <Input
              required
              id="member-name"
              name="member-name"
              aria-label="Full name"
              placeholder="e.g. Aisha Kapoor"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              id="member-email"
              name="member-email"
              aria-label="Email"
              placeholder="aisha@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country code">
              <CountryCodeSelect
                value={form.countryCode}
                onChange={(v) => setForm({ ...form, countryCode: v })}
              />
            </Field>
            <Field label="Phone number">
              <Input
                id="member-phone"
                name="member-phone"
                aria-label="Phone number"
                placeholder="90000 00000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch">
              <Select
                required
                id="member-branch"
                aria-label="Branch"
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value, planId: "" })}
              >
                {branches.length === 0 && <option value="">No branches — add one first</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Plan">
              <Select
                required
                id="member-plan"
                aria-label="Plan"
                value={selectedPlan}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                {visiblePlans.length === 0 && (
                  <option value="" disabled>No plans — create one first</option>
                )}
                {visiblePlans.length > 0 && <option value="" disabled>Select a plan…</option>}
                {visiblePlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setForm({
                  name: "",
                  email: "",
                  countryCode: "+91",
                  phone: "",
                  gender: "Male",
                  branchId: form.branchId,
                  planId: "",
                });
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addGuard.busy || !form.planId}>
              {addGuard.busy ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit member"
        subtitle={editing?.name ?? ""}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input
                required
                id="member-edit-first-name"
                name="member-edit-first-name"
                aria-label="First name"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </Field>
            <Field label="Last name">
              <Input
                id="member-edit-last-name"
                name="member-edit-last-name"
                aria-label="Last name"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              id="member-edit-email"
              name="member-edit-email"
              aria-label="Email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country code">
              <CountryCodeSelect
                value={editForm.country_code}
                onChange={(v) => setEditForm({ ...editForm, country_code: v })}
              />
            </Field>
            <Field label="Phone number">
              <Input
                id="member-edit-phone"
                name="member-edit-phone"
                aria-label="Phone number"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender">
              <Select
                id="member-edit-gender"
                name="member-edit-gender"
                aria-label="Gender"
                value={editForm.gender}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                id="member-edit-status"
                name="member-edit-status"
                aria-label="Status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="frozen">Frozen</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMember.isPending}>
              {updateMember.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ""}?`}
        subtitle="This member and their records will be removed"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {deleteTarget?.name ?? "this member"} removes them from the roster permanently. This cannot be
          undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={deleteMember.isPending} onClick={confirmDelete}>
            Delete member
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
