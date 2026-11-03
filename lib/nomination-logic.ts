// Pure nomination logic (feature 013, contracts.md "lib/nomination-logic.ts").
//
// All four functions are pure: they take the decisions map read-only,
// return new values, never mutate the input, and iterate the canonical
// COLOGNE_200_BOY_NAMES order (research R1 — resume, progress, completeness,
// and the voting pool are all derived functions of one decisions map; no
// stored order, no counters, no round-state record).
//
// Unknown/extra map keys not on the canonical list are ignored by every
// function (data-model.md validation rule 1 — defensive; the hash can
// only ever contain canonical names, but reads stay honest regardless).
// No I/O, no "use server", no React — unit-pinnable per Constitution III.
import { COLOGNE_200_BOY_NAMES } from "./names";

export type NominationDecision = "in" | "out";

export type NominationDecisions = Readonly<Record<string, NominationDecision>>;

/**
 * First canonical-list name absent from `decisions`; null when all decided
 * (FR-005: resume at the first undecided name in canonical list order).
 */
export function nextUndecidedName(
  decisions: NominationDecisions
): string | null {
  for (const name of COLOGNE_200_BOY_NAMES) {
    if (decisions[name] === undefined) return name;
  }
  return null;
}

/** Number of decided canonical-list entries (== relevant hash field count). */
export function decidedCount(decisions: NominationDecisions): number {
  let count = 0;
  for (const name of COLOGNE_200_BOY_NAMES) {
    if (decisions[name] !== undefined) count++;
  }
  return count;
}

/** Canonical-order list of "in" names — the user's voting pool. */
export function includedNames(decisions: NominationDecisions): string[] {
  const included: string[] = [];
  for (const name of COLOGNE_200_BOY_NAMES) {
    if (decisions[name] === "in") included.push(name);
  }
  return included;
}

/** complete = every canonical name has a decision (FR-006). */
export function isRoundComplete(decisions: NominationDecisions): boolean {
  for (const name of COLOGNE_200_BOY_NAMES) {
    if (decisions[name] === undefined) return false;
  }
  return true;
}
