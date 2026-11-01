# Contracts: Per-User Tallies and Drafting Frequency (006)

Date: 2026-11-02. All contracts are internal TypeScript interfaces (server
actions + pure functions) — the app exposes no HTTP API beyond its own
routes and server actions. Legacy alias records are unaffected.

## Server Actions (`app/actions.ts`)

### `getRanking(): Promise<RankingEntry[] | null>`

**CHANGED (was global)**: returns the **signed-in user's** ranking.

- Signed-in: full 200-entry list, each `{ name, rank, score }`, shared-rank
  ties (1-2-2-4), rank computed over all 200 names with absent names at
  score 0. `score` = the user's own win count.
- Signed-out: returns `null` (was: global list). UI renders a login prompt
  (R6).
- Errors (Upstash unreachable etc.): throws — the page's existing
  try/catch renders "momentan nicht verfügbar" (unchanged contract).

### `getWinners(): Promise<{ ok: true; winners: string[] } | { ok: false }>`

**CHANGED (was global)**: winners derived from the user's personal tally.

- Signed-in with ≥1 vote: `{ ok: true, winners: [names at personal rank 1] }`
  (ties included).
- Signed-in, zero votes: `{ ok: true, winners: [] }` → "Noch keine Stimmen
  — alle Namen führen!" (unchanged empty-state copy; now truthful per
  user).
- Signed-out: `{ ok: false }` → existing error/empty state.

### `getScores(): Promise<{ scores: Record<string, number>; seen: Record<string, number> }>`

**CHANGED**: was `Promise<Record<string, number>>` (global scores).
Now uid-scoped and returns BOTH personal maps:

- `scores`: personal win tally (source: `namewahl:user:<uid>:scores`).
- `seen`: personal seen-frequency (source: `namewahl:user:<uid>:seen`).
- **Side effect (single-writer rule, R4)**: when called for a refill that
  serves `batchCount` new pairs, the action bumps seen for each name-slot
  of the *incoming* drafted batch — the caller passes the freshly drafted
  batch's names; see the refined signature below.

Refined signature (chosen over overloading):

```ts
getScores(freshBatch?: readonly string[]):
  Promise<{ scores: Record<string, number>; seen: Record<string, number> }>
```

- `freshBatch` present (refill call): action bumps seen+1 for each
  distinct name in the batch (pipeline, after reading), then returns the
  maps. Mount-time first call omits `freshBatch` → read-only.
- Signed-out: throws (caller redirects to login — unchanged behavior).
- Batch bump failure must not fail the read: bump errors are swallowed
  (log only) — seen-frequency is heuristic, availability wins.

## Pure Functions (`lib/pairing.ts`)

### `pickUnderseenPair(previous: Pair | null, seen: Readonly<Record<string, number>>): Pair`

**NEW**. Weighted under-seen-first pair draft.

- Weight(name) = `1 / (1 + seen[name] ?? 0)`.
- Both members drawn independently from the weighted pool (prefix-sum,
  O(n)); second member redrawn on collision (same-member), same
  distributional argument as feature 002.
- If result equals `previous` (either order): redraw up to a small bounded
  number of attempts, then fall back to any non-identical member swap
  (guaranteed termination, preserves INV-5).
- Empty/missing `seen` ⇒ uniform distribution over all 200 names
  (INV-6) — statistically identical to feature 001's uniform mode.
- Note: win `scores` are deliberately NOT an input (R5 — exposure-driven
  weighting only).

### `nextPair(previous, scores)` — UNCHANGED

Retained for feature 002's semantics/tests; no production call site after
006 (drafting switches to `pickUnderseenPair`). Not deleted (tests pin its
statistical contract).

## Reserve Refill (`lib/pair-queue.ts`)

### `refillReserve(reserve, count, previous, seen): Pair[]`

**CHANGED (was `(reserve, count, previous, scores)`)**: chains
`pickUnderseenPair` over the batch, threading `previous` and the
*accumulated* seen counts (each drafted pair updates the in-batch seen
map before the next draw, so a batch of 5 self-balances). Caller passes
the accumulated batch's names to `getScores(freshBatch)` for the
single-writer seen bump.

## Keys & Storage Contract (see data-model.md)

- `namewahl:user:<uid>:scores` — zset, personal wins, ZINCRBY at vote time.
- `namewahl:user:<uid>:seen` — zset, personal exposure, ZINCRBY at batch
  time (the only writer).
- `namewahl:votes` — unchanged XADD per vote.
- `namewahl:scores` — unchanged ZINCRBY per vote; **no reads** in 006.
- Vote pipeline: exactly `XADD` + `ZINCRBY global` + `ZINCRBY user` in one
  pipeline (3 commands, 1 round trip).

## UI Contract (FR-009)

- Ranking page heading: **"Deine Rangliste"**; logged-out: login prompt
  ("Melde dich an, um deine Rangliste zu sehen.") instead of a list.
- Winners page heading: **"Deine Gewinner"**; logged-out: same prompt
  pattern. Empty-personal-tally copy unchanged ("Noch keine Stimmen —
  alle Namen führen!").
- Vote screen hint (already per-user since 005) unchanged.
