# Phase 0 Research: Baby Name Voting

All Technical Context unknowns resolved. No NEEDS CLARIFICATION markers remain.

## R1: Cologne 200 boy names list — source and shape

**Decision**: Embed the list as a TypeScript constant (`lib/names.ts`): an
array of 200 `{ name: string }` entries (or a plain `string[]`), imported at
build time. The list is fetched once from the publicly available Cologne
"Beliebte Vornamen" (Cologne 200) statistics during implementation and
committed as static data.

**Rationale**: The list is fixed (200 boy names), tiny (a few KB), and never
changes at runtime. Static embedding eliminates a network dependency, keeps
page loads instant, and costs nothing on any plan — directly serving
Principle V (Simplicity Is Paramount) and the Free-Plan Budget.

**Alternatives considered**:
- Fetch the list from the publisher's website at runtime — rejected:
  runtime external dependency, slower pages, potential source changes break
  the app, unnecessary for a static dataset.
- Store the list in Upstash — rejected: wastes free-tier storage/requests
  for data that never changes.

## R2: Vote storage model on Upstash Redis (free tier)

**Decision**: Use two structures in one Upstash Redis database:
1. A **sorted set** `scores` — member: name, score: win count. Incremented
   atomically per vote with `ZINCRBY`.
2. A **stream** `votes` (or a list, if stream commands are unavailable in
   the free tier) — one entry per vote: `{ winner, loser, user, at }` as an
   audit log and source of truth for recomputation.

**Rationale**: Each vote is written as a single Redis transaction
(MULTI/EXEC via the Upstash client's `exec` with both commands batched):
stream append + `ZINCRBY` commit together or not at all, so concurrent votes
are never lost and partial persistence is impossible (spec edge case +
SC-004, contracts/contracts.md both-or-neither rule). Over the REST API,
the concrete mechanism is the client's batch/pipeline call
(`pipeline([streamAdd, zincrby])`) rather than two sequential awaits. The sorted set gives O(log n)
ranked queries for 200 members — trivially fast. The audit stream allows
verification/recomputation without re-deriving from scores alone. Two keys,
no schema migration, fits far below free-tier limits (a few thousand votes
over two months is negligible against the 10k commands/day free allowance).

**Alternatives considered**:
- Relational DB (e.g. Vercel Postgres) — rejected: paid/limited free tier,
  more moving parts, violates Free-Plan Budget and Principle V.
- JSON blob read-modify-write — rejected: not atomic; concurrent votes
  could be lost (violates SC-004).
- Vercel KV — rejected: it is Upstash under the hood but adds an
  abstraction layer; direct `@upstash/redis` is simpler and dependency-
  minimal.

## R3: Ranking computation and tie handling

**Decision**: Ranking = names ordered by score descending; names with equal
scores share the same rank position (standard "1-2-2-4" competition
ranking), rendered in a stable order (alphabetical within a tie for display
stability only — this is presentation order, not a score tie-break).

**Rationale**: Matches FR-007/FR-014 and clarification Q2 exactly: no
tie-break rule, shared positions. Computing the ranking in a pure function
(`lib/ranking.ts`) from the sorted-set data keeps it testable and makes the
"Ranking is a view over votes, not separately maintained state" entity rule
trivially true.

**Alternatives considered**:
- Statistical rating (Elo/Bradley-Terry) — rejected for v1: the spec
  assumption fixes win count as the score; a rating system is added
  complexity with no current need (YAGNI).

## R4: User identification for two users

**Decision**: No accounts. On first visit the user picks which of the two
users they are from a one-time prompt (two buttons); the choice is stored in
browser local storage and sent as a plain identifier with each vote.

**Rationale**: FR-010 requires vote attribution per user, but with exactly
two known participants and no security requirements in the spec, a pick-your-
user prompt is the simplest mechanism that satisfies it. No auth
infrastructure, no paid identity service (Free-Plan Budget, Principle V).

**Alternatives considered**:
- Passwordless email magic links — rejected: needs an email provider
  (possibly paid), heavy for two users.
- Password accounts — rejected: unnecessary friction and complexity.

## R5: Pair selection strategy

**Decision**: Random pair selection from the 200 names, excluding identical
pairs (FR-002) and avoiding an identical repeat of the immediately previous
pair shown to that user (spec acceptance scenario 3). No memory of
historical pairings (clarification Q1: repeats allowed).

**Rationale**: With 200 names there are ~19,900 pairings; two users over a
couple of months will see a tiny fraction, so random selection feels fresh
with zero bookkeeping. Pure function in `lib/pairing.ts` — testable with a
seeded random source.

**Alternatives considered**:
- Adaptive pairing (e.g. Swiss-system or similar-score opponents) —
  rejected: added complexity, negligible benefit at this scale.
- Round-robin over all pairings — rejected: requires seen-pairing tracking,
  explicitly excluded by clarification Q1.

## R6: Test tooling

**Decision**: Node's built-in `node:test` runner executing TypeScript
through `tsx` (single dev dependency). Unit tests for `pairing.ts` and
`ranking.ts`; one integration test for `store.ts` against Upstash
(dev/local Redis credentials via env vars).

**Rationale**: Proportionate to the project (Principles III/IV): no Jest
config ecosystem, no coverage tooling, one dev dependency. `tsx` also gives
a dev script runner for any CLI utilities if needed.

**Alternatives considered**:
- Jest/Vitest — rejected: heavier configuration and dependency footprint
  than the test surface warrants ("don't overdo it").
- No tests — rejected: violates Proportionate Test-First for the core
  ranking/pairing logic.
