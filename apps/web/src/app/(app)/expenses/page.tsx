"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, Modal, Select, Textarea, Toast } from "@/components/ui";
import { Async, Skeleton, SkeletonText } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { useCreateExpense, useDeleteExpense, useExpensesData, useExpensesPage, useUpdateExpense } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useInFlight } from "@/lib/inflight";
import type { ExpenseOut } from "@/lib/types";

const CATEGORIES = ["Rent", "Salary", "Electricity", "Water", "Internet", "Maintenance", "Marketing", "Other"];
const METHODS = ["cash", "upi", "card", "netbanking", "wallet", "other"];

function SummaryCards() {
  const { expenses, isLoading, isError } = useExpensesData();

  const total = expenses.reduce((a, e) => a + e.amount_minor, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = expenses
    .filter((e) => new Date(e.paid_at) >= monthStart)
    .reduce((a, e) => a + e.amount_minor, 0);
  const categories = new Set(expenses.map((e) => e.category)).size;

  return (
    <Async
      loading={isLoading}
      error={isError}
      skeleton={
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <SkeletonText width="w-20" />
              <Skeleton className="mt-1.5 h-7 w-28" />
            </Card>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total spent", value: inr(total), tone: "text-ink" },
          { label: "This month", value: inr(thisMonth), tone: "text-amber" },
          { label: "Categories", value: String(categories), tone: "text-green" },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[12px] font-medium text-ink-faint">{c.label}</p>
            <p className={`mt-1.5 text-[22px] font-semibold tracking-tight ${c.tone}`}>{c.value}</p>
          </Card>
        ))}
      </div>
    </Async>
  );
}

export default function ExpensesPage() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExpenseOut | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [form, setForm] = useState({
    category: "Rent",
    description: "",
    amount: "",
    method: "cash",
    paidAt: new Date().toISOString().slice(0, 10),
  });

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const { expenses, total, isLoading, isError } = useExpensesPage({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const can = useCan();
  const addGuard = useInFlight();
  const editGuard = useInFlight();
  const deleteGuard = useInFlight();

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const sorted = useMemo(
    () => [...expenses].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)),
    [expenses],
  );

  function openEdit(e: ExpenseOut) {
    const d = new Date(e.paid_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setForm({
      category: e.category,
      description: e.description || "",
      amount: String(e.amount_minor / 100),
      method: e.method,
      paidAt: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    });
    setEditing(e);
  }

  function closeModal() {
    setAdding(false);
    setEditing(null);
  }

  async function confirmAdd() {
    const amountMinor = Math.round(Number(form.amount) * 100);
    if (!form.amount || Number.isNaN(amountMinor) || amountMinor <= 0) {
      setToast({ type: "error", message: "Enter a valid amount" });
      return;
    }
    await addGuard.run(async () => {
      try {
        await createExpense.mutateAsync({
          category: form.category,
          description: form.description || undefined,
          amount_minor: amountMinor,
          method: form.method,
          paid_at: new Date(form.paidAt).toISOString(),
        });
        setAdding(false);
        setForm({ ...form, description: "", amount: "" });
        setToast({ type: "success", message: `Expense recorded` });
      } catch {
        setToast({ type: "error", message: "Could not save the expense — please try again" });
      }
    });
  }

  async function confirmUpdate() {
    if (!editing) return;
    const amountMinor = Math.round(Number(form.amount) * 100);
    if (!form.amount || Number.isNaN(amountMinor) || amountMinor <= 0) {
      setToast({ type: "error", message: "Enter a valid amount" });
      return;
    }
    await editGuard.run(async () => {
      try {
        await updateExpense.mutateAsync({
          id: editing.id,
          body: {
            category: form.category,
            description: form.description || null,
            amount_minor: amountMinor,
            method: form.method,
            paid_at: new Date(form.paidAt).toISOString(),
          },
        });
        setEditing(null);
        setToast({ type: "success", message: `Expense updated` });
      } catch {
        setToast({ type: "error", message: "Could not update the expense — please try again" });
      }
    });
  }

  async function confirmDelete(id: string) {
    await deleteGuard.run(async () => {
      try {
        await deleteExpense.mutateAsync(id);
        setToast({ type: "success", message: "Expense deleted" });
      } catch {
        setToast({ type: "error", message: "Could not delete the expense" });
      }
    });
  }

  return (
    <div className="space-y-5">
      <SummaryCards />

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={6} rows={8} />}>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight">Expenses</h2>
            <div className="flex items-center gap-2">
              <Badge tone="gray">{total} total</Badge>
              {can("expenses.manage") && (
                <Button size="xs" onClick={() => setAdding(true)}>
                  Add expense
                </Button>
              )}
            </div>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors">
                  <td className="px-5 py-3 text-ink-soft">
                    {new Date(e.paid_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="gray">{e.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{e.description || "—"}</td>
                  <td className="px-4 py-3 capitalize text-ink-soft">{e.method}</td>
                  <td className="px-4 py-3 font-medium">{inr(e.amount_minor)}</td>
                  <td className="px-5 py-3 text-right">
                    {can("expenses.manage") && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red hover:bg-red-soft"
                          disabled={deleteGuard.busy || deleteExpense.isPending}
                          onClick={() => confirmDelete(e.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3 text-[13px] text-ink-faint">
            <span>
              Page {page} of {totalPages}
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </span>
          </div>
        </Card>
      </Async>

      <Modal
        open={adding || editing !== null}
        onClose={closeModal}
        title={editing ? "Edit expense" : "Add expense"}
        subtitle="Rent, salaries, utilities…"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Category</span>
              <Select id="expense-category" name="expense-category" aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Method</span>
              <Select id="expense-method" name="expense-method" aria-label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Amount (₹)</span>
              <Input
                type="number"
                min="1"
                id="expense-amount"
                name="expense-amount"
                aria-label="Amount (₹)"
                placeholder="25000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Paid on</span>
              <Input
                type="date"
                id="expense-paid-at"
                name="expense-paid-at"
                aria-label="Paid on"
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Description</span>
            <Textarea
              rows={2}
              id="expense-description"
              name="expense-description"
              aria-label="Description"
              placeholder="Optional note"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={editing ? confirmUpdate : confirmAdd}
              disabled={editing ? editGuard.busy || updateExpense.isPending : addGuard.busy || createExpense.isPending}
            >
              {editing ? "Save changes" : "Save expense"}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
