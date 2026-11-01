---
description: "Task list for feature 008 implementation"
---

# Tasks: Mobile-Friendly Voting Layout

**Input**: Design documents from `/specs/008-mobile-vote-layout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-layout.md, quickstart.md

**Tests**: None new — spec confirm: no test tasks requested; plan.md Constitution Gate III/IV rules layout changes exempt from integration tests and this feature adds no pure logic. Verification = existing gates + contract C-clause manual checks in quickstart.md.

**Organization**: Tasks grouped by user story (US1 side-by-side names P1, US2 comfortable voting P2, US3 secondary screens P3). The change surface is CSS-only; US1 and the US2 touch-target work both live in `app/page.module.css` and are therefore sequenced, not parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project at repository root: `app/`, `lib/` (read-only here), `tests/` (unchanged).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification before any changes

- [X] T001 Run existing gates to record a green baseline: `npm test`, `npx tsc --noEmit`, `npm run build` — do not start other tasks until all three pass; note the exact test count for comparison later

**Checkpoint**: Baseline green — feature work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None needed — the whole feature is a styling change with no shared infrastructure, schema, or framework work. Every task below is story-scoped. (Kept as an explicit empty phase per template shape; do not add speculative scaffolding — constitution Principle V.)

**Checkpoint**: Nothing to do — proceed directly to User Story 1.

---

## Phase 3: User Story 1 - Names sit side by side on a phone-sized screen (Priority: P1) 🎯 MVP

**Goal**: On any viewport ≥320 px, the two candidate name cards render left and right of the "oder" separator on one row that never wraps, with names on a single line (shrink font first via clamp, ellipsis only as last resort) — per research R2/R3 and contract C1.

**Independent Test**: Open `/` in a 320–430 px viewport while signed in: both name cards side by side on one row for every rendered pair; vote several pairs consecutively with no stacking. (Quickstart V2.)

### Implementation for User Story 1

- [X] T002 [US1] Convert `.pairButtons` in `app/page.module.css` from wrapping to a fixed single row per research R3: replace `flex-wrap: wrap` with `flex-wrap: nowrap`, add `align-items: center`, keep `display: flex` and the existing `gap: 14px` values; card side/order stays markup-driven (left slot = `pair[0]` card) so consecutive pairs keep stable slots (FR-006, C1.1, C1.4)
- [X] T003 [US1] Make the two `.nameButton` cards flex-shrinkable in `app/page.module.css` per research R2/R3: change `max-width: 44vw` to a `flex: 1 1 auto` grow/shrink basis, replace `min-width: 150px` with `min-width: 0` (lets the card shrink below content width so ellipsis can engage), keep `max-width` removed entirely; the `.vs` separator becomes non-shrinking (`flex: 0 0 auto`) so it stays visible at every width (C1.5, C1.6)
- [X] T004 [US1] Enforce single-line names with the ordered fallback chain in `app/page.module.css` per research R2: on `.nameButton` add `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, and `font-size: clamp(17px, 4.6vw, 26px)` (replaces the fixed `font-size: 26px`); ellipsis may only trigger when even the 17px clamp floor overflows (FR-002, FR-003, Q1, C1.2, C1.3)
- [X] T005 [US1] Verify against real data in quickstart V2: open `/` at 320 px and 375 px viewports, render pairs containing "Maximilian" and "Konstantin" (10-char longest names from `lib/names.ts` read-only), confirm no ellipsis is triggered and no row overflow (C1.3-data: shrink step alone must suffice for the current 200-name set)

**Checkpoint**: User Story 1 independently functional — sign in at phone width, see side-by-side pairs, vote through several pairs without stacking or scrolling (quickstart V2).

---

## Phase 4: User Story 2 - Voting on a phone is comfortable and accurate (Priority: P2)

