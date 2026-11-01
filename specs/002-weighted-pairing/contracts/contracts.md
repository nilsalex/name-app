# Contracts: Weighted Pair Selection

Feature: 002-weighted-pairing | Date: 2026-11-01

## Public module contract: `lib/pairing.ts`

The existing `nextPair` contract changes shape (scores become required for
weighting). Callers outside the vote screen: none.

### Types (unchanged)

```ts
export type Pair = [string, string];
```

### `nextPair`

```ts
export function nextPair(
  previousPair?: Pair,
  scores?: Readonly<Record<string, number>>
): Pair;
```

- **Behavior**:
  - `scores` missing or empty → uniform selection (identical to feature
    001 behavior; FR-004).
  - `scores` provided → each name's selection probability is proportional
    to `weight = (scores[name] ?? 0) + 1` (FR-001/FR-002).
  - Both members drawn independently from the same weighted pool (FR-008).
  - Validity retries unchanged: redraw while members are identical or the
    pair equals `previousPair` in either order (FR-005).
  - Pure function: no I/O, no module state; randomness via `Math.random()`
    only (FR-006/FR-007). Must only be called client-side or in
    non-prerender contexts (Next.js Cache Components block `Math.random()`
    during prerender — same constraint as feature 001).

### Caller contract: `app/vote-client.tsx`

- Fetches the score map once on mount and refreshes it after each
  successful vote (existing server action; no new endpoint), then passes it
  as the second argument to `nextPair`.
- Keeps ownership of `previousPair` state exactly as in feature 001.

## Server actions: `app/actions.ts`

**No changes.** `submitVote`, `getRanking`, `getWinners` keep their
signatures and behavior. The score map for the draw is obtained through the
existing scores read path (`scores()` from `lib/store.ts`, already exposed
to the client via server actions in feature 001).

## Storage: Upstash Redis

**No changes.** Same keys (`namewahl:scores` sorted set, `namewahl:votes`
stream), same atomic pipeline per vote, no new commands, no new keys.
