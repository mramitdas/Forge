import { cn } from "@/components/ui";

const MODULES = [
  "attendance", "billing", "expenses", "identity", "members",
  "membership", "notifications", "reports", "tenancy",
] as const;

const VERBS = ["read", "write", "update", "delete"] as const;
type Verb = (typeof VERBS)[number];

const WRITE_SUFFIXES = ["create", "checkin", "activate", "capture", "refund"];

function hasVerb(module: string, verb: Verb, perms: Set<string>): boolean {
  for (const code of perms) {
    if (!code.startsWith(module + ".")) continue;
    if (verb === "read" && (code.endsWith(".view") || code.endsWith(".export"))) return true;
    if (verb === "write" && WRITE_SUFFIXES.some((s) => code.endsWith("." + s))) return true;
    if (verb === "update" && (code.endsWith(".update") || code.endsWith(".manage"))) return true;
    if (verb === "delete" && (code.endsWith(".delete") || code.endsWith(".manage"))) return true;
  }
  return false;
}

export function PermissionPills({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions);
  const rows = MODULES.filter((m) => [...perms].some((c) => c.startsWith(m + ".")));
  return (
    <div className="mt-3 space-y-2" aria-label="Granted permissions">
      <div className="flex items-center gap-3 text-[11px] font-medium text-ink-faint" aria-hidden>
        <span className="w-24">Module</span>
        {VERBS.map((v) => (
          <span key={v} className="w-10 text-center capitalize">{v}</span>
        ))}
      </div>
      {rows.map((m) => (
        <div key={m} className="flex items-center gap-3 text-[13px]" data-module={m}>
          <span className="w-24 capitalize text-ink-soft">{m}</span>
          {VERBS.map((v) => (
            <span
              key={v}
              aria-disabled="true"
              aria-label={`${m} ${v} ${hasVerb(m, v, perms) ? "on" : "off"}`}
              className={cn(
                "mx-auto inline-flex h-5 w-10 items-center justify-center rounded-full text-[11px] font-medium",
                hasVerb(m, v, perms)
                  ? "bg-accent text-white"
                  : "border border-line bg-fill text-ink-faint",
              )}
            >
              {hasVerb(m, v, perms) ? "✓" : "·"}
            </span>
          ))}
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-[13px] text-ink-faint">No modules granted.</p>
      )}
    </div>
  );
}
