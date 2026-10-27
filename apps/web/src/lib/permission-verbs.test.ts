import assert from "node:assert/strict";
import { test } from "node:test";

import {
  moduleIsManaged,
  toggleVerb,
  verbIsAvailable,
  verbIsOn,
} from "./permission-verbs.ts";

const ATTENDANCE = ["attendance.checkin", "attendance.manage", "attendance.records.view"];
const BILLING = [
  "billing.invoices.create",
  "billing.invoices.view",
  "billing.manage",
  "billing.payments.capture",
  "billing.payments.refund",
  "billing.settings.view",
];
const EXPENSES = ["expenses.manage", "expenses.view"];
const IDENTITY = ["roles.manage", "users.manage", "users.view"];
const MEMBERS = ["members.checkin", "members.create", "members.delete", "members.update", "members.view"];

test("attendance read/write toggle their concrete codes only", () => {
  assert.deepEqual([...toggleVerb(ATTENDANCE, "read", new Set())], ["attendance.records.view"]);
  assert.deepEqual([...toggleVerb(ATTENDANCE, "write", new Set())], ["attendance.checkin"]);
  assert.equal(verbIsOn(ATTENDANCE, "read", new Set(["attendance.checkin"])), false);
});

test("attendance update/delete are unavailable and never infer manage", () => {
  assert.equal(verbIsAvailable(ATTENDANCE, "update"), false);
  assert.equal(verbIsAvailable(ATTENDANCE, "delete"), false);
  assert.deepEqual([...toggleVerb(ATTENDANCE, "update", new Set())], []);
  assert.deepEqual([...toggleVerb(ATTENDANCE, "delete", new Set())], []);
});

test("billing write toggles its three concrete codes, manage untouched", () => {
  const write = toggleVerb(BILLING, "write", new Set());
  assert.deepEqual(
    [...write].sort(),
    ["billing.invoices.create", "billing.payments.capture", "billing.payments.refund"],
  );
  assert.equal(verbIsAvailable(BILLING, "update"), false);
  assert.equal(verbIsAvailable(BILLING, "delete"), false);
});

test("expenses only exposes read; identity only exposes read", () => {
  assert.equal(verbIsAvailable(EXPENSES, "read"), true);
  for (const verb of ["write", "update", "delete"] as const) {
    assert.equal(verbIsAvailable(EXPENSES, verb), false, `expenses ${verb}`);
  }
  assert.deepEqual([...toggleVerb(EXPENSES, "write", new Set())], []);
  assert.equal(verbIsAvailable(IDENTITY, "read"), true);
  for (const verb of ["write", "update", "delete"] as const) {
    assert.equal(verbIsAvailable(IDENTITY, verb), false, `identity ${verb}`);
  }
});

test("granular modules keep one pill per verb", () => {
  for (const verb of ["read", "write", "update", "delete"] as const) {
    assert.equal(verbIsAvailable(MEMBERS, verb), true, verb);
  }
  assert.deepEqual([...toggleVerb(MEMBERS, "update", new Set())], ["members.update"]);
  assert.deepEqual([...toggleVerb(MEMBERS, "delete", new Set())], ["members.delete"]);
});

test("selected manage locks the row visually (all on) but is not a verb code", () => {
  const selected = new Set(["attendance.manage"]);
  assert.equal(moduleIsManaged(ATTENDANCE, selected), true);
  for (const verb of ["read", "write", "update", "delete"] as const) {
    assert.equal(verbIsOn(ATTENDANCE, verb, selected), true, verb);
    assert.equal(verbIsAvailable(ATTENDANCE, verb), verb === "read" || verb === "write", verb);
  }
});

test("toggling a concrete verb off keeps manage selected", () => {
  const selected = new Set(["attendance.manage", "attendance.records.view"]);
  assert.deepEqual([...toggleVerb(ATTENDANCE, "read", selected)], ["attendance.manage"]);
});

test("verb toggles never add or remove manage", () => {
  assert.equal(toggleVerb(BILLING, "write", new Set()).has("billing.manage"), false);
  assert.equal(toggleVerb(BILLING, "write", new Set(["billing.manage"])).has("billing.manage"), true);
  assert.equal(toggleVerb(EXPENSES, "read", new Set(["expenses.manage"])).has("expenses.manage"), true);
});

test("module with only manage has no verb pills available", () => {
  assert.equal(verbIsAvailable(["reports.manage"], "write"), false);
  assert.equal(verbIsAvailable(["reports.view"], "delete"), false);
});
