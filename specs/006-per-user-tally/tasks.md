---

description: "Task list for feature 006 implementation"
---

# Tasks: Per-User Tallies and Drafting Frequency

**Input**: Design documents from `/specs/006-per-user-tally/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contracts.md, quickstart.md

**Tests**: Included — the constitution (Principle III/IV) mandates proportionate red→green test-first tasks; plan.md's Testing section defines them.

**Organization**: Tasks grouped by user story (US1 personal ranking P1, US2 per-user drafting P2, US3 legacy/identity hygiene P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project at repository root: `lib/`, `app/`, `tests/unit/`, `tests/integration/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification before any changes

- [x] T001 Run existing gates to record a green baseline: `npm test` (87/87 expected), `npx tsc --noEmit`, `npm run build` — do not start other tasks until all three pass

**Checkpoint**: Baseline green — feature work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Per-user zset storage (`namewahl:user:<uid>:scores`, `namewahl:user:<uid>:seen` per data-model.md) and the 3-command vote pipeline — blocking prerequisites for US1 (reads scores) and US2 (reads/writes seen)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Write failing unit tests for key derivation in `tests/unit/store-keys.test.ts`: `userScoresKey(uid)` / `userSeenKey(uid)` return `` `namewahl:user:${uid}:scores` `` / `:seen`; both throw on uids failing `isUserIdShape` (data-model.md: "Derivation functions validate with isUserIdShape and throw otherwise"); alias strings "A"/"B" are rejected as uid sources (defense in depth, FR-008)
- [x] T003 Implement `userScoresKey(uid)` / `userSeenKey(uid)` with `isUserIdShape` guard in `lib/store.ts` (green for T002)
- [x] T004 [P] Write failing unit test for per-user score reads in `tests/unit/store-keys.test.ts`: `userScores(uid)` parses the flat `zrange … withScores` array `[name, score, …]` into `Record<string, number>` (same parse idiom as existing `scores()`); missing/empty zset → `{}` (fresh user, spec US1 AC3)
- [x] T005 Implement `userScores(uid)` in `lib/store.ts` reading `userScoresKey(uid)` (green for T004)
- [x] T006 Write failing unit test for the vote pipeline in `tests/unit/store-keys.test.ts` (mocked pipeline, existing `@upstash/redis` mock idiom): `recordVote` issues exactly three chained commands — `xadd namewahl:votes` (unchanged record fields winner/loser/user/at), `zincrby namewahl:scores` (global, kept per research R4), `zincrby namewahl:user:<uid>:scores` — all in ONE pipeline (data-model INV-3: one round trip, atomicity preserved)
- [x] T007 Extend `recordVote` in `lib/store.ts` to the 3-command pipeline (green for T006)
- [x] T008 Run `npm test && npx tsc --noEmit && npm run build` — all green before story work

