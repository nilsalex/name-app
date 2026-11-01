---

description: "Task list for feature 011-playwright-visual-verification"
---

# Tasks: Playwright Visual Verification of Designs

**Input**: Design documents from `/specs/011-playwright-visual-verification/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/visual-suite.md, quickstart.md

**Tests**: This feature IS a test suite. The tasks below build the visual
suite itself; no separate unit/integration test tasks are generated (the
suite is the verification, per plan.md Constitution III/IV — the existing
`npm test` gate stays untouched). Suite correctness is validated via the
SC-003 regression-injection protocol (quickstart C) and the FR-011 agent
review (quickstart D), both embedded as explicit tasks.

**Organization**: Tasks are grouped by user story. Phases 1–2 build the
shared harness every scenario depends on; US1 lands the core vote-screen
guarantees; US2 hardens failure reporting; US3 adds the remaining
screens/states. Within the suite, files have real dependencies (harness →
guarantees → scenarios), so most tasks are sequential; `[P]` marks only
truly independent files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project (Next.js App Router app at repo root): the suite lives in
  `tests/visual/` (new), config/scripts at root (`package.json`,
  `playwright.config.ts` location per plan.md, `.gitignore`). Zero changes
  to `app/` or `lib/` (temporary SC-003 injections excepted, reverted).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling skeleton so scenario work can begin

- [X] T001 Add `playwright` test tooling: install `@playwright/test` as devDependency and run `npx playwright install chromium`; verify `npx playwright --version` works (research R1)
- [X] T002 Create `.env.visual` (gitignored) per contract C1.2: `PORT=3111`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STORE_KEY_PREFIX=namewahl-visual-test`, `GOOGLE_CLIENT_ID`, `APPROVED_EMAILS` (containing the test identity), `SESSION_SECRET`, `VISUAL_TEST_EMAIL`, `VISUAL_TEST_PASSWORD`; add `.env.visual` and `tests/visual/screenshots/` to `.gitignore`
- [X] T003 Create `tests/visual/playwright.config.ts` (research R1/R6): testDir `tests/visual`, fullyParallel, retries 0, reporter list, single shared worker (storage-state reuse per research R2), screenshot output dir configured; excluded from `npm test` (verify `npm test` still runs exactly the 141 existing tests)
- [X] T004 [P] Add `"visual": "playwright test --config tests/visual/playwright.config.ts"` script to `package.json` (contract C1.1) and confirm `npx tsc --noEmit` still passes with the new dependency types in scope (research R6)

**Checkpoint**: `npm run visual` runs (empty suite passes), tsc green, `npm test` unchanged.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Harness, profiles, store seeding, and sign-in — everything every scenario needs

**⚠️ CRITICAL**: No scenario work can begin until this phase is complete

- [X] T005 Create `tests/visual/profiles.ts`: named viewport profile constants exactly per data-model.md (PHONE_320 = 320×568, PHONE_375 = 375×667, PHONE_430 = 430×932, LANDSCAPE_740 = 740×360, TABLET_640, TABLET_768, DESKTOP_1280) and `GEOMETRY_TOLERANCE_PX = 1` (spec Q5); export a typed `Profile` interface
- [X] T006 Create `tests/visual/seed.ts`: pre-run reset of the test namespace — Redis SCAN over `namewahl-visual-test:*` + DEL (research R3), fail-fast with a setup-error message when the store is unreachable (contract C3.2); expose `resetTestStore()` used by a global-setup project
- [X] T007 Create `tests/visual/harness.ts`: helpers to (a) boot/attach the dev server on the `.env.visual` port (contract C1.3, fail fast when the port is occupied), (b) perform the real Google sign-in once per run using `VISUAL_TEST_EMAIL`/`VISUAL_TEST_PASSWORD` via the GIS popup flow, headed fallback per research R2, and save the sealed session as Playwright storage state, (c) `settle(page)` implementing the research R4 protocol (`document.fonts.ready` → two rAFs → re-read stability within `GEOMETRY_TOLERANCE_PX`), and (d) `measure(page)` returning the typed Measurement set from data-model.md (box rects, row rect, separator rect, name line count via `Range.getClientRects()`, ellipsis state via scrollWidth>clientWidth, computed font sizes, document scrollWidth, sibling overlap check) — all reads inside one `page.evaluate()`
- [X] T008 Wire global setup in `tests/visual/playwright.config.ts`: globalSetup runs `resetTestStore()` before the suite (research R3); a green `npm run visual` with a trivial smoke scenario (load `/` logged out at PHONE_320, assert HTTP 200 and settle works) proves the foundation

