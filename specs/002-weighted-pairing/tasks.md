# Tasks: Weighted Pair Selection

**Input**: Design documents from `/specs/002-weighted-pairing/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/contracts.md ✅, quickstart.md ✅

**Tests**: Included per constitution Principle III (Proportionate Test-First): tests are written first for the new behavior and must FAIL before the implementation lands.

**Organization**: This feature has a single tightly-coupled core (weighted draw in `lib/pairing.ts`); the three user stories map to test/verification aspects rather than separate modules. US1 (weighting) is the MVP; US2 and US3 are properties of the same function, implemented and verified within its test suite. Tasks are still grouped per story so each property is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single existing Next.js app at repository root: `lib/`, `app/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing project state; nothing new to initialize.

- [X] T001 Verify baseline before changes: run `npm test` (existing 12 unit tests pass; integration tests skip without credentials) and `npm run build` (zero type errors) to establish the green baseline required by constitution Principle III (red-green only against new behavior)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No separate foundation needed — the score map flows through existing `lib/store.ts` `scores()` and the existing server action. Explicitly confirm no new infrastructure is added.

- [X] T002 Confirm no foundational changes required per specs/002-weighted-pairing/contracts/contracts.md: `lib/store.ts`, `app/actions.ts`, and Upstash keys are unchanged; document decision in the commit message (Principle V: no abstractions without need)

**Checkpoint**: Baseline green, scope confirmed — story work can begin.

---

## Phase 3: User Story 1 — Vote on meaningful matchups (Priority: P1) 🎯 MVP

**Goal**: Names with higher scores appear more often in drawn pairs (weight = score + 1, linear).

**Independent Test**: Seed scores in a test (some high, some zero), draw 10,000 pairs, verify observed appearance frequencies track the weight ratio within ±10%; manually, vote a favourite up and observe it appearing more often.

### Tests for User Story 1 (write FIRST, must FAIL before T005)

- [X] T003 [P] [US1] Write unit tests FIRST in tests/unit/pairing.test.ts for weighted selection: (a) empty/missing scores map → uniform distribution within ±10% of mean over 10,000 draws (SC-002, FR-004); (b) proportionality: seeded scores (e.g., 50/0/5) produce frequencies matching weight ratios within ±10% (SC-001, FR-002); (c) pair still returns two names as `[string, string]`; verify tests FAIL against current uniform implementation
- [X] T004 [P] [US1] Write unit test FIRST in tests/unit/pairing.test.ts for the deterministic weight math: replicate the cumulative prefix-sum draw with a seeded PRNG and assert exact expected frequencies (guards against off-by-one in prefix sums; research.md R5 item 5); verify it FAILS

### Implementation for User Story 1

- [X] T005 [US1] Implement weighted draw in lib/pairing.ts per contracts/contracts.md: extend signature to `nextPair(previousPair?, scores?)`; `weight(name) = (scores?.[name] ?? 0) + 1`; cumulative prefix-sum selection over `COLOGNE_200_BOY_NAMES` (research.md R1); missing/empty scores → uniform; keep function pure (no I/O, no module state, randomness only via `Math.random()`); make T003 and T004 pass

**Checkpoint**: Weighted selection works; existing tests still green; `npm run build` clean.

---

## Phase 4: User Story 2 — Favourites always remain reachable (Priority: P2)

**Goal**: No name's appearance chance ever reaches zero, even with extreme score skew.

**Independent Test**: One name at a very high score, all others zero — every name still appears in 10,000 drawn pairs.

### Tests for User Story 2 (write FIRST, must FAIL... verify they already pass with the T005 design or FAIL if base-weight missing)

- [X] T006 [P] [US2] Write unit tests FIRST in tests/unit/pairing.test.ts for reachability: (a) one name with score 500, all others 0 → every one of the 200 names appears at least once in 10,000 draws (SC-003, FR-003); (b) all names at equal nonzero scores → uniform within ±10% (FR-004 generalization); run against the T005 implementation — if they pass immediately, keep them as regression guards (red-green satisfied by T003/T004 for this function; note the outcome in the commit)

---

## Phase 5: User Story 3 — New votes reshape selection immediately (Priority: P3)

**Goal**: Weighting reflects the score state at draw time; fresh wins increase a name's exposure right away.

**Independent Test**: Draw pairs, change one name's score in the map, draw again — frequencies move toward the new score.

### Tests for User Story 3 (write FIRST)

- [X] T007 [P] [US3] Write unit test FIRST in tests/unit/pairing.test.ts for score-state responsiveness: same pair sequence inputs, two different score maps → frequency distributions differ in the direction of the new scores (FR-006); also assert invalidity retries still hold with skewed scores (no identical members, no immediate exact repeat — FR-005; feeds SC-005)

### Implementation for User Story 3

- [X] T008 [US3] Wire live scores into the draw in app/vote-client.tsx per contracts/contracts.md: fetch the score map once on mount (existing scores read path via server action) and refetch after each successful vote, storing it in state; pass it as the second argument to `nextPair(pair, scores)`; keep `previousPair` handling unchanged; make T007 pass end-to-end (scores used at draw time)

**Checkpoint**: All three stories functional: weighted, always-reachable, live-responsive.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T009 [P] Run full quickstart.md validation W1–W6 (specs/002-weighted-pairing/quickstart.md) and record results in the PR description
- [X] T010 Verify governance gates: `npm run build` zero type errors, `npm test` green (old 12 + new tests), no new dependencies added (Free-Plan Budget audit), diff confined to lib/pairing.ts, app/vote-client.tsx, tests/unit/pairing.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — run first
- **Foundational (Phase 2)**: after T001; trivial
- **US1 (Phase 3)**: T003/T004 (tests, parallel) → T005 (implementation)
- **US2 (Phase 4)**: after T005 (tests exercise the weighted implementation)
- **US3 (Phase 5)**: T007 after T005; T008 (client wiring) after T007 and T005
- **Polish (Phase 6)**: after all stories

### User Story Dependencies

- **US1 (P1)**: independent — core weighting
- **US2 (P2)**: property of the same function; verified after US1 implementation
- **US3 (P3)**: depends on US1's signature change; the client wiring (T008) is the only new integration work

### Parallel Opportunities

- T003 ∥ T004 (same file, but independent test cases — serialize if conflicts; both before T005)
- T006, T007 are test-only and independent of each other
- Single-developer reality (two-user toy project): sequential T001 → T010 is expected; [P] marks are informational

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline → T002 confirmation
2. T003 + T004 (red) → T005 (green)
3. **STOP and VALIDATE**: `npm test` + manual W1/W2 from quickstart.md
4. The app is already materially better — favourites rise

### Incremental Delivery

1. US1 done → weighted drill-down live (MVP)
2. Add T006 → reachability guaranteed and regression-guarded
3. Add T007 + T008 → weighting follows fresh votes without reload
4. T009/T010 → validation and gates

### Notes

- Constitution Principle III: every new behavior has a test written first; T006 may pass immediately against the correct T005 design — in that case the red-green obligation is already discharged by T003/T004 for this function, and T006 is retained as a guard (documented in the commit).
- Commit after each story checkpoint.
