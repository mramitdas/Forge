import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAPABILITIES,
  capabilityIsAvailable,
  manageIsOn,
  moduleLabel,
  toggleManage,
  toggleView,
  viewIsOn,
} from "./permission-verbs.ts";

const MEMBERS = ["members.manage", "members.view"];
const BILLING = ["billing.manage", "billing.view"];

test("every module exposes exactly view and manage", () => {
  assert.deepEqual([...CAPABILITIES], ["view", "manage"]);
  for (const capability of CAPABILITIES) {
    assert.equal(capabilityIsAvailable(MEMBERS, capability), true, capability);
  }
});

test("view toggles only the view code", () => {
  assert.deepEqual([...toggleView(MEMBERS, new Set())], ["members.view"]);
  assert.deepEqual([...toggleView(MEMBERS, new Set(["members.view"]))], []);
  assert.equal(viewIsOn(MEMBERS, new Set(["members.view"])), true);
});

test("manage includes view", () => {
  const selected = toggleManage(MEMBERS, new Set());
  assert.deepEqual([...selected].sort(), ["members.manage", "members.view"]);
  assert.equal(viewIsOn(MEMBERS, selected), true);
  assert.equal(manageIsOn(MEMBERS, selected), true);
});

test("manage off leaves view on (read-only downgrade)", () => {
  const selected = new Set(["members.manage", "members.view"]);
  assert.deepEqual([...toggleManage(MEMBERS, selected)], ["members.view"]);
});

test("view is locked while manage is on", () => {
  const selected = new Set(["billing.manage", "billing.view"]);
  assert.deepEqual([...toggleView(BILLING, selected)].sort(), ["billing.manage", "billing.view"]);
  assert.equal(manageIsOn(BILLING, selected), true);
});

test("modules missing a capability report it unavailable", () => {
  assert.equal(capabilityIsAvailable(["reports.view"], "manage"), false);
  assert.equal(capabilityIsAvailable(["members.view"], "manage"), false);
  assert.equal(capabilityIsAvailable(MEMBERS, "view"), true);
});

test("module labels use the sidebar tab names", () => {
  assert.equal(moduleLabel("attendance"), "Check-ins");
  assert.equal(moduleLabel("identity"), "Employees & Roles");
  assert.equal(moduleLabel("membership"), "Plans & Subscriptions");
  assert.equal(moduleLabel("tenancy"), "Branches & settings");
  assert.equal(moduleLabel("custom"), "custom");
});
