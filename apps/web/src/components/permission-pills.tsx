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
    // *.manage = full module control → every verb.
    if (code.endsWith(".manage")) return true;
    if (verb === "read" && (code.endsWith(".view") || code.endsWith(".export"))) return true;
    if (verb === "write" && WRITE_SUFFIXES.some((s) => code.endsWith("." + s))) return true;
    if (verb === "update" && (code.endsWith(".update") || code.endsWith(".manage"))) return true;
    if (verb === "delete" && (code.endsWith(".delete") || code.endsWith(".manage"))) return true;
  }
  return false;
}

const ROW = "flex items-center gap-2";
const MODULE_CELL = "w-28 shrink-0 truncate capitalize";
const VERB_CELL = "flex w-12 shrink-0 justify-center";

export function PermissionPills({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions);
  const rows = MODULES.filter((m) => [...perms].some((c) => c.startsWith(m + ".")));
  return (
    <div className="mx-auto mt-4 w-fit" aria-label="Granted permissions">
      <div className={ROW} aria-hidden>
        <span className={cn(MODULE_CELL, "text-[11px] font-medium text-ink-faint")}>Module</span>
        {VERBS.map((v) => (
          <span
            key={v}
            className={cn(VERB_CELL, "text-[11px] font-medium text-ink-faint capitalize")}
          >
            {v}
          </span>
        ))}
      </div>
      <div className="mt-1 border-t border-line">
        {rows.map((m) => {
          return (
            <div key={m} className={cn(ROW, "border-b border-line py-1.5")} data-module={m}>
              <span className={cn(MODULE_CELL, "text-[13px] text-ink-soft")}>{m}</span>
              {VERBS.map((v) => {
                const on = hasVerb(m, v, perms);
                return (
                  <span key={v} className={VERB_CELL}>
                    <span
                      aria-disabled="true"
                      aria-label={`${m} ${v} ${on ? "on" : "off"}`}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full",
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
