# Contracts: Name Nomination Round (013)

Date: 2026-11-03. All contracts are internal TypeScript interfaces (server
actions + pure functions) — the app exposes no HTTP API beyond its own
routes and server actions, per 006. Unmarked existing contracts unchanged.

## Server Actions (`app/actions.ts`)

### `getNomination(): Promise<NominationState>` — NEW

Signed-in user's nomination state, server-derived per research R1.

```ts
export type NominationDecision = "in" | "out";

export interface NominationState {
  ok: true;
  /** Decided names → their final decision (hash HGETALL, verbatim). */
  decisions: Readonly<Record<string, NominationDecision>>;
  /** Canonical-order first name with no decision yet; null when complete. */
  nextName: string | null;
  /** Number of decided names (0–200). */
  decidedCount: number;
  /** Names included so far, canonical order (the voting pool so far). */
  pool: readonly string[];
  /** true when decidedCount == 200. */
  complete: boolean;
}
```

- Signed-out: `{ ok: false }` — merged result shape below.
- Upstash failure: throws — the page gate's existing try/catch pattern
  renders "momentan nicht verfügbar"-style fallback (unchanged posture).

Refined union (chosen over overloading, mirroring `getWinners`):

```ts
export type NominationResult =
  | { ok: true } & NominationState
  | { ok: false; error: string };
```

### `setNomination(name: unknown, decision: unknown): Promise<ActionResult>` — NEW

- Validates `name` (canonical list member, same `isName` guard as
  `submitVote`) and `decision` (`"in" | "out"`).
- Session check identical to `submitVote` (uid never trusted from the
  client). Signed-out/expired → `{ ok: false, error: "Abgelaufen — bitte
  neu anmelden." }` (same copy).
- One `HSET` on `namewahl:user:<uid>:nominations` (R2). Idempotent under
  retry (FR-011-safe).
- Failure → `{ ok: false, error: "Speichern fehlgeschlagen — bitte nochmal
  versuchen." }` (same shape/copy as `submitVote`'s failure).
- NOTE: does NOT re-check that the name was previously undecided — the
  client is the only legitimate caller; a re-confirmed same-value write is
  harmless (idempotent), and cross-value overwrites cannot originate from
  the UI (decisions render locked). Mirrors `submitVote`'s trust posture.

## Pure Functions

### `lib/nomination-logic.ts` — NEW (no I/O, unit-pinnable)

```ts
/** First canonical-list name absent from `decisions`; null when all decided. */
export function nextUndecidedName(
  decisions: Readonly<Record<string, NominationDecision>>
): string | null;

/** Number of decided entries (== hash field count). */
export function decidedCount(
  decisions: Readonly<Record<string, NominationDecision>>
): number;

/** Canonical-order list of `"in"` names (the voting pool). */
export function includedNames(
  decisions: Readonly<Record<string, NominationDecision>>
): string[];

/** complete = every canonical name has a decision. */
export function isRoundComplete(
  decisions: Readonly<Record<string, NominationDecision>>
): boolean;
```

All take the decisions map read-only, return new values, never mutate
input (Project convention — see pair-queue).

### `lib/pairing.ts` — pool-constrained drafting (MODIFIED signatures)

```ts
// pool?: readonly string[] — NEW optional parameter. When provided, the
// weighted pool iterates `pool` instead of the full 200 (weight semantics
// unchanged: 1/(1+seen[name]) within the pool). Missing/empty/undefined
// pool = existing behavior (full list), zero drift for existing callers
// and existing unit tests (fail-closed: no pool → no change; pool → only
// pool members can ever be drafted, SC-004/FR-007).
export function pickUnderseenPair(
  previousPair?: Pair,
  seen?: Readonly<Record<string, number>>,
  pool?: readonly string[]
): Pair;
```

- `nextPair` gains the same optional third parameter for symmetry (unused
  by the nomination feature but required to keep `refillReserve`'s
  chaining consistent).
- Collision/repeat/no-previous rules unchanged inside the pool; loop
  termination unchanged (pool members retain weight > 0; degenerate
  one-name pool cannot produce a pair — the caller's ≥2 guard (FR-008)
  is the contract boundary, documented here).

### `lib/pair-queue.ts` — MODIFIED signature

```ts
export function refillReserve(
  reserve: readonly Pair[],
  seen: Readonly<Record<string, number>> | undefined,
  lastPair: Pair | undefined,
  pool?: readonly string[]            // NEW, threaded to drafting
): Pair[];
```

TakePair unchanged (pure reserve operation).

## Store (`lib/nomination-store.ts`) — NEW (server-only)

```ts
import "server-only";
export function nominationKey(uid: string): string;
// `${PREFIX}:user:${assertUid(uid)}:nominations` (assertUid imported from
// ./store's sibling guard — same derivation pattern as userScoresKey).

export async function readNominations(
  uid: string
): Promise<Record<string, NominationDecision>>;
// HGETALL, values type-narrowed to "in" | "out"; unknown values are
// impossible via the app but are normalized defensively to the field's
// truth by the only writer contract (no third value can be HSET).

export async function writeNomination(
  uid: string,
  name: string,
  decision: NominationDecision
): Promise<void>;
// Single HSET; throws on Upstash failure (action maps to ActionResult).
```

Storage mock seam: the existing `_setClientForTests`/fake-client pattern
applies unchanged (integration tests inject the fake Redis the same way
006's do).

## Client Components

### `app/nominate-client.tsx` — NEW

Props: `{ uid: string; initial: NominationState }` (gate-supplied
server-derived state; client re-derives optimistically after each tap via
`lib/nomination-logic` — identical pure functions).

Behavior contract:
- Renders `initial.nextName` (or swaps to vote phase when
  `initial.complete`), counter `decidedCount von 200`, buttons
  "Aufnehmen" / "Ausschließen".
- Tap → synchronous local state update (next name via
  `nextUndecidedName`) + background `setNomination` fire-and-forget with
  the same bounded-retry sender pattern as votes (research R2).
- Completion: when the LOCAL pool after the last decision has ≥2 names →
  phase swap into the vote screen (FR-009); `<2` → locked message
  (FR-008). Where the phase swap renders `VoteClient`, it passes the
  locally derived pool.
- Network-failure notice: persistent dismissable notice, count of failed
  saves (same UX as voting's failedNotices).

### `app/vote-client.tsx` — MODIFIED (additive prop)

Props: adds `pool: readonly string[]`. Passed to `refillReserve` calls.
When `pool.length < 2`: renders the FR-008 locked state instead of the
pair area (defensive duplicate of the completion-time check — the gate
never produces this state with a pool <2 without `complete`, but the
component stays self-sufficient for direct testability).
