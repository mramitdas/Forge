// Mirrors backend/app/core/security.py:password_rule_failures — keep in sync
// (rule codes, order, and semantics). Frontend is equal-or-stricter on unicode:
// JS /\d/ is ASCII-only where Python \d matches Unicode Nd — safe direction,
// since the backend 422 is the real gate.

export type PasswordRule = "uppercase" | "lowercase" | "digit" | "special" | "length";

export type PasswordChecks = Record<PasswordRule, boolean>;

export type PasswordCheckResult = {
  checks: PasswordChecks;
  failed: PasswordRule[];
};

const RULE_MATCHERS: Record<PasswordRule, (password: string) => boolean> = {
  uppercase: (password) => /[A-Z]/.test(password),
  lowercase: (password) => /[a-z]/.test(password),
  digit: (password) => /\d/.test(password),
  special: (password) => /[^A-Za-z0-9]/.test(password),
  // Code-point length (spread), mirroring Python len() — not UTF-16 units.
  length: (password) => [...password].length >= 8,
};

const RULE_ORDER = Object.keys(RULE_MATCHERS) as PasswordRule[];

export function passwordChecks(password: string): PasswordCheckResult {
  const checks = {} as PasswordChecks;
  const failed: PasswordRule[] = [];
  for (const rule of RULE_ORDER) {
    checks[rule] = RULE_MATCHERS[rule](password);
    if (!checks[rule]) failed.push(rule);
  }
  return { checks, failed };
}

export function allChecksPass({ failed }: PasswordCheckResult): boolean {
  return failed.length === 0;
}
