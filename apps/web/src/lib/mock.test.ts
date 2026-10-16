import assert from "node:assert/strict";
import { test } from "node:test";

import { inr, money } from "./mock.ts";

test("inr treats its input as minor units (paise), not rupees", () => {
  assert.equal(inr(150000), "₹1,500"); // Rs 1,500 plan
  assert.equal(inr(118000), "₹1,180"); // invoice total with GST
  assert.equal(inr(299), "₹3"); // sub-rupee values round to the rupee
  assert.equal(inr(0), "₹0");
});

test("inr groups with Indian digit grouping", () => {
  assert.equal(inr(750000), "₹7,500"); // the platform MRR that displayed ₹7,50,000
  assert.equal(inr(750000000), "₹75,00,000"); // Rs 75 lakh expressed in paise
});

test("money formats minor units in the given currency", () => {
  assert.equal(money(177000, "INR"), "₹1,770");
  assert.equal(money(177000, "USD"), "$1,770");
  assert.equal(money(0, "INR"), "₹0");
});
