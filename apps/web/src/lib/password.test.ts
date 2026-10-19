import assert from "node:assert/strict";
import { test } from "node:test";

import { passwordChecks, allChecksPass } from "./password.ts";
import type { PasswordRule } from "./password.ts";

test("weak passwords fail the expected rules, in the canonical order", () => {
  const cases: Array<[string, PasswordRule[]]> = [
    ["alllowercase1!", ["uppercase"]],
    ["ALLUPPERCASE1!", ["lowercase"]],
    ["NoDigits!!xx", ["digit"]],
    ["NoSpecial123", ["special"]],
    ["Ab1!", ["length"]],
    ["owner-pass-123", ["uppercase"]],
    ["", ["uppercase", "lowercase", "digit", "special", "length"]],
  ];
  for (const [pw, expected] of cases) {
    assert.deepEqual(passwordChecks(pw).failed, expected, pw);
    assert.equal(allChecksPass(passwordChecks(pw)), false, pw);
  }
});

test("strong passwords pass every rule", () => {
  for (const pw of ["Owner-Pass-123!", "Str0ng!Passw0rd", "A1!aaaaa"]) {
    assert.deepEqual(passwordChecks(pw).failed, []);
    assert.equal(allChecksPass(passwordChecks(pw)), true, pw);
  }
});

test("boundary: 7 chars fails length, 8 chars passes length", () => {
  assert.equal(passwordChecks("Ab1!xyz").failed.includes("length"), true);
  assert.equal(passwordChecks("Ab1!xyzw").failed.includes("length"), false);
});

test("unicode digits do NOT count as a digit (stricter than backend, which uses Python \\d)", () => {
  // Python re \d matches Unicode Nd (e.g. Arabic-Indic ١); JS /\d/ is ASCII-only.
  // Backend is therefore more lenient — frontend reject + backend accept is the
  // safe direction (client-side hint is advisory; backend 422 is the gate).
  assert.equal(passwordChecks("AAAAAAA١!").failed.includes("digit"), true);
});

test("failed list is in canonical order: uppercase, lowercase, digit, special, length", () => {
  assert.deepEqual(passwordChecks("!").failed, ["uppercase", "lowercase", "digit", "length"]);
  assert.deepEqual(passwordChecks("A").failed, ["lowercase", "digit", "special", "length"]);
});