**Goal**: Touch targets ≥44 × 44 px on every tappable element of the vote screen, pair fully in view, and no layout jump between consecutive pairs of different name lengths — per research R4 and contract C2 (Q2-floors), plus the Q3 squeeze-to-fit long-pair fallback (already produced by T003's flex behavior; verified here).

**Independent Test**: On a phone-size viewport, cast several votes in a row, tap dismiss/sign-out buttons first-try, and confirm no pair requires scrolling (quickstart V3).
> Sequencing note: this phase touches the same file as US1 (`app/page.module.css`) — do them in order, not in parallel.

### Implementation for User Story 2

- [X] T006 [US2] Raise small utility buttons to the 44 px touch floor in `app/page.module.css` per research R4: add `min-height: 44px` (and `padding: 6px 14px` → at least that) to `.noticeDismiss`, and add `min-height: 44px` to `.signOut` (currently ~27 px tall with 4px 12px padding) — cards already exceed 44 px via their 22px/26px padding + clamp'd font (Q2, C2.1, C2.2)
- [X] T007 [US2] Verify no-jump stability against contract C1.4/C1.5 and FR-006 with squeeze-to-fit (Q3): in a 320 px viewport, vote through a consecutive sequence mixing short and long names and check the row stays scroll-free and fixed (the flex from T003 is the mechanism; this task is the acceptance check + any minimal additional CSS guard in `app/page.module.css` if a jump or overflow is observed, e.g. fixed `min-height` on `.pairButtons` to stop row-height reflow)

**Checkpoint**: User Stories 1 AND 2 both work — side-by-side layout with first-tap reliability and no scroll/jump at 320 px (quickstart V2–V3).

---

## Phase 5: User Story 3 - The rest of the app holds up on a phone (Priority: P3)

**Goal**: Login, ranking, winners screens are usable at ≥320 px with no horizontal scrolling and tappable elements — per research R5 and contract C3.

**Independent Test**: Open `/` logged-out, `/ranking`, and `/winners` at 320 px: all content visible and tappable, no horizontal scrolling (quickstart V4).

### Implementation for User Story 3

- [X] T008 [P] [US3] Audit/adjust `app/page.module.css` login-screen styles at 320 px per research R5: `.loginError` currently has `max-width: 320px` — add left/right page padding so it never touches the viewport edge; check `.userButtons` and sign-in affordance fit within 320 px (C3.1, C3.3)
- [X] T009 [P] [US3] Audit/adjust `app/ranking/page.module.css` rows at 320 px per research R5: rank + name + score must all be visible without wrap or clipping (C3.2); verify against `lib/names.ts` longest-name rendering and fix only if overflow is observed
- [X] T010 [P] [US3] Audit/adjust `app/winners/page.module.css` rows at 320 px per research R5: same containment guarantee as ranking (C3.2); verify against `lib/names.ts` longest-name rendering and fix only if overflow is observed
- [X] T011 [US3] Verify viewport/zoom defaults per research R5 and contract C3.4: confirm the deployed page contains the default `width=device-width, initial-scale=1` viewport meta with no `user-scalable=no`/`maximum-scale=1` additions (Next.js injects it automatically; do NOT add a custom `viewport` export — proceeding R5 decision) and confirm pinch-zoom works on `/` at phone width

**Checkpoint**: All user stories independently functional — vote, login, ranking, winners all phone-usable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and delivery artifacts

- [X] T012 Re-run all three gates and confirm zero drift: `npm test` count matches the T001 baseline exactly (no test added/removed/broken), `npx tsc --noEmit` clean, `npm run build` clean (FR-008: no behavior change)
- [X] T013 Sanity-check accessible names/ARIA per contract C4.2: `.nameButton` buttons still carry the name text as their accessible name; `.noticeText` keeps `role="alert"`; no ARIA or markup changed anywhere (C4.1)
- [X] T014 Run the complete quickstart.md validation (V1–V5), including the optional V2 artificial-long-name future-proofing check (temp add a >25-char name to `COLOGNE_200_BOY_NAMES` locally, verify shrink-then-ellipsis chain, revert) and the real-device SC-005 qualitative pass with both users
- [X] T015 Deploy to Vercel preview and re-verify V2/V4 spot checks on the actual deployment before merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — establishes green baseline
- **Foundational (Phase 2)**: none — skipped for this CSS-only feature
- **US1 (Phase 3)**: T002→T003→T004→T005 sequential (all same file, each builds on the prior)
- **US2 (Phase 4)**: T006, T007 after US1 (same file; T007 validates the mechanism T003 introduced)
- **US3 (Phase 5)**: T008–T010 different files, parallelizable after US1 (they share central layout assumptions); T011 after any audit fixes
- **Polish (Phase 6)**: after all user stories, before merge

### User Story Dependencies

- **US1 (P1)**: blocks US2 and US3 (same stylesheet defines their baselines)
- **US2 (P2)**: depends on US1 file changes
- **US3 (P3)**: depends on US1 pattern decisions (clamp/ellipsis conventions), otherwise independent screens

### Parallel Opportunities

- Only T008/T009/T010 [P] in this feature — three distinct CSS modules
- Everything else is single-file sequential by design (CSS-only surface)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline → T002–T005 (side-by-side no-wrap pair row)
2. **STOP and VALIDATE**: quickstart V2 at 320 px
3. Ship preview if ready — this alone fixes the reported bug

### Incremental Delivery

1. MVP (US1) → 2. US2 touch floors + stability checks → 3. US3 secondary screens → 4. Polish gates + quickstart full pass → merge

---

## Notes

- Every task above follows the checklist format `- [ ] TXXX [P?] [US?] description with path`
- [Story] labels: US1 = Phase 3, US2 = Phase 4, US3 = Phase 5; Setup/Polish phases intentionally unlabeled
- Test tasks: deliberately none — spec confirms no test request; constitution Principle III/IV exempt styling; correctness rests on quickstart V1–V5 and the existing untouched suite
- Q1/Q2/Q3 clarified decisions are baked into task descriptions (clamp-then-ellipsis, 44 × 44 px floors, squeeze-to-fit) — do not re-litigate at implementation time
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
