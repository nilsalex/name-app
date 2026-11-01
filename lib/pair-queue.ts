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
import { pickUnderseenPair, type Pair } from "./pairing";

/** Pairs prepared per refill (batch size). */
export const BATCH_SIZE = 5;

/** Refill is triggered when the reserve holds fewer than this many pairs. */
export const REFILL_THRESHOLD = 2;

/**
 * Append up to BATCH_SIZE valid pairs to the reserve (feature 006, US2).
 * Each pair is drawn with pickUnderseenPair(previousPair, seen), chaining
 * BOTH the previous pair AND the accumulated in-batch seen counts through
 * the batch — so consecutive pairs never repeat (feature 001/002 rule,
 * preserved across batch boundaries) and a batch self-balances: a name
 * drafted once in this batch counts as seen for the remaining draws
 * (contracts.md). The caller persists the accumulated exposure via the
 * refill-time seen bump (research R4 single-writer rule).
 * Returns a new array; does not mutate the input.
 */
export function refillReserve(
  reserve: readonly Pair[],
  seen: Readonly<Record<string, number>> | undefined,
  lastPair: Pair | undefined
): Pair[] {
  const next = [...reserve];
  let previous: Pair | undefined = lastPair;
  const seenAcc: Record<string, number> = seen ? { ...seen } : {};
  for (let i = 0; i < BATCH_SIZE; i++) {
    previous = pickUnderseenPair(previous, seenAcc);
    next.push(previous);
    // Accumulate in-batch exposure so the batch self-balances.
    seenAcc[previous[0]] = (seenAcc[previous[0]] ?? 0) + 1;
    seenAcc[previous[1]] = (seenAcc[previous[1]] ?? 0) + 1;
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
