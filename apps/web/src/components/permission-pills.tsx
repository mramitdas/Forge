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

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(4,3.5rem)] gap-x-2";

export function PermissionPills({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions);
  const rows = MODULES.filter((m) => [...perms].some((c) => c.startsWith(m + ".")));
  return (
    <div className="mt-4" aria-label="Granted permissions">
      <div className={cn(GRID, "text-[11px] font-medium text-ink-faint")} aria-hidden>
        <span>Module</span>
        {VERBS.map((v) => (
          <span key={v} className="text-center capitalize">
            {v}
          </span>
        ))}
      </div>
      <div className="mt-1 border-t border-line">
        {rows.map((m) => {
          return (
            <div
              key={m}
              className={cn(GRID, "items-center border-b border-line py-1.5 text-[13px]")}
              data-module={m}
            >
              <span className="truncate capitalize text-ink-soft">{m}</span>
              {VERBS.map((v) => {
                const on = hasVerb(m, v, perms);
                return (
                  <span
                    key={v}
                    aria-disabled="true"
                    aria-label={`${m} ${v} ${on ? "on" : "off"}`}
                    className={cn(
                      "relative mx-auto inline-flex h-5 w-9 items-center rounded-full",
                      on ? "bg-accent" : "border border-line-strong bg-fill-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm",
                        on ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </span>
                );
              })}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="py-2 text-[13px] text-ink-faint">No modules granted.</p>
        )}
      </div>
    </div>
  );
}
