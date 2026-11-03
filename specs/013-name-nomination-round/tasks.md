# Tasks: Name Nomination Round

**Input**: Design documents from `/specs/013-name-nomination-round/`

**Prerequisites**: plan.md (required), spec.md (required for user
stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included — the constitution (plan.md
Constitution Check) requires test-first per new behavior (Principle
III): one focused red-green test per new pure behavior, one
integration test for the persistence critical path (Principle IV).
No styling/UI integration tests (Principle IV explicitly forbids them).

**Organization**: Tasks are grouped by user story so each story can be
implemented and tested independently. Story coupling note: US2 (pool-
constrained voting) consumes the pool that US1's gate derives; US1's own
checkpoint validates the nomination flow with the vote phase still on the
unconstrained full list (valid because the gate never renders the vote
screen before round completion), and US2's checkpoint validates the
constrained pairs end-to-end.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2,
  US3)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js project: `app/`, `lib/` (production), `tests/unit/`,
`tests/integration/` (existing suites, node:test + tsx via `npm test`),
`specs/013-name-nomination-round/` (this feature's docs). Per plan.md
Project Structure: no new route segments, no new top-level directories.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the untouched baseline before any change

- [X] T001 Baseline gate: run `npm test` (record the passing test count) and `npm run build` on the unmodified tree; both must be green with zero type/lint errors before T002 — this is the "red" reference for Constitution III and the regression floor for every checkpoint

**Checkpoint**: baseline recorded ✅

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Nomination data layer and server actions — blocking for
every user story (all three stories read/write nomination state)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Write failing unit tests for the pure nomination logic in `tests/unit/nomination-logic.test.ts` FIRST (Constitution III, contracts.md "lib/nomination-logic.ts"): given a `decisions` map keyed by name with values `"in" | "out"` — `nextUndecidedName` returns the first `COLOGNE_200_BOY_NAMES` member with no entry (empty map → "Noah", first list name), skips decided names regardless of decision value, and returns `null` when every list name is decided; `decidedCount` counts entries (0 for empty); `includedNames` returns `"in"` names in canonical list order (order of the map keys must NOT matter); `isRoundComplete` is true only when all 200 list names are decided. Unknown/extra map keys not on the list must be ignored by all four functions (defensive, data-model.md validation rule 1). Tests must fail (module does not exist) before T003
- [X] T003 [P] Implement the pure module `lib/nomination-logic.ts` per contracts.md: export `type NominationDecision = "in" | "out"` and the four functions `nextUndecidedName(decisions)`, `decidedCount(decisions)`, `includedNames(decisions)`, `isRoundComplete(decisions)` — all iterate `COLOGNE_200_BOY_NAMES` from `lib/names.ts` in canonical order, take the map read-only, return new values, never mutate input, ignore keys not on the list; no I/O, no `"use server"`, no React; make T002 green
- [X] T004 [P] Write failing integration tests for the nomination store in `tests/integration/nomination-store.test.ts` FIRST (Constitution IV — persistence critical path; same `_setClientForTests` fake-client seam pattern as the existing store integration tests): `writeNomination(uid, "Noah", "in")` then `readNominations(uid)` returns `{ Noah: "in" }`; a second write on another name accumulates; values are narrowed to `"in" | "out"`; `nominationKey("not a uid!")` throws (key-safety guard per data-model.md validation rule 3); a different uid reads an empty map (key isolation — the per-uid basis for FR-007). Tests must fail before T005
- [X] T005 [P] Implement `lib/nomination-store.ts` per data-model.md + contracts.md: `"use server"`-free server-only module (`import "server-only"`); export `nominationKey(uid)` building `${PREFIX}:user:${uid}:nominations` with the same uid shape guard the existing `userScoresKey` uses (throw on invalid shapes); export `async function writeNomination(uid, name, decision: NominationDecision): Promise<void>` performing ONE `HSET` (idempotent under retry, FR-011-safe) and `async function readNominations(uid): Promise<Record<string, NominationDecision>>` performing `HGETALL` with values narrowed to the decision union; reuse the existing redis() client wiring from `lib/store.ts` (do not duplicate client construction — import or mirror the minimal accessor pattern); strict TS, no `any`; make T004 green
- [X] T006 Add the two server actions to `app/actions.ts` per contracts.md: `getNomination(): Promise<NominationResult>` returning `{ ok: false; error }` when signed out (session via the existing `getCurrentUid()`) and otherwise `{ ok: true, decisions, nextName, decidedCount, pool, complete }` — server-side derivation via T003's pure functions over T005's read (research R1: everything derived, nothing extra stored); `setNomination(name: unknown, decision: unknown): Promise<ActionResult>` validating `name` against the canonical list with the same `isName` guard `submitVote` uses and `decision` against the `"in" | "out"` union, session check with `submitVote`'s exact failure copy ("Abgelaufen — bitte neu anmelden."), one `writeNomination` call, failure mapping to "Speichern fehlgeschlagen — bitte nochmal versuchen." (depends on T003, T005)
- [X] T007 Gate check: `npm test` (baseline + T002 + T004 suites all green), `npx tsc --noEmit`, `npm run build` — zero type/lint errors; app behavior unchanged so far (no `app/` page edits yet)

**Checkpoint**: nomination state layer complete and tested; user story
implementation can begin ✅

---

## Phase 3: User Story 1 — Nominate names one by one (Priority: P1) 🎯 MVP

**Goal**: A signed-in user with an incomplete round is shown one name at
a time with include/exclude choices; every decision persists; the round
resumes at the first undecided name; completion transitions straight
into the user's own voting (or the locked message when <2 names remain).

**Independent Test**: Sign in with an incomplete round, decide ~10 names
one by one, reload — the round resumes with all decisions intact and no
name offered twice; complete a round (≥2 included) and land directly in
the vote screen. (Pairs may still draw from the full 200 at this point —
pool constraint is US2.)

### Implementation for User Story 1

- [X] T008 [P] [US1] Create `app/nominate-client.tsx` per contracts.md "app/nominate-client.tsx": client component with props `{ uid: string; initial: NominationState }`; renders the current undecided name (from `initial.nextName`, re-derived locally with `nextUndecidedName`/`decidedCount` after each tap — optimistic, research R6), progress counter "X von 200" (FR-012: decided/total, not remaining, not a percentage), two buttons "Aufnehmen" (include) / "Ausschließen" (exclude) each performing a SYNCHRONOUS local state swap to the next undecided name and dispatching `setNomination` fire-and-forget with the same bounded-retry sender pattern as the vote sender in `lib/vote-sender.ts` (persistent dismissable failed-saves notice after the retry window, feature-003 UX, research R2); on completion (local `isRoundComplete`): derive the local pool with `includedNames` — ≥2 names → swap into the vote phase rendering `VoteClient` with that pool (FR-009: no waiting screen, no router.refresh), <2 → locked message "Zu wenige Namen übrig (N) — Abstimmung möglich." replaced by the FR-008 copy "Zu wenige Namen übrig (N) — Abstimmung nicht möglich." (research R7); German copy per research R7 throughout
- [X] T009 [US1] Add the nomination styles to a new `app/nominate.module.css` per research R7: one name per screen, large tap targets, counter and hint rows consistent with the existing `app/page.module.css` mobile conventions (features 008–010); no shared-CSS refactor (Principle V)
- [X] T010 [US1] Extend the session gate in `app/page.tsx` per research R3: inside the EXISTING single `<Suspense>` boundary, `VoteGate` additionally calls `getNomination()` (one extra store read per open, Free-Plan Budget fine) — signed out → `LoginClient` (unchanged); round incomplete → `NominateClient` with `{ uid, initial: nominationState }`; round complete → `VoteClient` receiving `pool={nominationState.pool}` in addition to the existing `uid`/`label` props (the pool prop itself is consumed in US2; passing it early is harmless); a `getNomination` throw renders the existing fallback-error posture used by the gate (depends on T006, T008)
- [X] T011 [US1] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green; manual `npm run dev` walk-through of quickstart V1 (single-name gate, no pair voting reachable), V2 (one-by-one flow, reload persistence, no repeats), V3 (counter format), V4 (completion → straight into voting; returning user lands in voting, FR-013)

**Checkpoint**: User Story 1 fully functional and testable
independently — the nomination gate exists end-to-end ✅

---

## Phase 4: User Story 2 — Voting starts only after nomination, from the pool (Priority: P2)

**Goal**: Completed users vote on pairs drawn exclusively from their own
included names; fewer than 2 included names never starts voting.

**Independent Test**: Complete a round that excludes "Noah", vote
through several refills — "Noah" never appears in a pair and every pair
is drawn only from included names.

### Implementation for User Story 2

- [X] T012 [P] [US2] Write failing unit tests for pool-constrained drafting in `tests/unit/pairing-pool.test.ts` FIRST (Constitution III, contracts.md "lib/pairing.ts"): `pickUnderseenPair(undefined, {}, pool)` with a 4-name pool over 200 draws produces ONLY names from the pool (SC-004/FR-007), keeps both members distinct, and never repeats `previousPair` in either order; with `seen` counts it still prefers under-seen pool names (weight semantics unchanged within the pool); omitting the `pool` argument reproduces the existing full-list behavior exactly (existing `tests/unit` pairing tests must stay green unchanged — zero drift contract); `refillReserve(reserve, seen, lastPair, pool)` drafts all BATCH_SIZE pairs from the pool only (depends on nothing; red before T013)
- [X] T013 [P] [US2] Add the optional `pool?: readonly string[]` parameter to `pickUnderseenPair` and `nextPair` in `lib/pairing.ts` and thread it through `refillReserve` in `lib/pair-queue.ts` per contracts.md: when provided, the prefix-sum weighted pool iterates `pool` (weights `1/(1+seen[name])` unchanged); undefined/missing pool = full canonical list (existing behavior, zero drift); collision/repeat/no-previous rules unchanged inside the pool; update the two functions' JSDoc to state the ≥2-names caller guard (FR-008) as the contract boundary; make T012 green (depends on nothing file-wise; red-green with T012)
- [X] T014 [US2] Update `app/vote-client.tsx` per contracts.md "app/vote-client.tsx": accept the new `pool: readonly string[]` prop and pass it into every `refillReserve` call (initial mount batch and refills); when `pool.length < 2` render the FR-008 locked state instead of the pair area (defensive duplicate of the completion-time check — copy per research R7); leave the vote dispatch path (`submitVote`) untouched per research R5 (no per-vote pool validation, free-plan budget) (depends on T013, T010's pool prop)
- [X] T015 [US2] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green (existing pairing/pair-queue tests untouched and passing); manual quickstart V5 walk-through (excluded name never in own pairs; included names exhaustively cover all pairs) and V6 (<2 names → locked, other user unaffected)

**Checkpoint**: User Stories 1 AND 2 both work independently ✅

---

## Phase 5: User Story 3 — Independent voting pools (Priority: P3)

**Goal**: Each user's pool is exactly their own inclusions; one user's
exclusions never gate the other's voting.

**Independent Test**: Two users complete rounds with different choices;
each user's pairs draw only from their own set — the excluding user
never sees a name the other included.

### Implementation for User Story 3

- [X] T016 [P] [US3] Add the two-uid independence integration tests to `tests/integration/nomination-store.test.ts` (Constitution III — one focused test for the independence behavior, red FIRST if the assertion can fail against current code): with uid1 = `{ Noah: "out", Paul: "in" }` and uid2 = `{ Noah: "in", Paul: "out" }` written via `writeNomination`, `readNominations` per uid returns exactly that user's map, `includedNames(readNominations(uid1))` = `["Paul"]` and uid2's = `["Noah"]` (US3 AC2: excluding user never sees it, including user still votes on it), and neither write is visible under the other uid's key (FR-007: pools independent, no intersection computed anywhere — data-model.md "VotingPool")
- [X] T017 [US3] Verify the gate is per-session only: confirm `app/page.tsx`'s nomination branch and `app/vote-client.tsx`'s pool derive exclusively from the current session's uid (`getCurrentUid()`) with no cross-user read (code inspection + the T016 key-isolation tests as evidence); assert the US3 AC3 path — an incomplete round for one user blocks only THAT user (already guaranteed by the per-session gate from T010; record the verification in the PR description)
- [X] T018 [US3] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green; manual quickstart V5 two-user walk-through (X excluded "Noah" never sees it; Y included it and votes on it; each user's pairs draw exclusively from their own inclusions)

**Checkpoint**: All user stories independently functional ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and final quality gates

- [X] T019 Run the full quickstart.md validation suite V1–V7 in order on `npm run dev` (and on the deployed branch if credentials allow); record pass/fail per scenario in the PR description — V7 (decisions final, no UI path to change them, FR-011) explicitly included
- [X] T020 Final constitution gates: `npm test` all green, `npx tsc --noEmit` zero errors, `npm run build` zero type/lint errors (Development Workflow rule); confirm no new dependency entered `package.json` (Principle V) and PR lists exercised principles + test-first evidence per constitution Governance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — baseline must be green before anything changes
- **Foundational (Phase 2)**: T002→T003 (red-green), T004→T005 (red-green) can proceed in parallel; T006 needs T003+T005; T007 gates the phase — BLOCKS all user stories
- **User Stories (Phase 3–5)**: all depend on Phase 2; US2 additionally depends on US1's gate work (T010) for the pool prop wiring, but its pure-function core (T012/T013) can start right after Phase 2 in parallel with US1
- **Polish (Phase 6)**: depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Phase 2 only — nomination client + gate; testable with pairs still on the full list
- **User Story 2 (P2)**: pure drafting constraint (T012/T013) after Phase 2 in parallel with US1; vote-client wiring (T014) after T013 + T010
- **User Story 3 (P3)**: delivered by per-uid keys (T005) + per-session gate (T010); T016/T017 are its focused proof — can run in parallel with US2's checkpoint

### Within Each User Story

- Tests written FIRST and failing (Constitution III/IV) before their implementation task
- Pure logic before UI wiring; UI before gate integration; checkpoint last

### Parallel Opportunities

- T002/T003 alongside T004/T005 (different files, independent red-green cycles)
- T012/T013 (US2 core) in parallel with T008–T010 (US1 UI)
- T016 (US3 tests) in parallel with T014/T015 (US2 wiring)
- T008 and T009 are the same story's separate files but T009's classes are consumed by T008's component — sequence them

---

## Parallel Example: Foundational Phase

```bash
# Launch the two independent red-green cycles together:
Task: "Write failing nomination-logic unit tests in tests/unit/nomination-logic.test.ts"
Task: "Write failing nomination-store integration tests in tests/integration/nomination-store.test.ts"
# then their implementations:
Task: "Implement lib/nomination-logic.ts"
Task: "Implement lib/nomination-store.ts"
```

## Parallel Example: User Stories 1+2 after Phase 2

```bash
# Developer A (US1): nominate-client.tsx → nominate.module.css → page.tsx gate
# Developer B (US2): pairing-pool tests → pairing.ts/pair-queue.ts pool param
# Converge at T014 (vote-client pool prop) which needs both.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline → Phase 2 foundation (T002–T007)
2. Phase 3 (T008–T011): the nomination gate works end-to-end
3. **STOP and VALIDATE**: quickstart V1–V4 pass; vote phase still full-list (correct — US2 not yet wired)

### Incremental Delivery

1. MVP (US1) → validate → users can nominate; completed users vote on the full list
2. Add US2 → pairs draw from the personal pool → V5/V6 pass
3. Add US3 → independence proven by tests → V5 two-user pass
4. Phase 6: full quickstart + final gates → ship

### Notes

- Commit after each task or logical group
- Every test task is written red against the unmodified tree first (Constitution III) — T001's baseline is the reference
- No new dependency may enter `package.json` at any step (Principle V / plan.md Technical Context)
- Avoid: touching `lib/pairing.ts` weighting math beyond the pool iteration window, adding per-vote pool validation (research R5), or new route segments (research R3)
