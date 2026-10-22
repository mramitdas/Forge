import { test } from "node:test";
import assert from "node:assert/strict";
import { toUiInvoice, toUiMember } from "./adapters.ts";
import type { CheckInOut, InvoiceOut, MemberOut } from "./types.ts";

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

test("future-due open invoice stays open", () => {
  const ui = toUiInvoice(invoice({ due_date: "2099-06-01" }));
  assert.equal(ui.status, "open");
});

function member(overrides: Partial<MemberOut>): MemberOut {
  return {
    id: "mem-1",
    branch_id: "br-1",
    first_name: "Asha",
    last_name: "Rao",
    full_name: "Asha Rao",
    email: "asha@example.com",
    phone: null,
    country_code: "+91",
    gender: "Female",
    status: "active",
    is_active: true,
    avatar_path: null,
    joined_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    version: 1,
    ...overrides,
  };
}

function checkin(overrides: Partial<CheckInOut>): CheckInOut {
  return {
    id: "ci-1",
    member_id: "mem-1",
    branch_id: "br-1",
    recorded_at: new Date().toISOString(),
    source: "manual",
    result: "allowed",
    reason: null,
    ...overrides,
  };
}

test("member stats count only granted check-ins", () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const ui = toUiMember(member({}), {
    subscriptions: [],
    invoices: [],
    checkins: [
      checkin({ id: "ci-1", result: "allowed", recorded_at: today }),
      checkin({ id: "ci-2", result: "denied", recorded_at: yesterday }),
    ],
  });
  assert.equal(ui.visits, 1);
  assert.equal(ui.streak, 1);
  assert.ok(ui.lastCheckIn);
});

test("denied-only member shows zero visits and no last check-in", () => {
  const ui = toUiMember(member({}), {
    subscriptions: [],
    invoices: [],
    checkins: [checkin({ result: "denied" })],
  });
  assert.equal(ui.visits, 0);
  assert.equal(ui.streak, 0);
  assert.equal(ui.lastCheckIn, null);
});

test("member status uses the 3-value vocabulary with active fallback", () => {
  const ctx = { subscriptions: [], invoices: [], checkins: [] };
  assert.equal(toUiMember(member({ status: "inactive" }), ctx).status, "inactive");
  assert.equal(toUiMember(member({ status: "frozen" }), ctx).status, "frozen");
  assert.equal(toUiMember(member({ status: "active" }), ctx).status, "active");
  assert.equal(toUiMember(member({ status: "prospect" }), ctx).status, "active");
  assert.equal(toUiMember(member({ status: "lead" }), ctx).tags.includes("LEAD"), false);
});
