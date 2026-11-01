# Data Model: Per-User Tallies and Drafting Frequency (006)

Date: 2026-11-02. Extends the 005 data model; all existing keys/records
keep their shape. Everything here is Upstash Redis via the REST client.

## New Entities

### PerUserScores (zset `namewahl:user:<uid>:scores`)

One zset per internal user ID. The **source of truth** for that user's
ranking and winners view.

| Field | Type | Notes |
|---|---|---|
| member | string (name) | one entry per name the user has ever voted FOR; names never voted-for by this user are absent (≈ score 0) |
| score | number | that user's win count for the name |

- **Written**: `ZINCRBY` +1 on the winner, inside the vote pipeline (R4).
- **Read**: `ZRANGE … WITHSCORES` by `getRanking`/`getWinners` for the
  signed-in uid only; by `getScores()` for the voting screen.
- **Validation**: uid must pass `isUserIdShape` (1–64 base64url chars)
  before key construction — legacy aliases "A"/"B" can never reach this
  code path (they are not valid uid shapes… note: "A"/"B" DO pass a
  1–64-chars check; the guard is the *session*, which only ever contains
  real uids minted by `resolveUser` — key derivation is only ever called
  with a value that came from `getCurrentUid()`).
- **Lifecycle**: created implicitly on first vote; never deleted (toy
  app); removed users simply leave orphaned keys (bounded by the approved
  list).

### PerUserSeen (zset `namewahl:user:<uid>:seen`)

One zset per internal user ID. Drives under-seen-first drafting.

| Field | Type | Notes |
|---|---|---|
| member | string (name) | one entry per name the user has been offered |
| score | number | times offered across all drafted batches |

- **Written**: batched at refill time — the server action that returns a
  fresh batch bumps seen by 1 for each of the batch's 10 name-slots
  (R2/R4: single-writer rule; vote-time bumps were explicitly dropped).
- **Read**: by `getScores()` (client refill needs it for
  `pickUnderseenPair`); never read server-side for ranking.
- **Semantics**: "seen" = offered in a drafted pair, regardless of the
  vote outcome. A name the user always votes DOWN still climbs here —
  which is exactly what makes drafting eventually stop over-offering it.

## Modified Entities

### VoteRecord (stream `namewahl:votes`) — unchanged shape, unchanged writer

Already carries `user: <uid>` since 005. Still appended per vote
(`XADD`, field 1 of the pipeline). NOT read by any 006 feature path
(legacy A/B entries remain here for audit only).

### GlobalScores (zset `namewahl:scores`) — kept, demoted

Still `ZINCRBY`+1 per vote (pipeline field 2). **No reads anywhere in
006.** Retained so total historical activity per name stays answerable
and a future global view costs zero migration.

## Removed/Changed Data Flows

| Flow | Before (005) | After (006) |
|---|---|---|
| Ranking read | `ZRANGE namewahl:scores` (global) | `ZRANGE namewahl:user:<uid>:scores` (personal) |
| Winners read | global zset top | personal zset top (same shared-rank tie rule via `rankNames`) |
| Draft weighting | feature 002 `weightedPick` on global scores | `pickUnderseenPair` on personal `seen` map (win scores ignored) |
| Seen tracking | none | batch-time ZINCRBY per drafted name-slot |
| Logged-out ranking | global list shown | login prompt (R6) |

## Key Derivation

```
userScoresKey(uid) = `namewahl:user:${uid}:scores`
userSeenKey(uid)   = `namewahl:user:${uid}:seen`
```

- uid source: exclusively `getCurrentUid()` (HMAC-verified session cookie),
  which only ever contains values minted by `resolveUser` (22-char
  base64url). Derivation functions validate with `isUserIdShape` and throw
  otherwise — defense in depth against alias-shaped or attacker-supplied
  uids ever constructing a key.
- Collision analysis: existing keys are `namewahl:users` (hash),
  `namewahl:users:nextnum`, `namewahl:votes`, `namewahl:scores`. A uid of
  `s`/`votes`/`users` would collide only as `namewahl:user:s:…` — no
  overlap with any existing top-level key. Legacy alias data
  (`user: "A"|"B"` inside stream entries) never becomes a key component.

## State Transitions

**User lifecycle (ranking perspective)**

```
signed-out ──(login)──► fresh user (empty scores, empty seen)
fresh user ──(votes)──► active user (scores/seen grow)
any state  ──(logout)─► signed-out (views show login prompt)
```

**Seen-frequency per name**: absent (never offered) → k (offered k times)
— strictly increasing, never decremented.

**Win tally per name**: absent (never won) → w — strictly increasing;
ranking position derived at read time by `rankNames` (ties share rank,
1-2-2-4 rule — unchanged pure function).

## Invariants (tested)

- INV-1: `getRanking`/`getWinners` issue **zero** reads when no session
  uid exists (SC-005, privacy).
- INV-2: A read with uid U touches only `namewahl:user:U:*` keys — never
  another user's, never global-for-ranking.
- INV-3: One vote = exactly +1 to winner's per-user score, +1 global
  score, +1 stream entry (pipeline atomicity).
- INV-4: One drafted batch of 5 pairs = exactly +1 seen to each of its
  (≤10, deduplicated) name-slots, exactly once (single-writer rule).
- INV-5: `pickUnderseenPair` never returns `previous` (either order) and
  never returns a pair with identical members.
- INV-6: With empty/missing seen map, `pickUnderseenPair` ≡ uniform
  random (feature 001 semantics).