**Checkpoint**: Per-user store ready — US1 and US2 can proceed (US2's seen-bump writer is story-local).

---

## Phase 3: User Story 1 — My votes count for the ranking I see (Priority: P1) 🎯 MVP

**Goal**: `/ranking` and `/winners` compute exclusively from the signed-in user's own vote tally; logged-out users get a login prompt (research R6); personal heading per FR-009

**Independent Test**: Sign in as X, vote Felix>Paul 3×, see Felix above Paul on `/ranking`; sign in as Y — Y's order is unaffected by X's votes (spec V1/V2)

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Write failing action-scoping tests in `tests/unit/actions-ranking.test.ts` (module-mock idiom from `tests/unit/signin-flow.test.ts`): `getRanking()` with no session → returns `null` AND issues zero Redis reads (data-model INV-1); with uid "u-test-1" → `rankNames` result built from `userScores("u-test-1")` only; `getWinners()` signed-out → `{ ok: false }`, signed-in with empty tally → `{ ok: true, winners: [] }`, signed-in with tally → names at personal rank 1 including ties
- [x] T010 [US1] Implement uid-scoped `getRanking`/`getWinners` in `app/actions.ts` per contracts.md: `getCurrentUid()` → `null` ⇒ `getRanking` returns `null`; otherwise `rankNames(COLOGNE_200_BOY_NAMES, await userScores(uid))`; `getWinners` maps rank-1 names (green for T009)

### Implementation for User Story 1

- [x] T011 [P] [US1] Update `app/ranking/page.tsx`: heading "Deine Rangliste" (FR-009); `null` result → login prompt "Melde dich an, um deine Rangliste zu sehen." instead of a list (research R6); error catch unchanged
- [x] T012 [P] [US1] Update `app/winners/page.tsx`: heading "Deine Gewinner"; `{ ok: false }` → login prompt pattern matching ranking page; `{ ok: true, winners: [] }` keeps "Noch keine Stimmen — alle Namen führen!" (now truthful per user)
- [x] T010 [US1] Run `npm test && npx tsc --noEmit && npm run build` (PPR/Suspense streaming intact) — US1 checkpoint: personal ranking fully functional, deployable/testable independently (spec V1–V3)

**Checkpoint**: User Story 1 complete — personal ranking/winners live.

---

## Phase 4: User Story 2 — Pair drafting respects each user's own frequency (Priority: P2)

**Goal**: Pair drafting weights each name by `1/(1 + seen[name])` from the user's personal seen-frequency (research R5); seen counts are written by ONE writer — a batch-time bump when a fresh batch is served (research R2/R4)

**Independent Test**: A user's pair stream favors their under-seen names; another user's stream is untouched (spec V4)

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] Write failing statistical unit tests for `pickUnderseenPair` in `tests/unit/pairing.test.ts` (10,000-draw harness idiom from feature 002): (a) unseen names are drawn measurably more often than heavily-seen names (weight `1/(1+seen)`); (b) empty/missing seen map degenerates to uniform (data-model INV-6, spec US2 AC3); (c) never returns a pair with identical members; (d) never returns `previous` in either order (INV-5); (e) exposure converges toward uniform within ±10% of the mean after sustained drafting (SC-003, feature 002 tolerance)
- [ ] T015 [US2] Implement `pickUnderseenPair(previous, seen)` in `lib/pairing.ts`: prefix-sum weighted draw with weight `1/(1 + seen[name] ?? 0)`, collision redraw, previous-repeat redraw with bounded attempts + guaranteed fallback (contracts.md); win `scores` deliberately NOT an input (R5) (green for T014)
- [ ] T016 [P] [US2] Write failing unit tests for seen-aware refill in `tests/unit/pair-queue.test.ts`: `refillReserve(reserve, seen, lastPair)` chains `pickUnderseenPair` through the batch threading both `previous` AND accumulated in-batch seen counts (a batch of 5 self-balances — contracts.md); returns new array, no mutation
- [ ] T017 [US2] Change `refillReserve` signature to `(reserve, seen, lastPair)` in `lib/pair-queue.ts` with seen-chaining (green for T016)
- [ ] T018 [P] [US2] Write failing unit tests for the seen writer in `tests/unit/store-keys.test.ts`: `bumpUserSeen(uid, names)` issues one `zincrby` per DISTINCT name against `userSeenKey(uid)` in a single pipeline (data-model INV-4, single-writer rule); bump errors are swallowed + logged, never thrown (contracts.md: availability wins)
- [ ] T019 [US2] Implement `bumpUserSeen(uid, names)` and `getScores(freshBatch?)` in `lib/store.ts` + `app/actions.ts`: `getScores()` signed-out throws (caller redirects — unchanged); signed-in returns `{ scores: userScores(uid), seen: userSeen(uid) }`; with `freshBatch` it also bumps seen for the batch's distinct names AFTER reading, errors non-fatal (green for T018)
- [ ] T020 [US2] Add `userSeen(uid)` read in `lib/store.ts` (zrange parse idiom, same as T004) if not already covered by T019
- [ ] T021 [US2] Plumb the client in `app/vote-client.tsx`: both `getScores` call sites pass the freshly drafted batch's 10 name-slots as `freshBatch` (refill-time single-writer bump, R4); refill uses `fresh.seen`; presentation, reserve dedup, and fire-and-forget submit unchanged (feature 003 contract)
- [ ] T022 [US2] Run `npm test && npx tsc --noEmit && npm run build` — US2 checkpoint: per-user drafting fully functional (spec V4)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 — Legacy and cross-identity hygiene (Priority: P3)

**Goal**: Legacy "A"/"B" votes and other users' records never enter a personal view; sequential sign-ins on one device never blend tallies (spec US3, SC-005)

**Independent Test**: Freshly migrated deployment: no personal ranking includes votes the user did not personally cast (spec V5/V6)

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [P] [US3] Write failing mixed-legacy tests in `tests/unit/ranking.test.ts`: a score map fed from `userScores` ignores alias-attributed stream entries — extend the existing 005 mixed-legacy test to assert that records with `user: "A"`/`"B"` contribute NOTHING to a personal ranking while uid-attributed records do (FR-008, SC-005)
- [ ] T024 [P] [US3] Write failing key-isolation test in `tests/unit/store-keys.test.ts`: for two distinct uids, `userScores`/`userSeen` reads touch disjoint keys (INV-2) — assert key strings differ for uid1 vs uid2 and that neither equals any legacy key (`namewahl:scores`, `namewahl:votes`, `namewahl:users`)

