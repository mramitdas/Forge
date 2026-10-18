import { test } from "node:test";
import assert from "node:assert/strict";
import { toUiInvoice } from "./adapters.ts";
import type { InvoiceOut } from "./types.ts";

function invoice(overrides: Partial<InvoiceOut>): InvoiceOut {
  return {
    id: "inv-1",
    number: "INV-2026-000001",
    member_id: "mem-1",
    branch_id: "br-1",
    subscription_id: null,
    status: "open",
    issue_date: "2026-10-01",
    due_date: "2026-10-31",
    currency: "INR",
    lines: [],
    subtotal_minor: 100000,
    tax_minor: 0,
    total_minor: 100000,
    paid_minor: 0,
    ...overrides,
  } as InvoiceOut;
}

test("past-due partial invoice derives as overdue", () => {
  const ui = toUiInvoice(invoice({ status: "partial", due_date: "2024-01-01", paid_minor: 50000 }));
  assert.equal(ui.status, "overdue");
});

test("future-due partial invoice stays open", () => {
  const ui = toUiInvoice(invoice({ status: "partial", due_date: "2099-01-01" }));
  assert.equal(ui.status, "open");
});

test("past-due open invoice derives as overdue", () => {
  const ui = toUiInvoice(invoice({ status: "open", due_date: "2024-01-01" }));
  assert.equal(ui.status, "overdue");
});

test("void stays void regardless of due date", () => {
  const ui = toUiInvoice(invoice({ status: "void", due_date: "2024-01-01" }));
  assert.equal(ui.status, "void");
});
