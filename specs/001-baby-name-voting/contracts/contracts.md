# Contracts: Baby Name Voting

The app exposes three screens (UI contract) backed by two internal module
interfaces and three server actions. There are no external/public HTTP APIs.

## UI Contract (screens)

### Vote screen — `/` (P1)

- Shows exactly two distinct names (large, tap-friendly buttons).
- Tapping a name records a vote (winner = tapped, loser = other) and shows a
  new pair immediately.
- If the user has not picked their identity yet, the pick-your-user prompt
  is shown first (two buttons: User A / User B).
- On submission failure: error message, vote not counted, pair unchanged.

### Ranking screen — `/ranking` (P2)

- Lists all 200 names with rank number and score (win count).
- Shared rank for tied scores (e.g. 1, 2, 2, 4); ties listed alphabetically
  for stable display.
- Empty state (zero votes): all names shown with score 0 and shared last
  rank — not an error.

### Winners screen — `/winners` (P3)

- Highlights the name(s) holding rank 1 (all of them on ties).
- Empty state (zero votes): explanatory message instead of a failure.

## Internal Module Contracts

### `lib/pairing.ts`

```ts
/** Returns two distinct names; never an identical repeat of previousPair. */
export function nextPair(previousPair?: [string, string]): [string, string];
```

- Both members are always distinct (FR-002).
- No memory beyond `previousPair` (clarification Q1: repeats allowed).

### `lib/ranking.ts`

```ts
export interface RankedName {
  name: string;
  score: number; // win count
  rank: number;  // shared rank position (1-2-2-4 style)
}

/** Orders names by score desc; equal scores share a rank. */
export function rankNames(
  names: readonly string[],
  scores: Readonly<Record<string, number>>,
): RankedName[];
```

- Pure function; no I/O.
- Names with zero votes appear with `score: 0` at the shared bottom rank.

### `lib/store.ts`

```ts
export interface VoteRecord {
  winner: string;
  loser: string;
  user: "A" | "B";
  at: string; // ISO timestamp
}

/** Records one vote atomically: appends to audit stream + ZINCRBY scores. */
export function recordVote(vote: Omit<VoteRecord, "at">): Promise<VoteRecord>;

/** Current win counts for all names. */
export function scores(): Promise<Record<string, number>>;
```

- `recordVote` MUST NOT partially persist: both the stream append and the
  score increment happen or neither does (vote-loss prevention, SC-004).
- Throws on connection/write failure — caller shows retry UI, vote not
  counted (FR-012).

## Server Actions (called from client components)

| Action | Input | Output / Effect |
|---|---|---|
| `submitVote(winner, loser, user)` | two distinct names + `"A"\|"B"` | persists vote; returns success; on failure returns error state (FR-012) |
| `getRanking()` | — | `RankedName[]` for all 200 names |
| `getWinners()` | — | the name(s) at rank 1, possibly several on ties |
