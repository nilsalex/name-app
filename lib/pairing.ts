// Pair selection for the vote screen.
//
// FR-001: pairs are drawn from the Cologne 200 list.
// FR-002: both members are always distinct.
// Acceptance scenario 3: never an identical repeat of previousPair.
// Clarification Q1: NO memory beyond previousPair — pairings may repeat
// freely; the app does not track which pairings a user has already seen
// (FR-013). Random selection keeps this working indefinitely (FR-011).
import { COLOGNE_200_BOY_NAMES } from "./names";

export type Pair = [string, string];

function randomName(): string {
  return COLOGNE_200_BOY_NAMES[Math.floor(Math.random() * COLOGNE_200_BOY_NAMES.length)];
}

/** Returns two distinct names; never an identical repeat of previousPair. */
export function nextPair(previousPair?: Pair): Pair {
  for (;;) {
    const a = randomName();
    const b = randomName();
    if (a === b) continue;
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
