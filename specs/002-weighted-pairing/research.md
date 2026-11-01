# Research: Weighted Pair Selection

Feature: 002-weighted-pairing | Date: 2026-11-01

## R1: Weighted random selection algorithm

**Decision**: Cumulative (prefix-sum) weighted draw — build the weight for
every name as `score + 1`, sum them, pick a random number in `[0, total)`,
and walk the cumulative sums to find the selected name.

**Rationale**: O(n) per draw with n = 200 (negligible), no dependencies, no
recursion, exact proportionality. With a fixed 200-name list this is the
simplest correct approach.

**Alternatives considered**:
- *Rejection sampling* (draw unweighted, accept with probability
  weight/max): simpler loop but unbounded worst-case retries when scores
  are heavily skewed; violates predictability.
- *Alias method* (Walker): O(1) draws but requires precomputed table
  rebuilds on every score change — pointless complexity for 200 names and
  two users (Principle V violation).
- *Library* (e.g., `weighted-random`): new dependency for ~10 lines of
  code — rejected under Free-Plan Budget / Principle V.

## R2: Weight formula

**Decision**: `weight = score + 1` (clarified in spec session 2026-11-01).

**Rationale**: Satisfies all clarified requirements simultaneously:
- uniform when all scores are 0 (all weights = 1) → FR-004;
- never zero for any name → FR-003;
- exact linear proportionality between appearance frequencies → FR-002;
- degenerates gracefully for any all-equal score state.

**Alternatives considered**: sqrt (gentler, but weakens the drill-down),
exponential/softmax (strong drill-down, but no simple exact proportionality
statement and harder tests), capped linear (arbitrary cap constant to
justify — rejected as unneeded complexity).

## R3: Pair composition

**Decision**: Draw both members independently from the same weighted pool
(spec FR-008), then apply the existing retry loop for validity: redraw
while the two names are identical or the pair equals the previous pair in
either order.

**Rationale**: One code path, no bracketing logic. Retry termination is
guaranteed: with 200 names the probability of staying invalid is
vanishingly small, and the loop is bounded in practice (same as current
implementation).

**Alternatives considered**: upper/lower bracket halves, closest-score
opponent matching — both rejected in clarification (adds a second
selection mechanism without user need).

## R4: Where scores come from at draw time

**Decision**: The vote screen already needs fresh data per interaction;
scores are fetched (existing `scores()` store read, exposed via the
existing server-action pattern) once when the vote client mounts/loads and
after each successful vote, then passed as a plain `Record<string, number>`
into `nextPair(pair, scores)`. The weighting is a pure function of that
map.

**Rationale**: Keeps `nextPair` pure and unit-testable (Principle III),
adds no new Redis commands (one read per page/interaction refresh — within
Free-Plan Budget), and satisfies FR-006 (weights = score state at draw
time; after a vote the scores are refetched, so the very next pair reflects
the latest standings per US3).

**Alternatives considered**: reading scores inside `nextPair` (breaks
purity/testability), storing weights separately (new state — forbidden by
FR-006).

## R5: Test design

**Decision**: Unit tests in `tests/unit/pairing.test.ts` (written first):
1. Empty scores → uniform (±10% of mean over 10,000 draws; SC-002).
2. Proportionality: with seeds like score 50 vs 0 vs 5, observed
   frequencies track the weight ratio (±10% tolerance; SC-001).
3. Nonzero reachability: one name at a very high score, all others 0 —
   every name still appears in 10,000 draws (SC-003).
4. Validity retained: distinct members, no immediate exact repeat
   (FR-005), including with skewed scores.
5. Deterministic-weight property test: for a fixed score map, a seeded PRNG
   replica of the cumulative draw yields frequencies within tolerance —
   guards against off-by-one in prefix sums.

Tolerance choice: ±10% at 10,000 draws is statistically comfortable
(binomial sd for 200 names at ~50 expected appearances is ~7, i.e. ~14% —
10% may rarely flake; mitigate by seeding fixed scores and using a fixed
count of 10,000, and asserting against a slightly relaxed practical bound
in the ±10–15% window only if flakiness appears — target stays ±10% per
SC-002).

**Rationale**: Pure-function tests only; no integration test (Principle
IV). No seeding of real Redis needed — the weight function takes a plain
map.

**Alternatives considered**: statistical chi-square assertions (more
precise but adds machinery — overkill for a toy project); snapshot-style
"golden" frequency tables (brittle).

## R6: Rollout

**Decision**: Single atomic change — `lib/pairing.ts` + tests +
`app/vote-client.tsx` wiring — implemented and shipped together.

**Rationale**: The UI change (passing scores) is meaningless without the
new `nextPair` signature and vice versa; splitting them would leave the
build broken in between. Scope stays tiny (2 files + 1 test file).