**Checkpoint**: Foundation ready — sign-in works, measurements flow, store resets.

---

## Phase 3: User Story 1 - The accumulated layout guarantees are verified automatically (Priority: P1) 🎯 MVP

**Goal**: `npm run visual` asserts the 008–010 vote-screen guarantees at
the three portrait profiles: side-by-side unwrapped pair with separator,
static equal maximal halves (≤1 px drift), fitting chain (one line, no
ellipsis, dominant type).

**Independent Test**: Run the suite on an unchanged layout — green; apply
one SC-003 injection (e.g., `max-width: 44vw`) — the run fails naming the
violated guarantee and profile.

### Implementation for User Story 1

- [X] T009 [US1] Create `tests/visual/guarantees.ts`: typed assertion functions over Measurements, one per guarantee family, each failure message formatted per contract C3.1 (guarantee family + profile + measured vs expected numbers): `sideBySideUnwrapped` (008: two boxes same row, `.vs` rect horizontally between them, neither stacked), `staticEqualHalves` (009/010: equal widths within 1 px; rect identity across consecutive pairs within 1 px), `maximalRow` (010: row spans viewport minus 2×24 px, no idle gap), `oneLineNoEllipsis` (FR-004), `dominantType` (name fontSize strictly greater than hint/aux/separator font sizes)
- [X] T010 [US1] Create `tests/visual/vote-layout.spec.ts`: signed-in scenarios at PHONE_320, PHONE_375, PHONE_430 asserting sideBySideUnwrapped + maximalRow + staticEqualHalves, including the pair-to-pair staticity protocol — record box rects, tap a vote (instant client-side swap), settle, re-measure, assert identity within 1 px, ≥10 consecutive pairs with deliberately varied name lengths as encountered (spec US1 scenarios 1–2)
- [X] T011 [US1] Create `tests/visual/fitting.spec.ts`: at PHONE_320/375/430 + DESKTOP_1280 assert oneLineNoEllipsis for every rendered pair name and dominantType (per FR-004; DESKTOP_1280 additionally asserts the 40 px cap engagement per 010 M1.4 — computed name font-size ≥ 39 px at desktop width)
- [ ] T012 [US1] Verify US1 end-to-end: `npm run visual` green on the untouched layout (SC-001 behavior at portrait profiles); then apply injection #1 from research R8 (`.nameButton { max-width: 44vw; }` in `app/page.module.css`), re-run, confirm maximalRow fails naming guarantee+profile+numbers, revert the injection, confirm green again (first leg of SC-003)

**Checkpoint**: US1 complete — core 008/009/010 guarantees automated and proven detectable.

---

## Phase 4: User Story 2 - Layout regressions fail loudly, not silently (Priority: P2)

**Goal**: Every failure is actionable (guarantee + profile + numbers),
setup failures are distinct and named (C3.2), and the suite is stable
(10/10 identical runs).

**Independent Test**: Inject each remaining regression; confirm each
fails with the right message; run 10× unchanged — identical results.

### Implementation for User Story 2

