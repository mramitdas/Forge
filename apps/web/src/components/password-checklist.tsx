import { PasswordRule } from "@/lib/password";

const CHECK_ROWS: { key: PasswordRule; label: string }[] = [
  { key: "uppercase", label: "Uppercase letter" },
  { key: "lowercase", label: "Lowercase letter" },
  { key: "digit", label: "Number" },
  { key: "special", label: "Special character" },
  { key: "length", label: "At least 8 characters" },
];

export function PasswordChecklist({ checks }: { checks: Record<PasswordRule, boolean> }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password strength">
      {CHECK_ROWS.map((row) => (
        <li key={row.key} className="flex items-center gap-2 text-[12px]">
          <span aria-hidden className={checks[row.key] ? "text-green" : "text-ink-faint"}>
            {checks[row.key] ? "✓" : "✗"}
          </span>
          <span className={checks[row.key] ? "text-ink-soft" : "text-ink-faint"}>
            {row.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
