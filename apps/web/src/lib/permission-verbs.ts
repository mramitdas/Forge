export type Verb = "read" | "write" | "update" | "delete";

export const VERBS: readonly Verb[] = ["read", "write", "update", "delete"];

const WRITE_SUFFIXES = ["create", "checkin", "activate", "capture", "refund"];

export function codeMatchesVerb(code: string, verb: Verb): boolean {
  if (verb === "read") return code.endsWith(".view") || code.endsWith(".export");
  if (verb === "write") return WRITE_SUFFIXES.some((s) => code.endsWith("." + s));
  if (verb === "update") return code.endsWith(".update");
  return code.endsWith(".delete");
}

export function verbIsOn(codes: readonly string[], verb: Verb, selected: ReadonlySet<string>): boolean {
  if (codes.some((c) => c.endsWith(".manage") && selected.has(c))) return true;
  return codes.some((c) => codeMatchesVerb(c, verb) && selected.has(c));
}

export function verbIsAvailable(codes: readonly string[], verb: Verb): boolean {
  return (
    codes.some((c) => codeMatchesVerb(c, verb)) || codes.some((c) => c.endsWith(".manage"))
  );
}

/**
 * Toggle one verb. Concrete codes always win; when a module exposes only a
 * coarse `*.manage` code (e.g. attendance update/delete), the verb maps to
 * manage, which the spec treats as full control. Turning a verb off drops
 * manage and any granular codes for that verb.
 */
export function toggleVerb(
  codes: readonly string[],
  verb: Verb,
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  if (verbIsOn(codes, verb, selected)) {
    for (const c of codes) {
      if (codeMatchesVerb(c, verb) || c.endsWith(".manage")) next.delete(c);
    }
    return next;
  }
  const concrete = codes.filter((c) => codeMatchesVerb(c, verb));
  if (concrete.length > 0) {
    for (const c of concrete) next.add(c);
    return next;
  }
  for (const c of codes) {
    if (c.endsWith(".manage")) next.add(c);
  }
  return next;
}
