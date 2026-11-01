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
 */
function weightedPick(scores: Readonly<Record<string, number>>): string {
  // Build prefix sums of weights.
  let total = 0;
  const prefix = new Array<number>(COLOGNE_200_BOY_NAMES.length);
  for (let i = 0; i < COLOGNE_200_BOY_NAMES.length; i++) {
    const name = COLOGNE_200_BOY_NAMES[i];
    total += (scores[name] ?? 0) + 1;
    prefix[i] = total;
  }

  // Random point in [0, total); first index whose cumulative weight covers it.
  const r = Math.random() * total;
  for (let i = 0; i < prefix.length; i++) {
    if (r < prefix[i]) return COLOGNE_200_BOY_NAMES[i];
  }
  // Floating-point safety net: should be unreachable.
  return COLOGNE_200_BOY_NAMES[COLOGNE_200_BOY_NAMES.length - 1];
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
 */
export function nextPair(
  previousPair?: Pair,
  scores?: Readonly<Record<string, number>>
): Pair {
  const pick = scores ? () => weightedPick(scores) : () => {
    return COLOGNE_200_BOY_NAMES[
      Math.floor(Math.random() * COLOGNE_200_BOY_NAMES.length)
    ];
  };

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