- [ ] T013 [US2] Complete the SC-003 injection matrix in `app/page.module.css` (one at a time, re-run, record failure message, revert): #2 `white-space: normal` on `.nameButton` → oneLineNoEllipsis fails at PHONE_320 for a long name; #3 `flex: 1 1 auto` on `.nameButton` → staticEqualHalves pair-to-pair identity fails; #4 horizontal overflow injection → no-horizontal-scroll rule fails at PHONE_320 (research R8; SC-003)
- [X] T014 [US2] Audit and sharpen failure messages in `tests/visual/guarantees.ts` + seed/server setup paths so every possible failure matches contract C3.1/C3.2 exactly (guarantee family + profile + numbers for assertions; named missing variable / occupied port / store unreachable for setup errors); deliberately provoke one setup failure (e.g., wrong `SESSION_SECRET`) to verify the C3.2 format, then restore `.env.visual`
- [ ] T015 [US2] Stability validation (SC-004): run `npm run visual` 10 consecutive times on the unchanged layout; all 10 must exit 0 with identical per-profile summaries; investigate and fix any flake via the settle protocol (research R4) before proceeding — if any run fails, fix and restart the 10-run count

**Checkpoint**: US2 complete — failures loud and precise, suite deterministic.

---

## Phase 5: User Story 3 - The whole app surface is covered, not just one screen (Priority: P3)

**Goal**: The remaining screens/states are asserted: logged-out `/`,
`/ranking`, `/winners`, landscape, desktop/tablet coherence, and the
failure-notice stability via request interception.

**Independent Test**: Run the suite; confirm scenarios visit and assert on
each named screen/state; break one (e.g., force an overlap on /ranking) →
suite catches it.

### Implementation for User Story 3

- [X] T016 [US3] Create `tests/visual/screens.spec.ts`: logged-out `/` at PHONE_320 (no horizontal scroll, no clipped text, first-tap tappable buttons ≥44×44 px hit area); signed-in `/ranking` and `/winners` at PHONE_320 after ≥1 vote (no horizontal scroll, no clipping); landscape LANDSCAPE_740 on the vote screen (vertical page scroll only — `scrollWidth == clientWidth`, pair never clipped mid-box); tablet TABLET_640/TABLET_768 and DESKTOP_1280 coherence (equal halves, one centered composition, no overflow) per FR-005/FR-006
- [X] T017 [US3] Add the notice-stability scenario to `tests/visual/screens.spec.ts`: after sign-in at PHONE_320, `page.route()`-abort the vote-request POSTs (research R5), vote until the persistent notice appears, capture box rects, unroute, vote successfully to exercise dismissal, re-capture — assert staticEqualHalves identity (≤1 px) across hidden/visible/dismissed states (FR-007, contract C2.7)
- [X] T018 [US3] Screenshot capture (contract C4.1): extend the runner/config to save full-page screenshots of the key states/profiles (vote screen at each portrait profile, landscape, desktop, logged-out, /ranking, /winners, notice-visible) into `tests/visual/screenshots/` on a green run, overwriting per run
- [ ] T019 [US3] Verify US3 end-to-end: green full run covering C2.4–C2.7; then temporarily inject a visible overlap on `/ranking` (e.g., negative margin on a ranking row in `app/ranking/page.module.css`), confirm the suite fails naming the no-overlap rule and profile, revert, confirm green

**Checkpoint**: All user stories complete — full-surface visual regression net.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final gates, runtime budget, and the agent judgment review that completes the feature

- [X] T020 [P] Runtime budget check (SC-002): time a full `npm run visual` — must complete in under 2 minutes excluding one-time bring-up; if over, reduce settle overhead or page loads before proceeding
- [X] T021 [P] Final automated gates: `npm test` (141/141), `npx tsc --noEmit`, `npm run build` all green with the suite in place; `git status` shows changes confined to `tests/visual/`, `package.json` (script + devDependency), `package-lock.json`, `.gitignore`, and this feature's spec directory — zero changes to `app/` or `lib/` (contract C4.2; all SC-003 injections reverted)
- [ ] T022 FR-011 agent judgment review (quickstart D): load the screenshots from `tests/visual/screenshots/` as images, judge proportions/balance/coherence of the enlarged pair at every profile, separator legibility, desktop coherence, and notice-state composition against the 008–010 intent; record the verdict (pass or findings with follow-ups) in this tasks file; only an agent-approved state completes the feature (contract C5.1)

