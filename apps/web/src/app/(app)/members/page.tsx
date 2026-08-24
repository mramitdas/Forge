"use client";

import Link from "next/link";
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
import { byId, useBranches, useCreateMember, useMembersPage, usePlans, useSubscribe, useActivateSubscription } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { COUNTRY_CODES } from "@/lib/countries";

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

const filters = ["All", "active", "paused", "expired", "lead"] as const;
const statusParam: Record<(typeof filters)[number], string | undefined> = {
  All: undefined,
  active: "active",
  paused: "frozen",
  expired: "lapsed",
  lead: "lead",
};

const PAGE_SIZE = 10;

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number]>("All");
  const [branch, setBranch] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const subscribe = useSubscribe();
  const activate = useActivateSubscription();
  const can = useCan();

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const nameParts = form.name.trim().split(/\s+/);
    if (!nameParts[0]) return;
    setSubmitting(true);
    try {
      const created = await createMember.mutateAsync({
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(" ") || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        country_code: form.countryCode || undefined,
        gender: form.gender,
        branch_id: form.branchId,
        status: "lead",
      });
      if (form.planId) {
        const sub = await subscribe.mutateAsync({
          member_id: created.id,
          plan_id: form.planId,
          branch_id: form.branchId,
        });
        await activate.mutateAsync(sub.id);
      }
      setOpen(false);
      setToast(`${form.name.trim()} added as lead`);
      setForm({ name: "", email: "", countryCode: "+91", phone: "", gender: "Male", branchId: form.branchId, planId: "" });
    } catch {
      setToast("Failed to add member");
    } finally {
      setSubmitting(false);
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
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
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
                    className="group border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors"
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
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/members/${m.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        View
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add member" subtitle="New members start as leads until they subscribe.">
        <form onSubmit={addMember} className="space-y-4">
          <Field label="Full name">
            <Input
              required
              placeholder="e.g. Aisha Kapoor"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
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
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                {branches.length === 0 && <option value="">No branches — add one first</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Intended plan">
              <Select
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                <option value="">No plan yet</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast type={toast.startsWith("Failed") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
