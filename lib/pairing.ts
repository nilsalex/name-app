// Pair selection for the vote screen.
//
// Feature 002 (weighted selection): each name's chance of being drawn is
// proportional to weight = score + 1 (clarified linear curve). Missing or
// empty scores degenerate to uniform selection (FR-004); the +1 base keeps
// every name reachable regardless of score (FR-003).
//
// FR-001/FR-002 (feature 001): pairs are drawn from the Cologne 200 list;
// with no scores, selection is uniform.
// FR-005 (both features): both members distinct; never an identical repeat
// of previousPair (either order).
// FR-006: weights derive from the score map passed in at draw time — no
// history, no stored weighting state.
// FR-008: both members come from the same single weighted pool.
// FR-009: no variety floor beyond the previous-pair rule.
import { COLOGNE_200_BOY_NAMES } from "./names";

export type Pair = [string, string];

/**
 * Picks one name: probability proportional to weight = score + 1.
 * Cumulative (prefix-sum) draw over the fixed name list — O(n), n = 200.
 * Feature 013: optional `pool` — when provided, the prefix-sum iterates
 * `pool` instead of the full 200 (weight semantics unchanged; missing
 * pool = full list, zero drift). CONTRACT BOUNDARY (FR-008): the caller
 * guarantees pool.length >= 2 — a degenerate one-name pool cannot produce
 * a distinct pair.
 */
function weightedPick(
  scores: Readonly<Record<string, number>>,
  pool?: readonly string[]
): string {
  const list = pool ?? COLOGNE_200_BOY_NAMES;
  // Build prefix sums of weights.
  let total = 0;
  const prefix = new Array<number>(list.length);
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    total += (scores[name] ?? 0) + 1;
    prefix[i] = total;
  }

  // Random point in [0, total); first index whose cumulative weight covers it.
  const r = Math.random() * total;
  for (let i = 0; i < prefix.length; i++) {
    if (r < prefix[i]) return list[i];
  }
  // Floating-point safety net: should be unreachable.
  return list[list.length - 1];
}

/**
 * Returns two distinct names; never an identical repeat of previousPair.
 * Without a scores map (or with an empty one) selection is uniform;
 * otherwise it is weighted by score + 1 (feature 002).
 *
 * On collision the SECOND member is redrawn (not both): redrawing both
 * would bias the first slot's distribution by p_i(1-p_i) — heavy names lose
 * disproportionate mass because self-pair probability grows with p² — and
 * break the exact weight proportionality required by FR-002.
 *
 * Feature 013: optional `pool` (symmetry with pickUnderseenPair — required
 * to keep refillReserve's chaining consistent). When provided, drafting
 * iterates `pool`; undefined/missing pool = full canonical list (zero
 * drift). CONTRACT BOUNDARY (FR-008): the caller guarantees pool.length
 * >= 2.
 */
export function nextPair(
  previousPair?: Pair,
  scores?: Readonly<Record<string, number>>,
  pool?: readonly string[]
): Pair {
  const list = pool ?? COLOGNE_200_BOY_NAMES;
  const pick = scores
    ? () => weightedPick(scores, list)
    : () => list[Math.floor(Math.random() * list.length)];

  for (;;) {
    const a = pick();
    let b = pick();
    while (b === a) {
      b = pick(); // redraw second member only — keeps slot-1 distribution exact
    }
    const pair: Pair = [a, b];
    if (
      previousPair &&
      ((pair[0] === previousPair[0] && pair[1] === previousPair[1]) ||
        (pair[0] === previousPair[1] && pair[1] === previousPair[0]))
    ) {
      continue; // exact repeat (either order) — draw again
    }
    return pair;
  }
}

/**
 * Picks one name with probability exactly proportional to the given raw
 * weight (no +1 base — unlike weightedPick, which implements feature 002's
 * score+1 curve). Prefix-sum draw, O(n), n = 200.
 */
function rawWeightedPick(
  weights: Readonly<Record<string, number>>,
  pool?: readonly string[]
): string {
  const list = pool ?? COLOGNE_200_BOY_NAMES;
  let total = 0;
  const prefix = new Array<number>(list.length);
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    total += weights[name] ?? 1;
    prefix[i] = total;
  }
  const r = Math.random() * total;
  for (let i = 0; i < prefix.length; i++) {
    if (r < prefix[i]) return list[i];
  }
  return list[list.length - 1];
}

/**
 * Feature 006 (US2, research R5): exposure-driven pair draft.
 *
 * Each name's chance is proportional to weight = 1 / (1 + seen[name]) —
 * names the user has been offered less often appear more often, so every
 * user's exposure converges toward uniform (SC-003). Win scores are
 * deliberately NOT an input: a name voted up ten times should NOT keep
 * reappearing — only its exposure counts.
 *
 * Feature 013 (pool-constrained drafting, research R4): when `pool` is
 * provided, the weighted pool iterates `pool` instead of the full 200 —
 * weight semantics 1/(1+seen) UNCHANGED within the pool; missing/empty/
 * undefined pool = full canonical list (zero drift for existing callers).
 * CONTRACT BOUNDARY (FR-008): the caller guarantees pool.length >= 2 — a
 * degenerate one-name pool cannot produce a distinct pair; the loop
 * termination guarantee (every name keeps weight > 0) presumes that guard.
 *
 * Missing/empty seen map degenerates to uniform selection (INV-6 —
 * statistically identical to feature 001's uniform mode).
 *
 * Collision/repeat rules mirror nextPair: the SECOND member is redrawn on
 * self-pair (keeps slot-1 distribution exact); an exact repeat of
 * previousPair (either order) triggers a full redraw. The loop terminates
 * with probability 1 (each iteration has positive acceptance probability);
 * there is no bounded-attempts fallback because the weighted pool never
 * collapses to a single name — every name keeps weight ≥ 1/(1+max(seen)) > 0,
 * so a non-previous, non-identical pair is always reachable.
 */
export function pickUnderseenPair(
  previousPair?: Pair,
  seen?: Readonly<Record<string, number>>,
  pool?: readonly string[]
): Pair {
  const list = pool ?? COLOGNE_200_BOY_NAMES;
  const weights: Record<string, number> = {};
  if (seen) {
    for (const name of list) {
      const k = seen[name] ?? 0;
      weights[name] = 1 / (1 + k);
    }
  }
  const pick = seen
    ? () => rawWeightedPick(weights, list)
    : () => list[Math.floor(Math.random() * list.length)];

  for (;;) {
    const a = pick();
    let b = pick();
    while (b === a) {
      b = pick(); // redraw second member only — keeps slot-1 distribution exact
    }
    const pair: Pair = [a, b];
    if (
      previousPair &&
      ((pair[0] === previousPair[0] && pair[1] === previousPair[1]) ||
        (pair[0] === previousPair[1] && pair[1] === previousPair[0]))
    ) {
      continue; // exact repeat (either order) — draw again
    }
    return pair;
  }
}
