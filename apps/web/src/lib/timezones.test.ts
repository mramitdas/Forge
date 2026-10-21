import assert from "node:assert/strict";
import { test } from "node:test";

import { formatTimezone } from "./timezones.ts";

test("formatTimezone renders a chip with the observed GMT offset (Asia/Kolkata)", () => {
  const out = formatTimezone("Asia/Kolkata");
  assert.equal(out.includes("Asia/Kolkata"), true, out);
  assert.equal(out.includes("GMT+5:30"), true, out);
});

test("formatTimezone for UTC renders a GMT label", () => {
  const out = formatTimezone("UTC");
  assert.equal(out.includes("UTC"), true, out);
  assert.equal(out.includes("GMT"), true, out);
});

test("formatTimezone falls back to the raw id for an invalid zone", () => {
  assert.equal(formatTimezone("Not/AZone"), "Not/AZone");
});

test("formatTimezone always starts with the tz id (prefix contract: `${tz} (...)`)", () => {
  for (const tz of ["Asia/Kolkata", "UTC", "Europe/London", "America/New_York", "Not/AZone"]) {
    assert.equal(formatTimezone(tz).startsWith(tz), true, tz);
  }
});
