// Pair reserve for the vote screen (feature 003).
//
// A pure, in-memory FIFO of pre-generated pairs so the tap → next-pair
// transition is a synchronous state swap (US1) while votes and score fetches
// happen off the presentation path. Batches are drawn with the existing pure
// nextPair() against the freshest score map; `lastPair` is chained through
// the batch so no consecutive exact repeat ever shows (FR-005, feature 002).
//
// No I/O, no module state — pure functions over explicit arguments, no
// input mutation (unit-pinnable, see tests/unit/pair-queue.test.ts).
import { nextPair, type Pair } from "./pairing";

/** Pairs prepared per refill (batch size). */
export const BATCH_SIZE = 5;

/** Refill is triggered when the reserve holds fewer than this many pairs. */
export const REFILL_THRESHOLD = 2;

/**
 * Append up to BATCH_SIZE valid pairs to the reserve.
 * Each pair is drawn with nextPair(previousPair, scores), chaining the
 * previous pair through the batch so consecutive pairs never repeat
 * (feature 002 FR-005 preserved across batch boundaries).
 * Returns a new array; does not mutate the input.
 */
export function refillReserve(
  reserve: readonly Pair[],
  scores: Readonly<Record<string, number>> | undefined,
  lastPair: Pair | undefined
): Pair[] {
  const next = [...reserve];
  let previous: Pair | undefined = lastPair;
  for (let i = 0; i < BATCH_SIZE; i++) {
    previous = nextPair(previous, scores);
    next.push(previous);
  }
  return next;
}

/**
 * Pop the first reserve pair that is not an exact repeat (either order)
 * of currentPair. Stale (invalid) pairs are discarded.
 * Returns { pair: undefined, reserve } when nothing valid remains.
 * Does not mutate the input reserve.
 */
export function takePair(
  reserve: readonly Pair[],
  currentPair: Pair | undefined
): { pair: Pair | undefined; reserve: Pair[] } {
  for (let i = 0; i < reserve.length; i++) {
    const candidate = reserve[i];
    const stale =
      currentPair !== undefined &&
      ((candidate[0] === currentPair[0] && candidate[1] === currentPair[1]) ||
        (candidate[0] === currentPair[1] && candidate[1] === currentPair[0]));
    if (!stale) {
      return { pair: candidate, reserve: reserve.slice(i + 1) };
    }
  }
  return { pair: undefined, reserve: [] };
}

/** True when the reserve should be topped up. */
export function needsRefill(reserve: readonly Pair[]): boolean {
  return reserve.length < REFILL_THRESHOLD;
}
