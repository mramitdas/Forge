export type PasswordRule = "uppercase" | "lowercase" | "digit" | "special" | "length";

export type PasswordChecks = Record<PasswordRule, boolean>;

export type PasswordCheckResult = {
  checks: PasswordChecks;
  failed: PasswordRule[];
};

const RULE_ORDER: PasswordRule[] = ["uppercase", "lowercase", "digit", "special", "length"];

const RULE_MATCHERS: Record<PasswordRule, RegExp> = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit: /\d/,
  special: /[^A-Za-z0-9]/,
  length: /^.{8,}$/,
};

export function passwordChecks(password: string): PasswordCheckResult {
  const checks = {} as PasswordChecks;
  const failed: PasswordRule[] = [];
  for (const rule of RULE_ORDER) {
    checks[rule] = RULE_MATCHERS[rule].test(password);
    if (!checks[rule]) failed.push(rule);
  }
  return { checks, failed };
}

export function allChecksPass({ failed }: PasswordCheckResult): boolean {
  return failed.length === 0;
}
