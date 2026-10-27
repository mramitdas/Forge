"use client";

import { useMemo, useState } from "react";
import { cn } from "@/components/ui";
import {
  moduleIsManaged,
  toggleVerb,
  VERBS,
  verbIsAvailable,
  verbIsOn,
} from "@/lib/permission-verbs";
import type { PermissionOut } from "@/lib/types";

const MODULES = [
  "attendance", "billing", "expenses", "identity", "members",
  "membership", "notifications", "reports", "tenancy",
] as const;

const ROW = "flex items-center gap-2";
const MODULE_CELL = "w-28 shrink-0 truncate capitalize";
const VERB_CELL = "flex flex-1 justify-center";

/**
 * Interactive permission editor: settings-style read/write/update/delete
 * pills per module, plus an expandable per-module list of the raw catalog
 * codes for fine-grained control. A pill only toggles the concrete codes it
 * maps to; when a module has no separate code for a verb the pill is disabled.
 * `*.manage` is a switch of its own in Details and locks the row's pills while
 * selected (full control).
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
  const [open, setOpen] = useState<Set<string>>(new Set());

  const byModule = useMemo(() => {
    const map: Record<string, PermissionOut[]> = {};
    for (const p of catalog) {
      if (p.module === "platform") continue;
      (map[p.module] ??= []).push(p);
    }
    return map;
  }, [catalog]);

  const modules = MODULES.filter((m) => (byModule[m] ?? []).length > 0);

  function toggleCode(code: string) {
    const next = new Set(value);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  }

  function toggleOpen(module: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  return (
    <div aria-label="Permissions">
      <div className={ROW} aria-hidden>
        <span className={cn(MODULE_CELL, "text-[11px] font-medium text-ink-faint")}>Module</span>
        {VERBS.map((v) => (
          <span key={v} className={cn(VERB_CELL, "text-[11px] font-medium text-ink-faint capitalize")}>
            {v}
          </span>
        ))}
        <span className="w-16 shrink-0" aria-hidden />
      </div>
      <div className="mt-1 border-t border-line">
        {modules.map((m) => {
          const codes = byModule[m] ?? [];
          const codeList = codes.map((p) => p.code);
          const isOpen = open.has(m);
          return (
            <div key={m} className="border-b border-line" data-module={m}>
              <div className={cn(ROW, "py-1.5")}>
                <span className={cn(MODULE_CELL, "text-[13px] text-ink-soft")}>{m}</span>
                {VERBS.map((v) => {
                  const managed = moduleIsManaged(codeList, value);
                  const on = verbIsOn(codeList, v, value);
                  const available = verbIsAvailable(codeList, v);
                  const locked = managed || !available;
                  return (
                    <span key={v} className={VERB_CELL}>
                      <button
                        type="button"
                        aria-label={`${m} ${v} ${on ? "on" : "off"}`}
                        aria-pressed={on}
                        disabled={locked}
                        title={
                          managed
                            ? `${m}.manage grants full control — edit it under Details`
                            : available
                              ? undefined
                              : `${m} has no separate ${v} permission`
                        }
                        onClick={() => onChange(toggleVerb(codeList, v, value))}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          on ? "bg-accent" : "border border-line-strong bg-fill-strong",
                          locked && "cursor-not-allowed",
                          !managed && available && "cursor-pointer",
                          locked && !on && "opacity-40",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]",
                            on ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </button>
                    </span>
                  );
                })}
                <span className="flex w-16 shrink-0 justify-end">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(m)}
                    className="text-[11px] font-medium text-ink-faint hover:text-ink"
                  >
                    {isOpen ? "Hide" : "Details"}
                  </button>
                </span>
              </div>
              {isOpen && (
                <div className="grid gap-x-5 gap-y-1 pb-3 pl-2 pr-1 sm:grid-cols-2">
                  {codes.map((p) => {
                    const on = value.has(p.code);
                    return (
                      <div
                        key={p.code}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleCode(p.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleCode(p.code);
                          }
                        }}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-fill"
                      >
                        <span className="min-w-0">
                          <span className={`block text-[13px] ${on ? "text-ink" : "text-ink-faint"}`}>
                            {p.description}
                          </span>
                          <span className="block font-mono text-[10px] text-ink-faint">{p.code}</span>
                        </span>
                        <span onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={p.code}
                            onClick={() => toggleCode(p.code)}
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                              on ? "bg-accent" : "border border-line-strong bg-fill-strong",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]",
                                on ? "left-[18px]" : "left-0.5",
                              )}
                            />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
