"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  StatusBadge,
  Toast,
} from "@/components/ui";
import { Async, Count, Skeleton, SkeletonText } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { MonthlyChart } from "@/components/monthly-chart";
import { YearSelector } from "@/components/year-selector";
import { inr } from "@/lib/mock";
import { useInvoiceSummary, useInvoicesPage, useMemberCtx, usePayInvoice } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useInFlight } from "@/lib/inflight";
import type { InvoiceSummaryOut } from "@/lib/types";

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const methods = [
  {
    id: "upi",
    label: "UPI",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 9.5h3l-3 5h3M13.5 9.5c1.4 0 2.5.9 2.5 2.5s-1.1 2.5-2.5 2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "card",
    label: "Card",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "netbanking",
    label: "Netbanking",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 11h16l-8-7-8 7zM5 11v6h4v-6M10 11v6h4v-6M15 11v6h4v-6M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "cash",
    label: "Cash",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6.5 9.5h.01M17.5 14.5h.01" strokeLinecap="round" />
      </svg>
    ),
  },
];

function SummaryCards({
  summary,
  isLoading,
  isError,
  year,
}: {
  summary: InvoiceSummaryOut | undefined;
  isLoading: boolean;
  isError: boolean;
  year: number;
}) {
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
          {
            label: "Outstanding",
            value: inr(summary?.outstanding_minor ?? 0),
            tone: "text-amber",
            hint: `Issued in ${year}`,
          },
          {
            label: "Collected",
            value: inr(summary?.collected_minor ?? 0),
            tone: "text-green",
            hint: `Received in ${year}`,
          },
          {
            label: "Overdue",
            value: inr(summary?.overdue_minor ?? 0),
            tone: "text-red",
            hint: `Issued in ${year} · past due`,
          },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[12px] font-medium text-ink-faint">{c.label}</p>
            <p className={`mt-1.5 text-[22px] font-semibold tracking-tight ${c.tone}`}>{c.value}</p>
            <p className="mt-1 text-[11px] text-ink-faint">{c.hint}</p>
          </Card>
        ))}
      </div>
    </Async>
  );
}

export default function BillingPage() {
  const PAGE_SIZE = 20;
  const [paying, setPaying] = useState<string | null>(null);
  const [method, setMethod] = useState("upi");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());

  const { invoices, total, isLoading, isError } = useInvoicesPage({
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    year,
  });
  const { summary, isLoading: summaryLoading, isError: summaryError } = useInvoiceSummary(year);
  const { members: rawMembers } = useMemberCtx();
  const payInvoice = usePayInvoice();
  const can = useCan();
  const payGuard = useInFlight();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [year, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const chartData = useMemo(
    () =>
      MONTH_KEYS.map((key) => ({
        month: key.charAt(0).toUpperCase() + key.slice(1),
        amount: summary?.monthly?.[key] ?? 0,
      })),
    [summary],
  );

  const memberMap = useMemo(
    () => new Map(rawMembers.map((m) => [m.id, m.full_name || m.first_name])),
    [rawMembers],
  );
  const memberName = (id: string) => memberMap.get(id) ?? "Unknown";

  const invoice = invoices.find((i) => i.id === paying);

  async function confirmPay() {
    if (!invoice) return;
    await payGuard.run(async () => {
      try {
        await payInvoice.mutateAsync({
          invoice_id: invoice.id,
          method,
          idempotency_key: crypto.randomUUID(),
        });
        setPaying(null);
        setToast({ type: "success", message: `${invoice.number} marked as paid via ${method}` });
      } catch {
        setToast({ type: "error", message: "Payment failed — please try again" });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-ink-faint">
            <Count loading={isLoading} width="inline-block h-3 w-16">
              {total} {total === 1 ? "invoice" : "invoices"}
            </Count>
          </p>
          <YearSelector
            id="billing-year"
            year={year}
            onYearChange={setYear}
            ariaLabel="Select billing year"
          />
        </div>
        <Input
          id="billing-search"
          name="billing-search"
          aria-label="Search invoice # or member"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice # or member"
          className="h-8! w-52! text-[12px]!"
        />
      </div>

      <SummaryCards
        summary={summary}
        isLoading={summaryLoading}
        isError={summaryError}
        year={year}
      />

      <MonthlyChart
        title="Collections"
        subtitle={`Payments received in ${year}`}
        seriesName="Collected"
        ariaLabel={`Payments received in ${year}`}
        data={chartData}
      />

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={7} rows={8} />}>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-fill text-[12px] text-ink-faint">
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="group border-b border-line last:border-0 hover:bg-accent-soft/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/billing/${i.id}`} className="font-medium text-accent hover:underline">
                      {i.number}
                    </Link>
                    <p className="text-[12px] text-ink-faint">{i.lines[0]?.description}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{memberName(i.memberId)}</td>
                  <td className="px-4 py-3 text-ink-soft">{i.issueDate}</td>
                  <td className="px-4 py-3 text-ink-soft">{i.dueDate}</td>
                  <td className="px-4 py-3 font-medium">{inr(i.total)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {(i.status === "open" || i.status === "overdue") && can("billing.payments.capture") && (
                      <Button size="xs" onClick={() => setPaying(i.id)}>
                        Pay now
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {search.trim() && invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-ink-faint">
                    No invoices match “{search}” in {year}.
                  </td>
                </tr>
              )}
              {!search.trim() && total === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-ink-faint">
                    No invoices issued in {year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-faint">
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
        open={paying !== null}
        onClose={() => setPaying(null)}
        title={`Pay ${invoice?.number ?? ""}`}
        subtitle={invoice ? `For ${memberName(invoice.memberId)}` : undefined}
      >
        {invoice && (
          <div className="space-y-4">
            <div className="rounded-xl bg-fill p-4 glass-edge">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-soft">Amount due</span>
                <span className="text-[18px] font-semibold tracking-tight">
                  {inr(invoice.total)}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {invoice.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-[12px] text-ink-faint">
                    <span>{l.description} × {l.qty}</span>
                    <span>{inr(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[12px] text-ink-faint">
                  <span>GST</span>
                  <span>{inr(invoice.tax)}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-ink-soft">Payment method</p>
              <div className="grid grid-cols-3 gap-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[12px] font-semibold transition-all duration-150 ${
                      method === m.id
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line text-ink-soft hover:border-ink-faint"
                    }`}
                  >
                    <span className="text-[18px]">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setPaying(null)}>
                Cancel
              </Button>
              <Button onClick={confirmPay} disabled={payGuard.busy}>
                Pay {inr(invoice.total)}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
