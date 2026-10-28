"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui";
import {
  CAPABILITIES,
  capabilityIsAvailable,
  manageIsOn,
  moduleLabel,
  toggleManage,
  toggleView,
  viewIsOn,
} from "@/lib/permission-verbs";
import type { PermissionOut } from "@/lib/types";

const MODULES = [
  "attendance", "billing", "expenses", "identity", "members",
  "membership", "notifications", "tenancy",
] as const;

const ROW = "flex items-center gap-2";
const MODULE_CELL = "w-44 shrink-0 truncate";
const CAPABILITY_CELL = "flex flex-1 justify-center";

/**
 * Interactive permission editor with two capabilities per module: View
 * (read-only) and Manage (edit/delete). Manage includes View and locks the View
 * switch while selected; turning Manage off keeps View so access degrades to
 * read-only instead of disappearing.
 */
export function RolePermissionPills({
  catalog,
  value,
  onChange,
}: {
  catalog: PermissionOut[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const byModule = useMemo(() => {
    const map: Record<string, PermissionOut[]> = {};
    for (const p of catalog) {
      if (p.module === "platform") continue;
      (map[p.module] ??= []).push(p);
    }
    return map;
  }, [catalog]);

  const modules = MODULES.filter((m) => (byModule[m] ?? []).length > 0);

  return (
    <div aria-label="Permissions">
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
        {modules.map((m) => {
          const codeList = (byModule[m] ?? []).map((p) => p.code);
          const managed = manageIsOn(codeList, value);
          return (
            <div key={m} className={cn(ROW, "border-b border-line py-2")} data-module={m}>
              <span className={cn(MODULE_CELL, "text-[13px] text-ink-soft")}>
                {moduleLabel(m)}
              </span>
              <span className={CAPABILITY_CELL}>
                <button
                  type="button"
                  aria-label={`${m} view ${viewIsOn(codeList, value) ? "on" : "off"}`}
                  aria-pressed={viewIsOn(codeList, value)}
                  disabled={managed || !capabilityIsAvailable(codeList, "view")}
                  title={managed ? "Included with Manage" : undefined}
                  onClick={() => onChange(toggleView(codeList, value))}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    viewIsOn(codeList, value)
                      ? "bg-accent"
                      : "border border-line-strong bg-fill-strong",
                    (managed || !capabilityIsAvailable(codeList, "view")) &&
                      "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]",
                      viewIsOn(codeList, value) ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </span>
              <span className={CAPABILITY_CELL}>
                <button
                  type="button"
                  aria-label={`${m} manage ${managed ? "on" : "off"}`}
                  aria-pressed={managed}
                  disabled={!capabilityIsAvailable(codeList, "manage")}
                  onClick={() => onChange(toggleManage(codeList, value))}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    managed ? "bg-accent" : "border border-line-strong bg-fill-strong",
                    !capabilityIsAvailable(codeList, "manage") &&
                      "cursor-not-allowed opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]",
                      managed ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
