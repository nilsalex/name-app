# Tasks: Instant Vote Feedback

**Input**: Design documents from `/specs/003-instant-vote-feedback/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per constitution Principle III (proportionate test-first): one focused unit test suite per new pure module, written before the implementation. No integration tests (no new critical server paths — Principle IV).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project Next.js layout (per plan.md): `lib/` for pure modules, `app/` for client/server components, `tests/unit/` for unit tests.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify baseline before any changes

- [x] T001 Verify baseline: run `npm test` (20/20 pass) and `npx tsc --noEmit` (clean) on the unmodified tree; record results as the reference point for the constitution's test-first gate

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm shared surfaces are unchanged and ready — no new foundational modules; this feature reuses `nextPair`, `getScores`, `submitVote` as-is

- [x] T002 Confirm no foundational changes are required: verify `lib/pairing.ts` exports `nextPair(previousPair?, scores?)` unchanged, `app/actions.ts` exports `submitVote` and `getScores` unchanged, and Upstash keys/pipeline are untouched (per contracts/contracts.md "Unchanged server surface"); document confirmation in the commit message

**Checkpoint**: Foundation verified — user story implementation can begin

---

## Phase 3: User Story 1 - Tap a name, next pair appears instantly (Priority: P1) 🎯 MVP

**Goal**: Tapping a name swaps in the next pair immediately from a prepared reserve while the vote dispatches asynchronously in the background.

**Independent Test**: Tap through 20+ pairs rapidly; every transition is instant (no spinner/disabled/blank), votes still reach the server (verify via /ranking), and no pair ever repeats the currently shown pair.

### Tests for User Story 1 (test-first per Principle III) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (red), then pass after (green)**

- [x] T003 [P] [US1] Write unit tests FIRST for the pair reserve in tests/unit/pair-queue.test.ts per contracts/contracts.md invariants: (a) refillReserve appends up to BATCH_SIZE=5 pairs and chains lastPair so no consecutive exact repeat across the batch boundary; (b) takePair never returns a pair equal (either order) to currentPair and discards stale pairs; (c) takePair on empty/exhausted reserve returns { pair: undefined, reserve: [] }; (d) refillReserve with scores === undefined produces distinct-member pairs (uniform fallback preserved); (e) needsRefill is true when length < REFILL_THRESHOLD=2; (f) inputs are never mutated; run to confirm they fail (module does not exist yet)
- [x] T004 [P] [US2] Write unit tests FIRST for the vote sender in tests/unit/vote-sender.test.ts per contracts/contracts.md invariants: (a) send called exactly once for a first-attempt success; (b) a vote that rejects twice then resolves is dispatched 3 times, ends "sent", never re-dispatched (at-most-once); (c) a vote that rejects until retryWindowMs elapses ends "failed" and onFailed(1) fires exactly once with no further send attempts; (d) multiple votes retry independently; (e) pendingCount reflects unsent/unfailed votes; use an injectable fake send + fake timers (no real waits); run to confirm they fail (module does not exist yet)

### Implementation for User Story 1

- [x] T005 [P] [US1] Implement lib/pair-queue.ts exactly per contracts/contracts.md: export BATCH_SIZE=5, REFILL_THRESHOLD=2, refillReserve(reserve, scores, lastPair), takePair(reserve, currentPair), needsRefill(reserve); pure functions, no input mutation, chaining lastPair through the batch into nextPair; make T003 pass
- [x] T006 [P] [US2] Implement lib/vote-sender.ts exactly per contracts/contracts.md: createVoteSender({ send, retryWindowMs=180_000, retryDelayMs=5_000, onFailed }) returning { cast, pendingCount }; fire-and-forget dispatch on cast; bounded retry until window expiry; terminal "sent" state never re-dispatched (at-most-once); onFailed fires once per failed vote; make T004 pass
- [x] T007 [US1] Rewire app/vote-client.tsx per contracts/contracts.md component behaviour contract: hold PairReserve + scores in state; on mount fetch scores, refill reserve, show first pair (keep Math.random-off-prerender pattern — pairs only generated inside effects); on tap synchronously setPair from takePair() then cast() the vote via createVoteSender (presentation never awaits); after each tap if needsRefill() fetch fresh scores off the presentation path and refillReserve; when reserve is exhausted render the existing aria-busy pair area (taps disabled); remove the old blocking useTransition submit path (depends on T005, T006)

**Checkpoint**: User Story 1 fully functional — voting feels instant; run `npm test`, `npx tsc --noEmit`, `npm run build`

---

## Phase 4: User Story 2 - Steady supply of fresh pairs (Priority: P2)

**Goal**: The reserve is refilled just-in-time with fresh scores so sessions never stall and weighting follows recent votes.

**Independent Test**: Vote through 20+ pairs rapidly with network throttled; no transition waits on fresh material, and heavily-voted names dominate later pairs of the same session.

### Implementation for User Story 2

> NOTE: The reserve mechanics and their tests (T003/T005) and the client wiring (T007) carry most of US2; this phase adds the tuning, thresholds, and refill scheduling guarantees.

- [x] T008 [US2] Add a just-in-time refill unit test to tests/unit/pair-queue.test.ts: after takePair drains the reserve to length < REFILL_THRESHOLD, needsRefill returns true and refillReserve restores length to BATCH_SIZE with pairs drawn from the passed (fresh) score map — asserting fresh scores actually influence the new batch (verify a skewed map changes the drawn distribution within the batch); write the test first against the existing T005 module — if it passes immediately, keep it as a regression guard and note that in the commit (red-green already discharged by T003 for this module)
- [x] T009 [US2] Verify just-in-time scheduling in app/vote-client.tsx: confirm refill is triggered exactly when reserve length drops below REFILL_THRESHOLD (not per vote, not on a timer), score fetch failures leave the stale reserve usable (catch-and-continue), and in-flight refill is deduplicated (no concurrent double refill); adjust implementation only if the audit finds gaps (depends on T007)

**Checkpoint**: User Stories 1 AND 2 complete — instant transitions AND a steady, weighting-aware supply of pairs

---

## Phase 5: User Story 3 - Weighting stays truthful while feeling instant (Priority: P3)

**Goal**: Correctness guard: failures are honestly reported after bounded retries, votes are recorded at most once, and validity rules survive the reserve.

**Independent Test**: Block the network and vote: pairs keep appearing, no error during the retry window, and after the window a persistent "N Stimmen wurden nicht gezählt" notice appears (dismissable); ranking reflects each vote exactly once.

### Implementation for User Story 3

> NOTE: At-most-once and bounded-retry semantics plus their tests (T004/T006) carry most of US3; this phase adds the notice UI and the display-time validity guard.

- [x] T010 [US3] Add the persistent failure notice to app/vote-client.tsx: wire createVoteSender's onFailed to a dismissable notice ("{N} Stimmen wurden nicht gezählt") rendered below the pair area with a dismiss button that clears the accumulated count; no error indication during the retry window (clarified Q4) — the notice is the ONLY failure surface; add styles for notice + dismiss in app/page.module.css (depends on T007)
- [x] T011 [US3] Add a display-time validity guard test to tests/unit/pair-queue.test.ts (write FIRST, expect red only if T005 lacks the guard): takePair with a reserve whose first pair exactly equals currentPair (either order) skips it and returns the next valid pair, discarding the stale one; if this passes against T005 as designed, keep as regression guard and note in the commit (depends on T005)
- [x] T012 [US3] Verify end-to-end correctness in app/vote-client.tsx: the currently displayed pair is always passed as currentPair to takePair, and the last displayed pair is passed as lastPair when refilling so generation-time chaining holds across batches; confirm a vote is cast with exactly the pair's two names (winner = tapped, loser = other) (depends on T007, T011)

**Checkpoint**: All user stories complete — instant, honest, and correct

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and governance gates

- [x] T013 Run quickstart.md validation V1–V6 (specs/003-instant-vote-feedback/quickstart.md) and record results in the commit message (V4/V5 partially via the deterministic unit tests)
- [x] T014 Verify governance gates: `npm run build` zero type errors, `npm test` green (existing 20 + new pair-queue/vote-sender suites), no new dependencies added (Free-Plan Budget audit per research.md R6: score reads reduced vs feature 002), diff confined to lib/pair-queue.ts, lib/vote-sender.ts, app/vote-client.tsx, app/page.module.css, tests/unit/pair-queue.test.ts, tests/unit/vote-sender.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — run first
- **Foundational (Phase 2)**: depends on T001 — quick confirmation only
- **US1 (Phase 3)**: depends on Phase 2 — T003/T004 tests first (parallel), then T005/T006 implementations (parallel), then T007 wiring
- **US2 (Phase 4)**: depends on US1's T005/T007 (reserve + wiring exist)
- **US3 (Phase 5)**: depends on US1's T005/T007 (sender + wiring exist); T011 also depends on T005
- **Polish (Phase 6)**: depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: foundational only — fully independent
- **US2 (P2)**: builds on US1's reserve and wiring; independently testable via T008's unit test + rapid-vote manual check
- **US3 (P3)**: builds on US1's sender and wiring; independently testable via T004/T011 unit tests + network-throttled manual check

### Within Each User Story

- Tests written FIRST and confirmed red (except where a test passes immediately against the correct design — keep as regression guard and note in commit, per feature 002 precedent)
- Pure modules before client wiring
- Wiring before story-specific UI (notice) and audits

### Parallel Opportunities

- T003 ∥ T004 (test files for different modules)
- T005 ∥ T006 (different modules, both after their tests)
- US2 and US3 phases are independent of each other once US1 lands (T008/T009 ∥ T010/T011/T012 at the file level except vote-client.tsx tasks T009/T010/T012 — sequence those)

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel, different files):
Task: "T003 pair-queue tests in tests/unit/pair-queue.test.ts"
Task: "T004 vote-sender tests in tests/unit/vote-sender.test.ts"

# Implementations (parallel, different files):
Task: "T005 lib/pair-queue.ts"
Task: "T006 lib/vote-sender.ts"

# Then sequential wiring:
Task: "T007 app/vote-client.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 → T002 (baseline + confirmation)
2. T003 + T004 (tests, red) → T005 + T006 (implementations, green) → T007 (wiring)
3. **STOP and VALIDATE**: tap through pairs; instant transitions; votes recorded
4. MVP delivers the core "instant" feel

### Incremental Delivery

1. US1 → validate → the app already feels instant
2. US2 → validate → sessions never stall, weighting stays fresh
3. US3 → validate → failure honesty and at-most-once
4. T013/T014 → gates and validation

### Single-Developer Reality

Two-user toy project: sequential T001 → T014 is expected; [P] marks are informational.

---

## Notes

- Tests are REQUIRED by constitution Principle III (proportionate test-first), not optional
- No integration tests: no new critical server paths (Principle IV)
- Keep `nextPair`, `submitVote`, `getScores`, and both Upstash keys untouched
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
