---

description: "Task list for feature 010-maximal-vote-boxes"
---

# Tasks: Maximal Vote Boxes

**Input**: Design documents from `/specs/010-maximal-vote-boxes/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/maximality.md, quickstart.md

**Tests**: No new automated tests. The spec and plan (Constitution Principles III/IV; plan Summary) exempt styling/layout changes from both unit and integration tests. Verification is the existing automated gates plus the manual checks defined in `quickstart.md` (V1–V6), embedded below as checkpoint tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. NOTE: this feature touches exactly one source file (`app/page.module.css`), so implementation tasks within/across stories are strictly sequential; the `[P]` marker is used only for independent verification checks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project (Next.js App Router app at repo root): source lives in `app/`, libs in `lib/`, tests in `tests/`. This feature modifies only `app/page.module.css`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline confidence before the CSS change

- [X] T001 Verify the working tree is clean and baseline gates are green: run `npm test`, `npx tsc --noEmit`, `npm run build` — record results as the pre-change baseline (all three must pass before any edit; quickstart V1)

**Checkpoint**: Baseline green — CSS work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None for this feature — intentionally empty.

This feature is a stylesheet-only change with no markup, logic, data, or
dependency changes (plan.md Structure Decision; contract M3.4). There are
no foundational blocking prerequisites beyond the Phase 1 baseline gates;
the staticity/equality machinery this feature builds on already exists
from features 008/009.

**Checkpoint**: N/A — proceed directly to User Story 1.

---

## Phase 3: User Story 1 - Vote boxes fill the phone screen edge to edge (Priority: P1) 🎯 MVP

**Goal**: The two name boxes and the "oder" separator span the full width
available to the voting area, each box is generously taller than the touch
minimum, and the name type is visibly the dominant text on the screen.

**Independent Test**: Open the voting screen at 320/375/430 px and verify:
row touches both available edges (24 px page margin only), pair occupies
the dominant share of the visible voting region (≈104 × 86 px per box at
320 px), name type clearly larger than hint/auxiliary text (quickstart
V2; SC-001/SC-002).

### Implementation for User Story 1

The three CSS edits below land **together** as one coherent change:
each moves a different FR, and the floor retune (T003) depends on the
cap raise (T002) — shipping T002 without T003 would leave "Maximilian"
with 1 px of slack at 320 px (research R4). Sequence inside one file →
no `[P]`.

- [X] T002 [US1] In `app/page.module.css`, remove the `max-width: 44vw;` declaration from `.nameButton` (equal halves now stretch to the full available row — FR-001/SC-001, contract M1.1; the 009 staticity comment on `flex: 1 1 0` stays). Update the rule's lead comment to reference feature 010 maximality.
- [X] T003 [US1] In `app/page.module.css`, retune `.nameButton` sizing per research R3/R4: vertical padding 22px → 30px (`padding: 30px clamp(6px, 4vw, 26px)` — floor 8→6px) and `font-size: clamp(15px, 4.6vw, 26px)` → `clamp(15px, 4.6vw, 40px)` (floor and slope unchanged, cap raised). Update the comments: FR-004 dominant type (40px cap engages ≥870px); FR-003 fit no worse than 009 (at 320px: ≥87px text in 104−2×6=92px room ⇒ ≥5px slack, contract M2.1/M2.2); min-height 44px stays (M1.2).
- [X] T004 [US1] In `app/page.module.css`, raise `.vs` `font-size: 14px` → `16px` (contract M1.5: separator keeps visual weight between the enlarged cards; stays `flex: 0 0 auto`, never wraps — update its comment from "never shrinks" to note the 010 bump).
- [X] T005 [US1] Run `npm test`, `npx tsc --noEmit`, `npm run build` — all green with zero failures/type errors (quickstart V1); confirm via `git diff --stat` that only `app/page.module.css` changed (contract M3.4 stylesheet-only guarantee)
- [ ] T006 [US1] Manual verification (quickstart V2, contract M1/M2.3, SC-001/SC-002): sign in, open `/` at 320, 375 and 430 px DevTools profiles — Pass criteria: pair row spans the available edges with no idle gap (only the 24px page margin), boxes are equal halves with "oder" between, each box ≈104 × 86 px at 320 px (30px vertical padding visible), name type clearly the largest text on screen, sign-out/hint/notice all visible and untou otherwise, no horizontal scrolling, no element overlap

**Checkpoint**: User Story 1 fully functional and independently testable — boxes are maximal and dominant while staying equal static halves.

---

## Phase 4: User Story 2 - Bigger boxes change nothing else (Priority: P2)

**Goal**: Every inherited guarantee (staticity, equality, single-line
fitting, touch floors, behavior) holds unchanged at the enlarged sizes.

**Independent Test**: Cast 10+ consecutive votes at phone size with very
different name lengths; boxes pixel-static and equal across pairs, long
names fit without ellipsis, tallies match taps (quickstart V3 + V4;
SC-003/SC-004).

### Implementation for User Story 2

No code tasks: US2 is the regression guard over the enlargement; all
guarantees are inherited declarations already landed in Phase 3. The
story is verified, not rewritten.

- [ ] T007 [US2] Manual verification (quickstart V3, contract M1.3, SC-003): at 320 and 375 px cast 10+ consecutive pairs of very different name lengths — box rectangles pixel-identical from pair to pair (the cap removal did NOT reintroduce content-sizing); short names ("Paul") leave the box unchanged
- [ ] T008 [US2] [P] Manual verification (quickstart V4, contract M2, SC-004): at the 320 px profile vote until "Maximilian"/"Konstantin" appear — each fits on one line with ≥few px margin, no ellipsis, identical fit to the pre-010 build; optionally (revert after) add a ~30-char probe name to `COLOGNE_200_BOY_NAMES` in `lib/names.ts` confirming shrink-first/ellipsis-last order with the box rectangle never changing; trigger the failure notice (airplane mode, reconnect) — it appears/disappears without moving or resizing the boxes (FR-007, M3.1)

**Checkpoint**: User Stories 1 AND 2 both work — maximal boxes with all inherited guarantees intact.

---

## Phase 5: User Story 3 - The desk too keeps a workable pair (Priority: P3)

**Goal**: On desktop the enlarged presentation stays proportional and
coherent — equal boxes, 40 px capped type, legible separator, one
composition.

**Independent Test**: Open the voting screen at ≥1024 px (plus 640/768
spot checks); confirm the enlarged row reads as intentional — two equal
boxes with "oder" between, no two-islands layout, no overflow
(quickstart V5; FR-008).

### Implementation for User Story 3

No code tasks: FR-008 coherence is delivered by the same four CSS edits
(cap 40 px + `.vs` 16 px create the coherent wide-screen look; research
R5). The story is verified, not rewritten.

- [ ] T009 [US3] Manual verification (quickstart V5, contract M3.3): open `/` at ≥1024 px — names render at the 40px cap between two equal boxes with a legible "oder" between, one coherent centered composition (poster-like but intentional); spot-check 640 and 768 px profiles for graceful fluid scaling with no overflow or horizontal scrolling (M2.3)

**Checkpoint**: All user stories independently functional — maximal mobile boxes, inherited guarantees intact, coherent desktop.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature regression guard and final gates

- [ ] T010 [P] Manual regression sweep (quickstart V6): `/ranking`, `/winners`, and logged-out `/` at 320 px unchanged from the post-008/009 state (no horizontal scroll, no clipping, first-tap buttons); landscape phone (e.g. 740 × 360) behaves exactly as today (vertical page scroll only — pair itself never scrolls or clips)
- [X] T011 Final automated gates (quickstart V1 re-run): `npm test`, `npx tsc --noEmit`, `npm run build` all green; `git diff main --stat` shows changes confined to `app/page.module.css` (contract M3.4: zero behavioral drift); feature ready to ship

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — establishes the green baseline
- **Foundational (Phase 2)**: empty, no gate
- **User Story 1 (Phase 3)**: T002 → T003 → T004 (same file, sequential) → T005 (gates) → T006 (verification)
- **User Story 2 (Phase 4)**: depends on Phase 3 implementation; T007 and T008 are independent of each other (`[P]`)
- **User Story 3 (Phase 5)**: depends on Phase 3 implementation; single verification task
- **Polish (Phase 6)**: depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: independent — contains the entire implementation of this feature
- **User Story 2 (P2)**: verification only; depends on US1's implementation landing
- **User Story 3 (P3)**: verification only; depends on US1's implementation landing; independent of US2

### Within Each User Story

- Implementation (US1 only) → automated gates → manual verification
- US2/US3 contain manual verification only

### Parallel Opportunities

- T008 (US2) and T009 (US3) can run in parallel (independent concerns)
- T010 can run in parallel with T008/T009 (regression sweep, different screen set)
- Strictly sequential: T002 → T003 → T004 (same file); everything else follows the phase order

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline gates green
2. T002 + T003 + T004 land the complete CSS change (width fill + size/type growth + separator bump)
3. T005 + T006 verify and validate independently
4. **STOP and VALIDATE**: US1 alone delivers the user-visible "as large as possible" fix; deploying after Phase 3 is a coherent, safe increment

### Incremental Delivery

1. Phase 3 (US1) → maximal dominant boxes → demo/deploy
2. Phase 4 (US2) → inherited guarantees confirmed at the new sizes
3. Phase 5 (US3) → desktop coherence confirmed
4. Phase 6 → regression sweep + final gates → ship

### Parallel Team Strategy

Not applicable in practice: one file, one implementer. The `[P]` marks only loosen the verification sessions.

---

## Notes

- The implementation surface is exactly four declarations + comment updates in `app/page.module.css` (plan.md Summary); every other task is verification of inherited guarantees
- Any failure at a tested width is a contract violation (`specs/010-maximal-vote-boxes/contracts/maximality.md`), not a styling preference
- If V4 fails empirically at 320 px (ellipsis visible for a real name), follow quickstart.md "Done" guidance: re-measure real text width in the browser, then lower the padding floor (min 4 px) or drop the type cap to 36 px — maximality (V2) stays, only the cap/floor rebalance
- Commit after each phase or logical group; stop at any checkpoint to validate the current story independently
