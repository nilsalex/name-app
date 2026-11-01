# Tasks: Baby Name Voting

**Input**: Design documents from `/specs/001-baby-name-voting/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — the spec's Proportionate Test-First principle (III/IV)
requires test-first for core logic and one integration test for vote
persistence. No other test scaffolding is permitted (no coverage tooling).

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js project at repository root: `app/` (routes), `lib/` (domain
logic), `tests/` (unit + integration) — per plan.md Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, environment, and static data

- [X] T001 Install storage and tooling dependencies: `@upstash/redis` (runtime) and `tsx` (dev, for `node:test` TypeScript execution) in package.json, and add a `test` script (`node --import tsx --test tests/unit/*.test.ts tests/integration/*.test.ts`) so `npm test` works
- [X] T002 [P] Configure Upstash environment access: document `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local` usage and add a typed env reader with clear error when missing in lib/env.ts
- [X] T003 [P] Embed the Cologne 200 boy names list as a typed string array (200 unique non-empty entries) in lib/names.ts, sourced per research.md R1

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Vote persistence layer — every user story depends on it

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Write integration test FIRST for vote persistence in tests/integration/store.test.ts: recordVote appends to audit stream AND increments winner score atomically (both-or-neither per contracts/contracts.md), concurrent recordVote calls both persist (SC-004), failed writes throw and leave no partial state (FR-012); verify it FAILS before implementing
- [X] T005 Implement Upstash store in lib/store.ts per contracts/contracts.md: `recordVote(vote)` (atomic stream append + `ZINCRBY` on `scores` key), `scores()` returning `Record<string, number>`; VoteRecord shape `{ winner: string; loser: string; user: "A" | "B"; at: string }` exactly as in data-model.md; make T004 pass

**Checkpoint**: Votes can be persisted and read back — `npm test` green except story-pending tests

---

## Phase 3: User Story 1 - Vote on Name Pairs (Priority: P1) 🎯 MVP

**Goal**: A user picks their identity, sees two distinct names, taps a
favourite, and the vote is recorded with a new pair shown immediately.

**Independent Test**: Open the app, pick a user, cast several votes, confirm
each vote persists (visible in Upstash) and a fresh valid pair appears each
time — deliverable on its own.

### Tests for User Story 1 (test-first, per constitution Principle III) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] Write unit tests FIRST for pairing in tests/unit/pairing.test.ts: both members always distinct (FR-002), never identical repeat of `previousPair` (spec acceptance scenario 3), no memory beyond previousPair (clarification Q1); verify they FAIL

### Implementation for User Story 1

- [X] T007 [US1] Implement pairing in lib/pairing.ts per contracts/contracts.md: `nextPair(previousPair?)` returning `[string, string]` of distinct names from lib/names.ts, random selection, no historical tracking; make T006 pass
- [X] T008 [US1] Implement pick-your-user identification in lib/user.ts: two-option prompt ("A"/"B") persisted in browser local storage; reads per data-model.md User entity (fixed set of two, no server-side records)
- [X] T009 [US1] Implement `submitVote(winner, loser, user)` server action in app/actions.ts: validates winner ≠ loser and both ∈ lib/names.ts (data-model.md validation rules), delegates to lib/store.ts, returns error state on failure (FR-012)
- [X] T010 [US1] Build vote screen UI in app/page.tsx (replace placeholder): two large tap-friendly name buttons from `nextPair()`, immediate `submitVote` on tap, next pair via router refresh (FR-004), error message + pair unchanged on failure (FR-012, quickstart S1/S6/S7); mobile-first styling in app/page.module.css

**Checkpoint**: User Story 1 fully functional and independently testable (quickstart S1, S2 partial, S5, S6, S7)

---

## Phase 4: User Story 2 - View Name Rankings (Priority: P2)

**Goal**: All 200 names ordered by win count with shared-rank ties.

**Independent Test**: Cast a known set of votes, open `/ranking`, verify
order, scores, and 1-2-2-4 tie ranks — deliverable once US1 data exists.

### Tests for User Story 2 (test-first) ⚠️

- [X] T011 [P] [US2] Write unit tests FIRST for ranking in tests/unit/ranking.test.ts: score = win count (FR-007), equal scores share rank position with no tie-break (FR-014, 1-2-2-4 pattern), zero-vote names appear at shared bottom rank (spec acceptance scenario 2), empty input returns empty list (edge case); verify they FAIL

### Implementation for User Story 2

- [X] T012 [US2] Implement ranking in lib/ranking.ts per contracts/contracts.md: `rankNames(names, scores)` pure function returning `RankedName[]` (`{ name, score, rank }`), score descending, alphabetical within ties for stable display only (research.md R3); make T011 pass
- [X] T013 [US2] Implement `getRanking()` server action in app/actions.ts: fetches scores via lib/store.ts, returns `rankNames(lib/names.ts names, scores)`
- [X] T014 [US2] Build ranking screen in app/ranking/page.tsx: all 200 names with rank number and score, shared ranks visible, zero-vote empty state = full list at score 0 (quickstart S2/S3); styling in app/ranking/page.module.css

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - See the Winners (Priority: P3)

**Goal**: Top-ranked name(s) highlighted, including ties.

**Independent Test**: With votes producing a clear leader (then a tie),
`/winners` shows exactly the rank-1 name(s) — quickstart S4.

### Implementation for User Story 3

- [X] T015 [US3] Implement `getWinners()` server action in app/actions.ts: uses `rankNames()` from lib/ranking.ts and returns all names at rank 1 (possibly several on ties, per data-model.md Ranking rules)
- [X] T016 [US3] Build winners screen in app/winners/page.tsx: rank-1 name(s) shown prominently, explanatory empty state when zero votes exist (edge case, quickstart S4); styling in app/winners/page.module.css

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Navigation, verification, and governance gates

- [X] T017 Add navigation between Vote / Ranking / Winners in app/layout.tsx (minimal links; simplicity per Principle V)
- [X] T018 [P] Run full quickstart.md validation S1–S7 and record results in the PR description
- [X] T019 Verify governance gates: `npm run build` passes with zero type errors, `npm test` green, no dependencies beyond @upstash/redis + tsx added (Free-Plan Budget audit)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001–T002 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2; T007 depends on T006 (test-first), T009 on T005, T010 on T007–T009
- **US2 (Phase 4)**: Depends on Phase 2; T012 depends on T011 (test-first); independent of US1 implementation (uses only lib/store.ts)
- **US3 (Phase 5)**: Depends on T012 (reuses `rankNames`); smallest increment
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no cross-story dependencies
- **US2 (P2)**: Foundational only — independent of US1 (reads scores, doesn't care who wrote them)
- **US3 (P3)**: Depends on US2's `rankNames` (T012) but not on US1/US2 UI

### Within Each User Story

- Tests written first and failing before implementation
- Pure logic (lib/) before UI (app/)
- Story complete before next priority

### Parallel Opportunities

- T002, T003 (Phase 1) can run together
- T006 (US1 tests) and T011 (US2 tests) can run together after Phase 2
- T008 pairs with T007 (different files) within US1
- T015/T016 are sequential within US3 (tiny scope)

---

## Parallel Example: User Story 1 & 2

```bash
# After Phase 2, launch both stories' test-first tasks together:
Task: "Unit tests for pairing in tests/unit/pairing.test.ts"      # T006
Task: "Unit tests for ranking in tests/unit/ranking.test.ts"      # T011

# Then implement in parallel (different files):
Task: "lib/pairing.ts" (T007)   Task: "lib/ranking.ts" (T012)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (vote persistence)
3. Complete Phase 3: US1 — vote screen working end-to-end
4. **STOP and VALIDATE**: quickstart S1, S5, S6, S7 pass; the app is
   already usable for its core purpose

### Incremental Delivery

1. Setup + Foundational → votes persist
2. US1 → voting works (MVP — ship/demo-ready)
3. US2 → ranking visible
4. US3 → winners highlighted
5. Polish → navigation + full validation

### Single-Developer Strategy (this project: 2 users, 1 developer)

Run strictly in phase order T001 → T019. Total scope is deliberately small
(19 tasks) per the constitution's Simplicity-Is-Paramount principle.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing (constitution Principle III)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Do NOT add test scaffolding beyond what these tasks list (Principle III)
