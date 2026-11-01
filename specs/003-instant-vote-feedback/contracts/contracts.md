# Contracts: Instant Vote Feedback

Feature: 003-instant-vote-feedback

No server-side interface changes. Existing server actions and Redis keys are
untouched. This feature adds two client-side module contracts and one
component-level behaviour contract.

## Unchanged server surface (for reference)

- `submitVote(winner, loser, voter): Promise<ActionResult>` — validates names, records vote atomically. Called once per vote record (at-most-once dispatch per vote).
- `getScores(): Promise<Record<string, number>>` — raw win counts. Called at mount and at just-in-time batch refill (~1 call per ~4 votes).
- `getRanking()`, `getWinners()` — untouched.

## New module contract: `lib/pair-queue.ts`

Pure functions over an in-memory reserve. No I/O, no module state.

```ts
export type Pair = [string, string]; // re-exported from pairing for convenience

/** Module-level tuning constants (pinned by tests). */
export const BATCH_SIZE = 5;    // pairs prepared per refill
export const REFILL_THRESHOLD = 2; // refill triggered when reserve length < this

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
): Pair[];

/**
 * Pop the first reserve pair that is not an exact repeat (either order)
 * of currentPair. Stale (invalid) pairs are discarded.
 * Returns { pair: undefined, reserve } when nothing valid remains.
 * Does not mutate the input reserve.
 */
export function takePair(
  reserve: readonly Pair[],
  currentPair: Pair | undefined
): { pair: Pair | undefined; reserve: Pair[] };

/** True when the reserve should be topped up. */
export function needsRefill(reserve: readonly Pair[]): boolean;
```

Invariants (tested):
- `refillReserve` on an empty reserve with `scores === undefined` produces uniform pairs (feature 002 FR-004).
- Within a batch and across the `lastPair` boundary: no consecutive exact repeats.
- `takePair` never returns a pair equal (either order) to `currentPair`.
- Both members of every returned pair are distinct (guaranteed by `nextPair`, asserted here as regression).

## New module contract: `lib/vote-sender.ts`

Manages bounded-retry dispatch. Injectable clock/timer for deterministic tests.

```ts
export type VoteInput = { winner: string; loser: string; voter: "A" | "B" };
export type VoteStatus = "pending" | "sent" | "failed";

export interface VoteSenderOptions {
  /** Submits one vote; resolves on confirmed recording, rejects on failure. */
  send: (vote: VoteInput) => Promise<void>;
  /** Total retry window in ms before a vote is marked failed. Default 180_000. */
  retryWindowMs?: number;
  /** Delay between retries in ms. Default 5_000. */
  retryDelayMs?: number;
  /** Called with the number of newly failed votes (batched). */
  onFailed?: (failedCount: number) => void;
}

/**
 * Dispatch a vote immediately (fire-and-forget). On rejection it re-enters
 * the retry loop for up to retryWindowMs; if still unsent by then it is
 * marked "failed" and onFailed fires. A vote that has ever resolved
 * successfully is terminal ("sent") and is never dispatched again
 * (at-most-once, spec FR-005).
 * Returns a handle with the vote's current status for testing.
 */
export function createVoteSender(options: VoteSenderOptions): {
  cast: (vote: VoteInput) => void;
  pendingCount: () => number; // votes not yet sent or failed
};
```

Invariants (tested):
- `send` called exactly once for a vote that resolves successfully on first attempt.
- A vote that rejects twice then resolves is dispatched 3 times total, recorded once, ends `sent`.
- A vote that rejects until `retryWindowMs` elapses ends `failed`; `onFailed(1)` fires exactly once for it.
- No retry attempts occur after the window expires.
- Multiple votes retry independently.

## Component behaviour contract: `app/vote-client.tsx` (modified)

- On mount: fetch scores once, prepare initial batch, show `reserve[0]` immediately (existing mount path, now reserve-backed).
- On tap: synchronously set the next pair from `takePair(...)` (optimistic; <100 ms), then `cast()` the vote — presentation never awaits the dispatch.
- After each tap: if `needsRefill(reserve)`, fetch fresh scores and `refillReserve` (async, off the presentation path).
- If reserve is exhausted: render the existing `aria-busy` pair area (taps disabled) until a pair arrives.
- On `onFailed(n)`: show persistent dismissable notice "N Stimmen wurden nicht gezählt" (n accumulated until dismissal).
- Existing FR-012 inline error path is superseded by the notice flow: a failed submit no longer keeps the pair unchanged (the pair already advanced optimistically); the vote is retried/notified per the new flow.
