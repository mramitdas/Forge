import { cn } from "@/components/ui";
import {
  CAPABILITIES,
  manageIsOn,
  moduleLabel,
  viewIsOn,
} from "@/lib/permission-verbs";

const MODULES = [
  "attendance", "billing", "expenses", "identity", "members",
  "membership", "notifications", "reports", "tenancy",
] as const;

const ROW = "flex items-center gap-2";
const MODULE_CELL = "w-44 shrink-0 truncate";
const CAPABILITY_CELL = "flex flex-1 justify-center";

export function PermissionPills({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions);
  const rows = MODULES.filter((m) => [...perms].some((c) => c.startsWith(m + ".")));
  return (
    <div className="mt-4" aria-label="Granted permissions">
      <div className={ROW} aria-hidden>
        <span className={cn(MODULE_CELL, "text-[11px] font-medium text-ink-faint")}>Module</span>
        {CAPABILITIES.map((c) => (
          <span
            key={c}
            className={cn(CAPABILITY_CELL, "text-[11px] font-medium text-ink-faint capitalize")}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="mt-1 border-t border-line">
        {rows.map((m) => {
          const codeList = [...perms].filter((c) => c.startsWith(m + "."));
          return (
            <div key={m} className={cn(ROW, "border-b border-line py-1.5")} data-module={m}>
              <span className={cn(MODULE_CELL, "text-[13px] text-ink-soft")}>
                {moduleLabel(m)}
              </span>
              {CAPABILITIES.map((c) => {
                const on =
                  c === "view" ? viewIsOn(codeList, perms) : manageIsOn(codeList, perms);
                return (
                  <span key={c} className={CAPABILITY_CELL}>
                    <span
                      aria-disabled="true"
                      aria-label={`${m} ${c} ${on ? "on" : "off"}`}
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
