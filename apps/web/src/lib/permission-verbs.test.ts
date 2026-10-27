import assert from "node:assert/strict";
import { test } from "node:test";

import { toggleVerb, verbIsAvailable, verbIsOn } from "./permission-verbs.ts";

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

test("attendance update grants manage because no granular update code exists", () => {
  const next = toggleVerb(ATTENDANCE, "update", new Set());
  assert.deepEqual([...next], ["attendance.manage"]);
  for (const verb of ["read", "write", "update", "delete"] as const) {
    assert.equal(verbIsOn(ATTENDANCE, verb, next), true, verb);
  }
});

test("attendance delete grants manage too", () => {
  const next = toggleVerb(ATTENDANCE, "delete", new Set());
  assert.deepEqual([...next], ["attendance.manage"]);
});

test("attendance write still grants the concrete check-in code, not manage", () => {
  const next = toggleVerb(ATTENDANCE, "write", new Set());
  assert.deepEqual([...next], ["attendance.checkin"]);
});

test("billing update falls back to manage while write stays granular", () => {
  assert.deepEqual([...toggleVerb(BILLING, "update", new Set())], ["billing.manage"]);
  const write = toggleVerb(BILLING, "write", new Set());
  assert.deepEqual(
    [...write].sort(),
    ["billing.invoices.create", "billing.payments.capture", "billing.payments.refund"],
  );
  assert.equal(write.has("billing.manage"), false);
});

test("expenses write falls back to manage", () => {
  assert.deepEqual([...toggleVerb(EXPENSES, "write", new Set())], ["expenses.manage"]);
});

test("identity update grants every manage code for the module", () => {
  const next = toggleVerb(IDENTITY, "update", new Set());
  assert.deepEqual([...next].sort(), ["roles.manage", "users.manage"]);
});

test("granular update wins when a module has one (members)", () => {
  const next = toggleVerb(MEMBERS, "update", new Set());
  assert.deepEqual([...next], ["members.update"]);
});

test("turning a verb off drops manage but keeps other granular codes", () => {
  const selected = new Set(["attendance.manage", "attendance.records.view"]);
  assert.deepEqual([...toggleVerb(ATTENDANCE, "update", selected)], ["attendance.records.view"]);
});

test("verbs are unavailable only when the module has no matching or manage code", () => {
  assert.equal(verbIsAvailable(ATTENDANCE, "update"), true);
  assert.equal(verbIsAvailable(EXPENSES, "write"), true);
  assert.equal(verbIsAvailable(["reports.view"], "delete"), false);
  assert.equal(verbIsAvailable(MEMBERS, "delete"), true);
});