**Checkpoint**: Feature complete — suite green, gates green, agent-approved.

---

## Task execution notes (2026-11-01)

**Blocking environment gap (T008/T012/T013/T015/T019/T022)**: `.env.visual`
requires real credentials that exist nowhere on this machine —
`UPSTASH_REDIS_REST_URL`/`TOKEN`, `GOOGLE_CLIENT_ID`,
`APPROVED_EMAILS`, and crucially `VISUAL_TEST_EMAIL` +
`VISUAL_TEST_PASSWORD` (a real Google sign-in, research R2). No
`.env.local` exists either. A template `.env.visual` has been created
(gitignored) with every variable named; the maintainer must fill it
before `npm run visual` can execute. All C3.2 setup-error paths
(missing file, missing variables, unreachable store) were verified
directly against the running suite.

**Execution status**: all suite CODE is authored (12 files, 19
scenarios); tsc, `npm test` (141/141), and `npm run build` are green.
Pending real credentials: T008 (first green run), T012/T013 (SC-003
injection matrix), T015 (10× stability), T019 (US3 injection), T022
(agent judgment review of actual screenshots).
(pending real credentials — see Task execution notes)

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T002 → T003 → T004 (T004 parallel-safe file-wise but logically last: needs the config to point at)
- **Foundational (Phase 2)**: T005 → T006 → T007 → T008 (profiles before harness before wiring; seed before harness uses the store)
- **User Story 1 (Phase 3)**: depends on Phase 2; T009 → T010 → T011 → T012 (guarantees module is the shared dependency of all scenarios)
- **User Story 2 (Phase 4)**: depends on US1's assertions existing (T009–T011); T013 → T014 → T015 (injections before message audit makes sense; stability run last)
- **User Story 3 (Phase 5)**: depends on Phase 2 harness; T016/T017 both extend the same file — sequential; T018 → T019
- **Polish (Phase 6)**: depends on all user stories; T022 (agent review) is strictly last — it judges the final state

### User Story Dependencies

- **User Story 1 (P1)**: independent of US2/US3 — delivers the MVP net over the core vote screen alone
- **User Story 2 (P2)**: hardens US1's guarantees; depends on T009–T011
- **User Story 3 (P3)**: independent of US1/US2 content-wise (uses only the Phase 2 harness), but sequenced last so the core net is proven first

### Within Each User Story

- guarantees → scenarios → end-to-end validation
- US2: injections → message audit → stability runs
- US3: screens → notice → screenshots → validation

### Parallel Opportunities

- T004 (package.json) can run alongside T003's config work (different files)
- T020 and T021 are independent checks ([P])
- T016 and T017 touch the same file — NOT parallel; T005/T006 are nearly independent but share the config wiring in T008
- Single-implementer reality: the suite is one coherent codebase; parallelism is limited by design (research R1 chose the runner to minimize harness code)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001–T004: tooling up
2. T005–T008: harness, sign-in, store reset, settle/measure
3. T009–T012: the core 008/009/010 net + first injection proof
4. **STOP and VALIDATE**: the suite already catches the most likely layout regressions (US1 alone is a shippable increment)

### Incremental Delivery

1. Phase 1–2 + US1 → core guarantees automated (MVP!)
2. + US2 → failures loud, suite deterministic (trustworthy)
3. + US3 → full-surface net including notice and desktop
4. + Phase 6 → budget checked, gates green, agent-approved → ship

### Notes

- Every SC-003 injection is applied, verified, and reverted inside its own task — the working tree never carries an injection between tasks (contract C4.2)
- Commit after each phase or logical group; stop at any checkpoint to validate independently
- If the real Google sign-in proves hostile to headless Chromium (research R2), the headed fallback or persistent-profile option is already sanctioned — no spec change needed
