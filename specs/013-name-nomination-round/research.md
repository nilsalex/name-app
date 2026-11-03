# Research: Name Nomination Round (013)

Date: 2026-11-03. Resolves every design question the spec left open at the
implementation level. Format per existing feature research files.

## R1 — How is nomination state stored, and how is "resume" derived?

**Decision**: One per-user Redis hash
`namewahl:user:<uid>:nominations` — field = name from the Cologne 200 list,
value = `"in" | "out"` (JSON-string-free, single-character values).

Completeness, progress counter, and the voting pool are **derived on every
read** by comparing the hash's decided names against the canonical
`COLOGNE_200_BOY_NAMES` order — no stored order, no counters, no
round-state record. Resume = first name in canonical order with no field.

**Rationale**: Canonical-order derivation makes resume
(FR-005), exactly-once presentation (FR-004), progress (FR-012), and
completeness (FR-006) all pure functions of one hash read — the simplest
state that can't drift out of sync with the static name list (if the list
ever changed, a hash can't be "ahead" of it the way a positional pointer
could). Mirrors 006's design where ranking is derived from a zset rather
than stored.

**Alternatives considered**:
- *Position cursor + decisions list*: one more key and an invariant to
  maintain; cursor can desync from list edits. Rejected (Principle V).
- *Single JSON blob per user*: one GSET/race-prone read-modify-write per
  decision; two tabs could clobber each other. Hash HSETs are per-field
  atomic and coroutine-safe. Rejected.
- *Per-name keys* (`…:nomination:<name>`): 200 keys per user instead of 1;
  HGETALL is one request. Rejected (Free-Plan Budget: request count).

## R2 — Write path: how are decisions persisted without stalling the UI?

**Decision**: Fire-and-forget per decision, mirroring the established vote
sender pattern (`lib/vote-sender.ts`, feature 003): the UI swaps to the next
name synchronously; the `setNomination` server action dispatches in
background with bounded retry; a persistent dismissable notice surfaces
failures after the retry window.

**Rationale**: SC-001 (decision <5 s, presentation <100 ms) is satisfied by
never awaiting the network on the presentation path — the exact pattern
already proven for votes. A failed HSET is recoverable-by-retry or at worst
leaves the user at the same name again (the derivation simply still shows
it as undecided — self-healing, no lost progress beyond the retry window;
FR-003 persistence is guaranteed for any decision the user saw accepted).

**Alternatives considered**:
- *Await each HSET*: 200 sequential round trips ≈ minutes of dead time.
  Rejected (SC-001).
- *Batch-write at round end*: progress lost on tab close mid-round; also a
  big final write. Rejected (FR-003/edge case: refresh mid-round must keep
  all prior decisions).

## R3 — Gate and phase transition: where does the voting screen branch?

**Decision**: Extend the existing session gate in `app/page.tsx`.
`VoteGate` (inside the existing single Suspense boundary) calls
`getNomination(uid)` alongside its session/user reads; renders

- `LoginClient` — signed out (unchanged),
- `NominateClient` — round incomplete,
- `VoteClient` with `pool` prop — round complete.

On the last decision, `NominateClient` derives the pool locally, and if it
has ≥2 names swaps itself into the vote phase (client-side state change —
the components are siblings under the same gate), otherwise renders the
locked message (FR-008). `router.refresh()` is NOT needed at the
transition; a full refresh of `/` lands the user in voting anyway via the
gate (FR-013), and interruption (tab close) self-corrects on next open.

**Rationale**: One Suspense boundary and one data round trip preserve the
005 gate shape and Cache Components constraints (`cookies()` read stays at
request time). No new route means no new prefetch/navigation surface, no
shared state to synchronize between two pages.

**Alternatives considered**:
- *Dedicated `/nominate` route + redirect*: adds a route, a redirect
  decision matrix (who's in which phase), and a navigation round trip at
  completion. Rejected (Principle V; FR-009 demands a seamless transition).
- *Middleware-level redirect*: middleware can't easily read Redis without
  broadening its runtime surface. Rejected.

## R4 — How does the pool constrain pair drafting?

**Decision**: `pickUnderseenPair(previousPair, seen, pool?)` — when `pool`
is provided, prefix-sum drafting iterates over `pool` (instead of the full
list) with weight `1 / (1 + seen[name])`; missing/empty pool = full list
(= today's behavior, zero drift for any caller that doesn't pass it).
`refillReserve(reserve, seen, lastPair, pool?)` threads it through.
`vote-client` passes the user's pool (derived once from `getNomination` at
gate time and passed as prop — no extra fetch).

