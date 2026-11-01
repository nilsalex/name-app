# Data Model: Instant Vote Feedback

Feature: 003-instant-vote-feedback

No new persisted entities. All new state is client-side, in-memory, and
tab-scoped (lost on tab close per spec Assumptions).

## Existing persisted entities (unchanged)

- **Vote record** (`namewahl:votes` stream): `{ voter: "A"|"B", winner: string, loser: string, at: ISO timestamp }` — written once per accepted vote by the existing `recordVote` pipeline. This feature changes *when* it is dispatched (async, possibly retried), never its shape.
- **Score map** (`namewahl:scores` zset): raw win counts per name — read at batch preparation time; unchanged.

## New transient client-side entities

### PairReserve

Ordered FIFO of prepared pairs awaiting display.

| Field | Type | Constraints |
|---|---|---|
| pairs | `Pair[]` (`[string, string]` tuples) | each pair: distinct members; generation-time rule: not an exact repeat (either order) of the pair that preceded it in sequence |

Operations:
- `refill(reserve, count, scores, previousPair)` → new reserve with up to `count` pairs appended, each drawn via `nextPair(previousPair, scores)`, chaining `previousPair` through the batch so consecutive pairs never repeat.
- `take(reserve, currentPair)` → `{ pair, reserve }` — pops the first pair that is not an exact repeat (either order) of `currentPair`; stale pairs are discarded; may return `pair: null` when the reserve is exhausted.

Lifecycle: created empty on mount → refilled (batch of 5) → drained by votes → refilled when length < 2 → discarded on unmount. No persistence.

### PendingVote

One user vote in flight.

| Field | Type | Constraints |
|---|---|---|
| winner | `string` | must be a member of the displayed pair |
| loser | `string` | must be the other member; ≠ winner |
| voter | `"A" \| "B"` | from user selection |
| status | `"pending" \| "sent" \| "failed"` | `sent` is terminal (at-most-once: never re-dispatched); `failed` only after the 3-minute retry window expires |

Lifecycle: `pending` on cast → dispatch attempt → `sent` on success (terminal) or back to `pending` for retry until the 3-minute window expires → `failed` (feeds the "N votes didn't count" notice, which the user can dismiss).

### NoticeState (derived, in component state)

| Field | Type | Constraints |
|---|---|---|
| failedCount | `number` | ≥ 0; number of votes that ended `failed` since last dismissal |
| dismissed | `boolean` | notice hidden while true; resets `failedCount` display |

## Validation rules carried over (enforced before enqueueing a vote)

- winner ≠ loser; both ∈ Cologne 200 list (existing `submitVote` validation, unchanged — validation stays server-side; the client only sends pairs it displayed, which are already valid).
- Pair display: members distinct; not an exact repeat (either order) of the currently displayed pair.