### Implementation for User Story 3

- [ ] T025 [US3] Verify both tests pass against the T002–T005 implementation without production-code changes (exclusion is by construction — data-model.md "legacy alias data never becomes a key component"); if either fails, fix `lib/store.ts` key derivation until green (green for T023, T024)
- [ ] T026 [US3] Run full `npm test && npx tsc --noEmit && npm run build` — US3 checkpoint: hygiene guarantees pinned

**Checkpoint**: All user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation

- [ ] T027 [P] Update `README.md`: describe per-user ranking/winners ("Deine Rangliste"), per-user seen-driven drafting, the two new Redis keys (`namewahl:user:<uid>:scores`, `namewahl:user:<uid>:seen`) and the kept-but-unread global `namewahl:scores` (data-model.md table)
- [ ] T028 Mark all completed tasks `[x]` in this file; run the full gate trio one final time; hand off `specs/006-per-user-tally/quickstart.md` V1–V6 for live validation in the user's environment (Google + Upstash creds are only available there)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — run first
- **Foundational (Phase 2)**: depends on T001 — BLOCKS all user stories
- **US1 (Phase 3)**: depends on T003+T005+T007 (per-user store reads/writes)
- **US2 (Phase 4)**: depends on T003+T005+T007; `pickUnderseenPair`/`refillReserve` (T014–T017) are pure and can start right after Phase 2, but T019–T021 need the store
- **US3 (Phase 5)**: depends on T003/T005 (key derivation) and the ranking path (T010) for the mixed-legacy assertion
- **Polish (Phase 6)**: depends on all stories

### User Story Dependencies

- **US1**: independent of US2/US3 after Phase 2 — deployable MVP alone
- **US2**: independent of US1 (different files: pairing/pair-queue/store-writer vs actions-read/pages); only shares `lib/store.ts` additions (different functions, merge-safe)
- **US3**: verification-only story; its tests pin invariants established in Phases 2–4

### Within Each User Story

Tests (red) → implementation (green) → checkpoint gates. Test tasks T00x/P pairs are strictly ordered red-before-green; [P] tasks within a phase touch different files.

### Parallel Opportunities

- T002/T004/T006 (Phase 2 test files) — sequential red→green pairs recommended, but T002+T004 can be written together
- T009 (actions tests) ∥ T011/T012 (pages) within US1
- T014 (pairing tests) ∥ T016 (pair-queue tests) ∥ T018 (store writer tests) within US2
- T023 ∥ T024 within US3
- T027 (README) parallel with everything after Phase 2

---

## Parallel Example: User Story 2

```bash
# Write all three failing test groups first (different files):
Task: "Statistical tests for pickUnderseenPair in tests/unit/pairing.test.ts"
Task: "Seen-chaining tests for refillReserve in tests/unit/pair-queue.test.ts"
Task: "bumpUserSeen pipeline tests in tests/unit/store-keys.test.ts"

# Then implement in dependency order:
Task: "pickUnderseenPair in lib/pairing.ts"
Task: "refillReserve signature change in lib/pair-queue.ts"
Task: "bumpUserSeen + getScores(freshBatch) in lib/store.ts + app/actions.ts"
Task: "Client plumbing in app/vote-client.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001) + Phase 2 (T002–T008)
2. Complete Phase 3 (T009–T013)
3. **STOP and VALIDATE**: deploy → V1–V3 of quickstart.md (personal ranking, immediate reflection, zero-vote/logged-out states)
4. MVP delivers the core request: votes counted per-user for the ranking

### Incremental Delivery

1. MVP (US1) → validate → deploy
2. Add US2 → per-user drafting live → validate V4
3. Add US3 → hygiene pinned → validate V5/V6
4. Each story deploys independently without breaking the previous

### Notes

- Vote pipeline stays ONE round trip (3 commands) — do not add round trips
- Seen-frequency has exactly ONE writer (batch-time bump) — do not add vote-time seen increments (research R4 decision)
- `nextPair` and the global zset are retained but no longer drive any production read path — do not delete (tests pin their contracts)
- Commit after each task or logical red→green pair