**Rationale**: Minimal change: one optional parameter on two pure functions
that are already unit-pinnable. The seen-frequency semantics (002/006) hold
unchanged within the pool; excluded names simply have zero presence, so no
excluded name can ever be drafted (SC-004/FR-007 demonstrably). Weight
`1/(1+seen)` degenerates gracefully for a fresh pool (all seen = 0 →
uniform within pool, matching feature 001's uniform default).

**Alternatives considered**:
- *Draft from full list and filter out non-pool names*: drafting loop
  could spin for a long time when the pool is small (rejection sampling).
  Rejected.
- *Separate pool-scoped drafting function*: duplicates the
  collision/repeat/no-previous logic that is already battle-tested and
  order-fidelity-critical. Rejected (Principle V).

## R5 — Server action surface

**Decision**: Two additive server actions in `app/actions.ts`:

- `getNomination(): Promise<NominationState>` — signed-out ⇒
  `{ ok: false }`-shaped result (pages like the ranking screen render a
  login prompt for null states, R6 in 006). Signed-in ⇒
  `{ ok: true, decisions: Record<name, "in" | "out"> }` plus derived
  `nextName`, `decidedCount`, `pool`, `complete` (server-derived per R1;
  the client also re-derives optimistically after each tap — cheap pure
  function).
- `setNomination(name, decision): Promise<ActionResult>` — validates the
  name is on the canonical list and the decision is a valid value, session
  check identical to `submitVote`; one HSET. Idempotent (final decisions
  may be re-sent by the retry path without side effects beyond the same
  write — FR-011-safe).

**Rationale**: Matches the existing action contracts style (006
contracts.md): explicit result shapes, session-derived uid inside the
action (never trusted from the client), `unknown` input types validated
with the same `isName` guard used elsewhere. Reuses `ActionResult` so the
client error handling stays uniform with voting.

**Alternatives considered**:
- *One bulk `setNominations(batch)` action*: saves requests in a few
  write-batch flows but breaks the fire-and-forget per-decision UX (FR-003
  refresh edge case). Rejected.
- *Client-side-only pool enforcement (validate on submitVote)*: vote
  validation against exclusions server-side is additionally a defense for
  FR-007 integrity... but it adds a Redis read per vote (free-plan budget,
  and the vote path is latency-sensitive). **Chosen compromise**: the pool
  is enforced at drafting (R4); `submitVote` keeps its existing name-list
  validation (a name outside the pool but inside the 200 is still
  acceptable — the client never drafts it, and the data remains honest).
  Documented here so `/speckit.tasks` doesn't invent an extra validator.

## R6 — Progress counter semantics (FR-012)

**Decision**: Counter shows **decided count / total** ("37 von 200") —
never "names remaining" and never a percentage (spec clarification A:
position and total). `decidedCount` = number of hash fields. The current
name is presented after the counter ("38. Name" for the one being shown),
which is exactly `decidedCount + 1` on the pre-decision screen; the
serializer keeps this honest because decisions are written before the
counter increment is displayed (R2).

**Alternatives considered**: remaining-count phrasing; progress bar only
(both rejected by the clarified spec answer, Option A).

## R7 — UI language and composition

**Decision**: German copy, consistent with existing screens:
heading "Nominierung" + "Welche Namen sollen in die Abstimmung?"
counter "37 von 200", two buttons "Aufnehmen" (include) / "Ausschließen"
(exclude). CSS Modules (`page.module.css` additions or a
`nominate.module.css`) following the existing stacked mobile layout
(feature 008/009/010 learnings — one name per box, large tap targets).
Locked state copy (FR-008, <2 names): "Zu wenige Namen übrig (%d) —
Abstimmung nicht möglich."

**Alternatives considered**: English copy (rejected: all existing UI copy
is German); reusing `page.module.css` wholesale (rejected: distinct
one-name layout, new file is cleaner but equally simple).

## R8 — Testing strategy for the nomination path (constitution III/IV)

**Decision**:
1. **Unit** (red-green first): `nomination-logic` — nextUndecidedName
   skips decided names in canonical order, returns null when complete;
   decidedCount/progress; pool derivation (in-only, order preserved).
2. **Unit** (red-green first): pool-constrained `pickUnderseenPair` —
   never drafts a non-pool name across 200 draws with a tiny pool;
   missing pool argument = identical distribution to existing behavior.
3. **Integration**: nomination store against the existing
   `_setClientForTests` seam (same pattern as 006's store tests): set →
   read roundtrip, incomplete/complete derivation, independent pools per
   two uids.
4. NO integration test for the nomination UI styling (constitution IV).
   The visual suite (`npm run visual`) may gain one nomination-scenario
   capture in tasks, but that is 011/012 territory and optional.

**Rationale**: exactly the proportionate mix the constitution mandates;
reuses the existing test seams and suites, no new scaffolding.
