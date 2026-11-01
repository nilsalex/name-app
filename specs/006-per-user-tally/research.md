# Research: Per-User Tallies and Drafting Frequency (006)

Date: 2026-11-02. Resolves the open technical choices for per-user ranking,
winners, and drafting frequency. Constraints: toy app, free-plan Upstash,
no new dependencies, simplicity paramount.

## R1: How are per-user win tallies stored and read?

**Decision**: One zset per user, `namewahl:user:<uid>:scores`
(member = name, score = that user's win count for the name). Written with
`ZINCRBY` at vote time; read with `ZRANGE … WITHSCORES` (same parse idiom
as the existing global `scores()`). A user's ranking =
`rankNames(ALL_200_NAMES, userScores(uid))` — the pure ranking function is
unchanged; only the score map's source changes.

**Rationale**: Mirrors the existing global-zset pattern exactly (one mental
model), O(log n) increment, single-key read per ranking view. The shared
`rankNames` stays untouched — its input is already just a score map
(locked by T017's insensitivity test in 005).

**Alternatives considered**:
- *Hash per user (`HINCRBY namewahl:user:<uid>:scores name 1`)* — equally
  valid, but zsets give the same shape as the existing global store and
  make future "top N per user" trivial. Costs are identical at n=200.
  Rejected only for consistency reasons, not capability.
- *Compute tallies on the fly from the votes stream (`XRANGE` filter by
  uid)* — O(votes) per ranking view, grows unboundedly over months of use
  (spec: "voting over a couple of months"); also breaks the free-plan
  command budget. Rejected.
- *JSON doc per user with an in-document map* — read-modify-write races
  between concurrent votes; zset ZINCRBY is atomic. Rejected.

## R2: How does seen-frequency work, and when is it written?

**Decision**: One zset per user, `namewahl:user:<uid>:seen`
(member = name, score = how many times the user has been *offered* the
name in any drafted pair). Incremented at **pair-draft time**, not vote
time — a user who sees a name but votes for the other one has still "seen"
it (spec Key Entities: seen-frequency ≠ win tally). To keep the command
budget flat, seen increments are batched: when the client's reserve is
refilled (a batch of 5 pairs = 10 name-slots), the server action that
serves the batch data bumps the seen counts for exactly the names in the
freshly drafted batch — one `ZINCRBY`-chain (or pipeline of 10 single-slot
increments merged into ≤ 200 members via unique names) per refill, ~1 per
5 votes.

**Rationale**: The client already drafts batches locally (feature 003's
reserve). The batch boundary is the natural, deduplicated moment to
persist exposure — no per-tap writes, and the counts stay accurate because
the batch is *known* to have been presented. Spec's SC-004 ("vote then
ranking current within one interaction") is untouched: ranking reads the
*win* zset, which is written per vote as before.

**Alternatives considered**:
- *Per-pair ZINCRBY from the client's tap handler* — 2 extra commands per
  tap; budget-needless. Rejected.
- *Derive seen-frequency from the votes stream* — misses every pair the
  user saw but did not vote on, which is the whole point of "exposure".
  Rejected.
- *Client-local only (localStorage)* — dies with browser data, invisible
  server-side, no cross-device continuity. Rejected.

## R3: What exactly does the vote-time pipeline look like now?

**Decision**: `recordVote` becomes a **single pipeline of five commands**,
all keyed to the session uid:
1. `XADD namewahl:votes * {winner, loser, user: uid, at}` (unchanged audit)
2. `ZINCRBY namewahl:scores 1 winner` (unchanged global tally, kept for
   history/possible future global view — no reads anywhere)
3. `ZINCRBY namewahl:user:<uid>:scores 1 winner` (the per-user tally —
   the ranking source)
4. `ZINCRBY namewahl:user:<uid>:seen 1 winner` (voted-for name was seen)
5. `ZINCRBY namewahl:user:<uid>:seen 1 loser` (so was the loser)

Atomicity preserved: pipeline = all-or-nothing per Upstash semantics, same
as the current 2-command pipeline. One round trip, as today.

**Rationale**: Single round trip keeps vote latency identical; commands 4–5
piggyback vote-time exposure for free (the drafted batch bump in R2 then
only needs the *non-voted-partially* names — simplest correct approach:
R2's refill bump writes all 10 slot-names, and vote-time 4–5 are folded
into the same zset idempotently; double-counting between R2 and R3 is
avoided by having the refill bump only names NOT covered by votes already
recorded — see R4 for the exact dedup rule).

**Alternatives considered**:
- *Skip global ZINCRBY (2)* — saves one command but discards historical
  continuity with pre-006 data and any future global view. Kept.
- *Lua script for conditional seen-dedup* — rejected (Principle V; the
  dedup rule in R4 needs no server-side conditionality).

## R4: How is seen-frequency kept from double-counting (vote-time vs refill-time bumps)?

**Decision**: **Refill-time is the only writer.** Vote-time increments (R3
commands 4–5) are dropped; instead, the refill action bumps seen for all
10 name-slots of the freshly drafted batch exactly once, when the batch
leaves the server. Rationale: the batch is the unit of presentation (the
client shows every drafted pair eventually — feature 003's contract), so
batch-time counting is complete AND deduplication-free. The pipeline then
stays at **three commands** (xadd, global zincrby, user-scores zincrby).

**Rationale**: Simpler (one writer per zset), no double-count analysis
needed, and "seen" becomes exactly "was offered in a drafted batch".
SC-003's ±10% balancing operates on this count directly.

**Alternatives considered**: the hybrid above (R3's 5-command pipeline) —
correct but needs careful dedup between two writers; rejected for
simplicity.

## R5: How does under-seen-first pair selection work?

**Decision**: New pure function `pickUnderseenPair(previous, scores, seen)`:
- Weight per name = `1 / (1 + seen[name])` — inverse-linear decay; unseen
  names weigh 1, a name seen k times weighs 1/(k+1).
- Draw both members from this weighted pool (prefix-sum, O(n) — same
  idiom as `weightedPick`); redraw the second member on collision only
  (identical distributional argument as feature 002's `nextPair`); reject
  an exact repeat of `previous` (either order), same as today.
- `scores` (win tally) is **not** used for weighting in 006 — weighting is
  purely exposure-driven. `scores` remains a parameter only because the
  client's refill signature carries it for potential future use; the
  function ignores it (documented) OR the signature is cleaned to drop it
  (chosen: drop it — YAGNI; `pickUnderseenPair(previous, seen)`).
- Degeneration: empty/missing `seen` → uniform random (new user, AC 3 of
  US2), identical to feature 001's uniform mode.

**Rationale**: Directly implements FR-005 (progressive balancing). The
inverse-linear curve is the simplest monotone "show less-seen more" rule;
over a session it provably converges toward uniform exposure (SC-003's
±10% is measurable in unit tests via the feature 002 statistical harness —
10,000-draw frequency assertions already exist as an idiom).

**Alternatives considered**:
- *Keep win-count weighting (feature 002) and just scope it per user* —
  would re-offer already-decided names heavily (a name voted up 10× has
  weight 11). Contradicts FR-005's intent (exposure balancing). Rejected.
- *Strict queue (least-seen first, deterministic)* — predictable pattern
  (user can game/anticipate pairs); randomness is a feature (FR-009 of 001
  lineage: pairings repeat freely). Rejected.
- *Exponentially decaying weights (1/2^k)* — over-concentrates on unseen
  names early on; linear inverse reaches balance smoothly. Rejected as
  needlessly aggressive for a toy app.

## R6: What do ranking/winners do for an expired or missing session?

**Decision**: `getRanking()` / `getWinners()` read the session uid inside
the existing `<Suspense>` boundary. No uid → the user sees a friendly
prompt to log in ("Melde dich an, um deine Rangliste zu sehen.") — NOT an
empty 200-name list (which would look like "you voted nothing for
everything" and be misleading). Signed-in with no votes yet → the neutral
bottom rank list (spec AC 3 of US1) plus the personal heading.

**Rationale**: Distinguishes "not signed in" from "signed in but no votes"
— two very different user states. FR-009's "make it evident the ranking is
personal" is served by the "Deine Rangliste" heading in both cases.

**Alternatives considered**:
- *Public global ranking fallback when logged out* — reintroduces the
  blended view this feature removes; also leaks other users' activity to
  strangers. Rejected (spec assumption: per-user replaces global).

## R7: What happens to legacy "A"/"B" votes and the existing global zset?

**Decision**: Nothing — by design. Legacy records live under alias keys
that never match `namewahl:user:<uid>:*`; per-user views exclude them
automatically (FR-008, SC-005 by construction, pinned by a unit test on
key derivation). The global `namewahl:scores` zset keeps accumulating
writes (one ZINCRBY per vote inside the same pipeline) but is read by
nothing; it remains the only place legacy-era history is aggregated, so
"total votes ever cast per name" stays answerable.

**Rationale**: Zero migration, zero attribution guesswork (005's standing
decision: no merging), and the historical dataset survives intact for a
possible future "global view" feature.

**Alternatives considered**:
- *Attribute "A"/"B" records to the two known users via env mapping* —
  contradicts 005's explicit no-merging decision; also 005 removed the
  env mapping entirely. Rejected.
- *Delete the global zset* — destroys history for zero real savings
  (one ZINCRBY per vote). Rejected.

## R8: How does the client get its per-user scores AND seen map for refills?

**Decision**: The existing `getScores()` server action (used by the vote
screen's mount/refill) becomes uid-scoped and returns **both** maps:
`{ scores, seen }` (personal win tally + personal seen-frequency). The
refill passes `seen` into the new `pickUnderseenPair`-based
`refillReserve`. `refillInFlight`/dedup logic is untouched. The batch's
name-slots are then bumped server-side (R4) by the same action that
returns the fresh data — one round trip, no extra client action.

**Rationale**: Minimal client change (same call site, wider return type),
and the seen-bump happens exactly once per batch at the moment of drafting
(R4's single-writer rule).

**Alternatives considered**:
- *Two separate actions (scores, seen)* — one extra round trip per refill
  for no benefit. Rejected.
- *Client-side seen tracking with periodic flush* — state drifts on
  reload; violates "survives page reloads" (spec assumption). Rejected.

## R9: Testing strategy without live Upstash?

**Decision**:
- `pickUnderseenPair`: pure — statistical tests (10,000-draw harness,
  feature 002 idiom) prove (a) unseen names ≥ seen names in offer
  frequency, (b) convergence toward uniform exposure within ±10% after
  sustained drafting, (c) no exact repeats, (d) uniform degeneration with
  empty seen.
- Store key derivation: unit — `userScoresKey("A")`-style collisions
  impossible; alias-shaped uids never produce per-user keys.
- Action scoping: integration-style with `mock.module` (005 idiom) —
  unauthenticated `getRanking`/`getWinners` → `{ ok:false }`-style
  logged-out signal with zero Redis reads; signed-in path reads only the
  uid-scoped key.
- Live flows (real Google + Upstash, cross-user isolation) →
  quickstart V1–V6, run in the user's environment (same deferral as
  003/004/005).

**Rationale**: Matches the established, constitution-compliant test idiom
(Principle III/IV) and the reality that credentials live only in the
user's environment.

**Alternatives considered**: dockerized Redis for CI — new infrastructure
for a toy app; rejected (Principle V).
