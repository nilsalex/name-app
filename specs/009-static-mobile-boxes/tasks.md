---

description: "Task list for feature 009-static-mobile-boxes"
---

# Tasks: Static Mobile Pair Boxes

**Input**: Design documents from `/specs/009-static-mobile-boxes/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/static-layout.md, quickstart.md

**Tests**: No new automated tests. The spec and plan (Constitution Principles III/IV; research R6) exempt styling/layout changes from both unit and integration tests. Verification is the existing automated gates plus the manual checks defined in `quickstart.md` (V1–V7), embedded below as checkpoint tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. NOTE: this feature touches exactly one source file (`app/page.module.css`), so implementation tasks within/across stories are strictly sequential; the `[P]` marker is therefore used sparingly (only for independent verification checks).

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
dependency changes (plan.md Structure Decision; contract S3.3). There are
no foundational blocking prerequisites beyond the Phase 1 baseline gates.
No user story depends on infrastructure that does not already exist from
features 002–008.

**Checkpoint**: N/A — proceed directly to User Story 1.

---

## Phase 3: User Story 1 - Pair boxes stay put while voting (Priority: P1) 🎯 MVP

**Goal**: The two name boxes (and "oder" separator) hold pixel-identical
positions and sizes across consecutive pairs at any given viewport; only
the text inside changes.

**Independent Test**: Cast 10+ consecutive votes at a phone-size viewport
(320/375 px) and compare box rectangles pair to pair (DevTools element
overlay or screenshot) — identical every time (quickstart V2; SC-001:
zero movement).

### Implementation for User Story 1

The two edits below land **together** as one coherent change: static
halves without the re-derived padding floor would make the longest real
names ellipse at 320 px, silently breaking inherited contract 008
C1.3-data. Sequence inside one file → no `[P]`.

- [X] T002 [US1] In `app/page.module.css`, change `.nameButton` from `flex: 1 1 auto` to `flex: 1 1 0` (equal, content-independent halves; keep `min-width: 0`). Replace the existing 008 comment block on that rule with a comment referencing feature 009: static per-viewport geometry — FR-001/FR-002, contract S1.1–S1.3 (`flex-basis: 0` makes box size independent of the current pair's text). Do not touch any other declaration in the rule.
- [X] T003 [US1] In `app/page.module.css`, lower the `.nameButton` horizontal padding floor per research R3: `padding: 22px clamp(16px, 4vw, 26px)` → `padding: 22px clamp(8px, 4vw, 26px)`. Update the rule's comment: static card ≈106 px at 320 px − 2 × 8 px floor ≈ 90 px text room ≥ ≈87 px worst real name ("Maximilian"/"Konstantin") — 008 C1.3-data (ellipsis unreachable ≥320 px) preserved (contract S1.5). Vertical padding 22px and `min-height: 44px` remain unchanged.
- [X] T004 [US1] Run `npm test`, `npx tsc --noEmit`, `npm run build` — all green with zero failures/type errors (quickstart V1); confirm via `git diff --stat` that only `app/page.module.css` changed (contract S3.3 stylesheet-only guarantee)
- [ ] T005 [US1] Manual verification (quickstart V2, contract S1.1–S1.3, SC-001): sign in, open `/` at 320 px and 375 px DevTools profiles; capture both `.nameButton` box rectangles (DevTools overlay element box); cast 10+ consecutive votes seeking pairs with very different name lengths; every transition shows pixel-identical rectangles for both boxes and the separator — nothing moves, grows, shrinks, or reflows; boxes are equally wide with "oder" centered between them

**Checkpoint**: User Story 1 fully functional and independently testable — boxes never move between pairs, and inherited 008 guarantees (no wrap, no scroll, single-line names) still hold.

---

## Phase 4: User Story 2 - Tap targets are dependable (Priority: P2)

**Goal**: The whole fixed-size box is the tap target regardless of text
length, so rapid alternating left/right voting never mis-taps.

**Independent Test**: Rapidly cast alternating votes (left, right, left,
right) at phone size; session tally in `/ranking` matches the taps cast
(quickstart V4; SC-003 ≥95%).

### Implementation for User Story 2

No code tasks: US2's touch guarantees are preserved by the declarations
already present (`min-height: 44px` on `.nameButton`, `.noticeDismiss`,
`.signOut`; research R4 — static halves only make widths larger, never
smaller). The story is verified, not rewritten.

- [ ] T006 [US2] Manual verification (quickstart V4, contract S2, S1.7): at a phone-size viewport tap each name card at its corners and center with short names displayed — the whole box responds, not just the text (S2.1); vote rapidly in an alternating left/right pattern — every vote registers for the intended side; verify in `/ranking` that the tally matches the number of taps (SC-003); trigger the failure notice (airplane mode mid-session, reconnect) — it appears above/below without nudging the pair boxes (S1.7, FR-006) and its dismiss button (and "Abmelden") work first-tap (S2.2)

**Checkpoint**: User Stories 1 AND 2 both work — static boxes with dependable, full-box tap targets.

---

## Phase 5: User Story 3 - The static size choice is readable on the narrowest screen (Priority: P3)

**Goal**: The fixed boxes fit every supported name at 320 px without
clipping (ellipsis stays unreachable for real data), and geometry
re-derives once per viewport change.

**Independent Test**: Render the longest names ("Maximilian"/"Konstantin") at a 320 px profile; each fits on one line inside its fixed box, no overflow, no ellipsis (quickstart V3; SC-002).

### Implementation for User Story 3

No code tasks: the fitting machinery (font `clamp(15px, 4.6vw, 26px)` first, `text-overflow: ellipsis` last) is inherited from 008 and made sufficient by T003's floor re-derivation. The story is verified, not rewritten.

- [ ] T007 [US3] [P] Manual verification (quickstart V3, contract S1.5, SC-002): at the 320 px profile vote until "Maximilian" and "Konstantin" appear in a pair (re-sign-in and vote short pairs to cycle reserve refills if needed) — each fits on one line inside its box: no wrap, no mid-name break, no box-edge overflow, no ellipsis; optionally (revert afterwards) temporarily add a ~30-character probe name to `COLOGNE_200_BOY_NAMES` in `lib/names.ts` and confirm the last-resort chain: font shrinks to its floor first, "…" appears only if it still overflows, and the box rectangle stays identical throughout (S1.4)
- [ ] T008 [US3] [P] Manual verification (quickstart V5, contract S1.6, FR-005): rotate the device / resize the viewport 320 → 375 → 430 → desktop, and enlarge the device font setting — after each change the geometry recalibrates once and is then again pixel-static across consecutive pairs at the new size (no per-pair wobble)

**Checkpoint**: All user stories independently functional — static boxes, dependable taps, readable at the tightest width and robust to viewport/font changes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature regression guard and final gates

- [ ] T009 [P] Manual regression sweep (quickstart V6 + V7): desktop viewport shows the intact centered row (two equal cards, "oder" between — acceptably compact change, no redesign); `/ranking`, `/winners`, and logged-out `/` at 320 px show no horizontal scrolling, no clipping, first-tap-reliable buttons — identical to the post-008 state (inherited contract 008 C3)
- [X] T010 Final automated gates (quickstart V1 re-run): `npm test`, `npx tsc --noEmit`, `npm run build` all green; `git diff main --stat` shows changes confined to `app/page.module.css` (contract S3.1–S3.3: zero behavioral drift); feature ready to ship

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — establishes the green baseline
- **Foundational (Phase 2)**: empty, no gate
- **User Story 1 (Phase 3)**: T002 → T003 (same file, sequential) → T004 (gates) → T005 (verification)
- **User Story 2 (Phase 4)**: depends on T002/T003 + T005 (verifies the implemented static geometry); single verification task
- **User Story 3 (Phase 5)**: T007 and T008 depend on T002/T003 + T005, but are independent of each other (`[P]`)
- **Polish (Phase 6)**: depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: independent — contains the entire implementation of this feature
- **User Story 2 (P2)**: verification only; depends on US1's implementation landing
- **User Story 3 (P3)**: verification only; depends on US1's implementation landing (T003 in particular — the padding floor is what keeps 320 px readable); independent of US2

### Within Each User Story

- Implementation (US1 only) → automated gates → manual verification
- US2/US3 contain manual verification only

### Parallel Opportunities

- T007 and T008 (US3) can run in parallel
- T009 can run in parallel with T007/T008 (different concerns, same manual session is fine)
- Strictly sequential: T002 → T003 (same file); everything else follows the phase order

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline gates green
2. T002 + T003 land the complete CSS change (static halves + re-derived floors)
3. T004 + T005 verify and validate independently
4. **STOP and VALIDATE**: US1 alone already delivers the user-visible fix ("boxes should not move"); deploying after Phase 3 is a coherent, safe increment

### Incremental Delivery

1. Phase 3 (US1) → boxes never move (core fix) → demo/deploy
2. Phase 4 (US2) → tap reliability confirmed → demo/deploy
3. Phase 5 (US3) → 320 px readability + viewport-change robustness confirmed
4. Phase 6 → regression sweep + final gates → ship

### Parallel Team Strategy

Not applicable in practice: one file, one implementer. The `[P]` marks only loosen the verification sessions.

---

## Notes

- The implementation surface is exactly two declarations in `app/page.module.css` (plan.md Summary); every other task is verification of inherited guarantees
- Any failure at a tested width is a contract violation (`specs/009-static-mobile-boxes/contracts/static-layout.md`), not a styling preference
- If V3 fails empirically at 320 px (name clipped or ellipsized), follow quickstart.md "Done" guidance: re-measure real text width in the browser and lower the padding floor toward 4 px/side while re-running V3 — box sizes stay static in every case
- Commit after each phase or logical group; stop at any checkpoint to validate the current story independently
