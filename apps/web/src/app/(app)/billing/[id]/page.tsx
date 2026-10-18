"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, EmptyState, Modal, StatusBadge, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { TableSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { useInvoiceDetail, useVoidInvoice } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const { invoice, isLoading, isError } = useInvoiceDetail(params.id);
  const voidInvoice = useVoidInvoice();
  const can = useCan();
  const [voidOpen, setVoidOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  async function confirmVoid() {
    if (!invoice) return;
    try {
      await voidInvoice.mutateAsync(invoice.id);
      setVoidOpen(false);
      setToast({ type: "success", message: `${invoice.number} voided` });
    } catch {
      setToast({ type: "error", message: "Could not void invoice" });
    }
  }

  if (!isLoading && !invoice) {
    return (
      <div>
        <EmptyState title="Invoice not found" hint="It may have been removed." />
        <div className="text-center">
          <Link href="/billing" className="text-[13px] font-medium text-accent hover:underline">
            ← Back to billing
          </Link>
        </div>
      </div>
    );
  }

  const cancellable =
    invoice && invoice.status !== "paid" && invoice.status !== "void";

  return (
    <div className="space-y-6">
      <Link href="/billing" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Billing
      </Link>

      <Async loading={isLoading} error={isError} skeleton={<TableSkeleton columns={3} rows={5} />}>
        {invoice && (
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-[22px] font-semibold tracking-tight">{invoice.number}</h2>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-1 text-[13px] text-ink-faint">
                  Issued {invoice.issueDate} · Due {invoice.dueDate}
                </p>
              </div>
              <div className="flex gap-2">
                {cancellable && can("billing.invoices.view") && (
                  <Button variant="secondary" className="text-red hover:text-red" onClick={() => setVoidOpen(true)}>
                    Cancel invoice
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
              {[
                { label: "Subtotal", value: inr(invoice.subtotal) },
                { label: "GST", value: inr(invoice.tax) },
                { label: "Total", value: inr(invoice.total) },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[12px] text-ink-faint">{s.label}</p>
                  <p className="mt-0.5 text-[18px] font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="kicker mb-2">Line items</p>
              <div className="divide-y divide-line rounded-xl border border-line">
                {invoice.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 text-[13px]">
                    <div>
                      <p className="font-medium">{l.description}</p>
                      <p className="text-[12px] text-ink-faint">× {l.qty}</p>
                    </div>
                    <span className="font-medium">{inr(l.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-between rounded-xl bg-fill px-4 py-3 text-[13px] glass-edge">
              <span className="text-ink-soft">Amount paid</span>
              <span className="font-semibold">{inr(invoice.paid)}</span>
            </div>
            <p className="mt-3 text-[12px] text-ink-faint">Taxes are computed at the plan&apos;s GST rate.</p>
          </Card>
        )}
      </Async>

      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title={`Cancel ${invoice?.number ?? ""}?`}
        subtitle="This invoice will be voided and is no longer payable"
      >
        <p className="text-[13px] text-ink-soft">
          Voiding this invoice removes the amount from outstanding. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setVoidOpen(false)}>Keep invoice</Button>
          <Button type="button" variant="danger" disabled={voidInvoice.isPending} onClick={confirmVoid}>
            {voidInvoice.isPending ? "Voiding…" : "Void invoice"}
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
