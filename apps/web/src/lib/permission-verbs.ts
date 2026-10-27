export type Verb = "read" | "write" | "update" | "delete";

export const VERBS: readonly Verb[] = ["read", "write", "update", "delete"];

const WRITE_SUFFIXES = ["create", "checkin", "activate", "capture", "refund"];

export function codeMatchesVerb(code: string, verb: Verb): boolean {
  if (verb === "read") return code.endsWith(".view") || code.endsWith(".export");
  if (verb === "write") return WRITE_SUFFIXES.some((s) => code.endsWith("." + s));
  if (verb === "update") return code.endsWith(".update");
  return code.endsWith(".delete");
}

export function moduleIsManaged(codes: readonly string[], selected: ReadonlySet<string>): boolean {
  return codes.some((c) => c.endsWith(".manage") && selected.has(c));
}

export function verbIsOn(
  codes: readonly string[],
  verb: Verb,
  selected: ReadonlySet<string>,
): boolean {
  if (moduleIsManaged(codes, selected)) return true;
  return codes.some((c) => codeMatchesVerb(c, verb) && selected.has(c));
}

export function verbIsAvailable(codes: readonly string[], verb: Verb): boolean {
  return codes.some((c) => codeMatchesVerb(c, verb));
}

/**
 * Toggle one verb using only concrete codes. `*.manage` is never inferred from
 * a verb (and vice versa): coarse modules expose manage as its own switch in
 * Details, so a single click can never silently light up other verbs.
 */
export function toggleVerb(
  codes: readonly string[],
  verb: Verb,
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  const concrete = codes.filter((c) => codeMatchesVerb(c, verb));
  if (concrete.length === 0) return next;
  if (verbIsOn(codes, verb, selected)) {
    for (const c of concrete) next.delete(c);
  } else {
    for (const c of concrete) next.add(c);
  }
  return next;
}
