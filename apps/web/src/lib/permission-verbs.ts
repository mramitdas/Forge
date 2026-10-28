export type Capability = "view" | "manage";

export const CAPABILITIES: readonly Capability[] = ["view", "manage"];

export const MODULE_LABELS: Record<string, string> = {
  attendance: "Check-ins",
  billing: "Billing",
  expenses: "Expenses",
  identity: "Employees & Roles",
  members: "Members",
  membership: "Plans & Subscriptions",
  notifications: "Notifications",
  tenancy: "Branches & settings",
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function capabilityIsAvailable(
  codes: readonly string[],
  capability: Capability,
): boolean {
  return codes.some((c) => c.endsWith(`.${capability}`));
}

export function manageIsOn(codes: readonly string[], selected: ReadonlySet<string>): boolean {
  return codes.some((c) => c.endsWith(".manage") && selected.has(c));
}

/** Manage includes view, so a managed module always shows View on. */
export function viewIsOn(codes: readonly string[], selected: ReadonlySet<string>): boolean {
  return manageIsOn(codes, selected) || codes.some((c) => c.endsWith(".view") && selected.has(c));
}

/**
 * Toggle View. The component locks View while Manage is on; calling this with
 * Manage selected is a no-op so a coarse module can never lose its read code.
 */
export function toggleView(
  codes: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  if (manageIsOn(codes, selected)) return next;
  const view = codes.filter((c) => c.endsWith(".view"));
  if (viewIsOn(codes, selected)) {
    for (const c of view) next.delete(c);
  } else {
    for (const c of view) next.add(c);
  }
  return next;
}

/**
 * Toggle Manage. Turning it on also grants View. Turning it off leaves View on
 * so the role degrades to read-only instead of losing access entirely.
 */
export function toggleManage(
  codes: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  const manage = codes.filter((c) => c.endsWith(".manage"));
  const view = codes.filter((c) => c.endsWith(".view"));
  if (manageIsOn(codes, selected)) {
    for (const c of manage) next.delete(c);
    for (const c of view) next.add(c);
  } else {
    for (const c of manage) next.add(c);
    for (const c of view) next.add(c);
  }
  return next;
}
