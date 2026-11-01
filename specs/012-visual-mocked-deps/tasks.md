# Tasks: Self-Contained Visual Suite — No External Credentials

**Input**: Design documents from `/specs/012-visual-mocked-deps/`

**Prerequisites**: plan.md (required), spec.md (required for user
stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included — the feature spec (via the
constitution, plan.md Phase 0) requires test-first per new behavior
(Principle III): one focused test per new behavior, written red first.

**Organization**: Tasks are grouped by user story so each story can be
implemented and tested independently. Story coupling note: US1's full
signed-in validation uses US2's local sign-in mechanism — US1's own
checkpoint validates what is independently testable (credential-free
boot + store mock); final signed-in validation happens in US2/US3
checkpoints.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2,
  US3)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js project: `app/`, `lib/` (production), `tests/unit/`,
`tests/integration/`, `tests/visual/` (dev-only suite), `specs/012-
visual-mocked-deps/` (this feature's docs). Per plan.md Constitution
check: the production additions are strictly dev-only and additive.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and environment groundwork

- [X] T001 Convert `.env.visual` into the committed template (contract C1.2, research R5): contents exactly `PORT=3111`, `VISUAL_MOCK_EXTERNAL=1`, `APPROVED_EMAILS=visual-suite@nameapp.invalid`, `SESSION_SECRET=<≥32-byte suite-local value>` plus comment rows documenting the dummy store pair (`https://mock.invalid` / `mock-token`) and the two suite identity facts (`.invalid` email, fixed first name "Visueller Tester") from data-model.md "Suite test identity"; remove all real-credential rows (`UPSTASH_REDIS_REST_URL/TOKEN`, `GOOGLE_CLIENT_ID`, `VISUAL_TEST_EMAIL`, `VISUAL_TEST_PASSWORD`); modify `.gitignore` to add `!.env.visual` after the `.env*` block so the template is tracked while the file stays env-class
- [X] T002 [P] Update the visual-suite section of `.env.example` (and the suite instructions in README.md's run section if present) to point suite users at the committed `.env.visual` template — no credentials and no sign-in identity are needed (quickstart.md A)

**Checkpoint**: repo is configuration-ready; nothing in `app/` or `lib/`
changed yet ✅ (T001/T002 done)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The in-memory store mock and its server wiring — blocking for
every user story (storage underlies votes, tallies, users everywhere)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Write failing unit test for the in-memory fake store in `tests/unit/fake-store.test.ts` FIRST (Constitution III, research R6): each test drives a real `@upstash/redis` `Redis` client constructed over the fake `Requester` (custom-Requester pattern, research R1) and asserts the exact wire shapes — pipeline request `{path:["pipeline"], body:[[commands...]]}` and per-command `{result, error}` array results; the 9 verbs: `xadd` appends `{id, fields}` and returns a usable id string, `zincrby` creates-then-increments members in `Map<string, Map<string, number>>`, `zrange 0 -1 withscores` returns the flat `[member, score, …]` array, `hget` returns stored string or null, `hset` returns 1, `hgetall` returns the flat `[field, value, …]` array and `[]` for a missing key, `incr` initializes at 0 then +1 returning the number, `scan(cursor, {match, count})` returns `["0", <matching keys>]` in one hop, `del` removes and returns the count; unknown verb throws an error whose message names the verb. Test must fail (module does not exist) before T004
- [X] T004 [P] Implement the in-memory fake store in `app/fake-store.ts` per data-model.md "In-memory fake store" + research R6: exported `createFakeRequester()` returning a typed SDK `Requester` whose internal state is `zsets`/`hashes`/`streams`/`counters` Maps keyed by FULL key strings (prefix included); exported `installFakeStore()` that constructs `new Redis({ client: createFakeRequester(), { readYourWrites: false } })`-equivalent wiring and calls the existing `lib/store.ts` `_setClientForTests()` (+ same seam treatment for `lib/user-store.ts` if its `UserStoreBackend` needs the shared client — it does: `findUserById` reads `hgetall`) — strict TypeScript, no `any`, unknown verb → throw; state created empty, never persisted
- [X] T005 Create `app/instrumentation.ts` per research R1 and the pinned-version doc `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`: export `async function register()` that (a) returns immediately when `process.env.NEXT_RUNTIME !== "nodejs"`, (b) returns immediately when `process.env.VISUAL_MOCK_EXTERNAL !== "1"`, (c) else dynamically imports the side-effect initializer from T004 (the documented `await import(...)`-inside-register pattern) so store commands execute in-process before the first request; file exists for both modes but is inert without the marker (SC-006)
- [X] T006 Gate check: `npm test` (existing 141 + the new fake-store tests all green), `npx tsc --noEmit`, and `npm run build` all pass with zero type/lint errors; `npm run build` output confirms the app builds byte-identically in behavior (no marker set during build)

**Checkpoint**: Foundation ready — store commands executed by the app in any process can be backed by the fake; user stories can proceed (US1 wires the suite to use this mode) ✅ (154 tests green, tsc clean, build exit 0; pipeline wire shape verified: single command `{body:["verb",…]}`, pipeline `{path:["pipeline"], body:[[…]]}` → plain `{result,error}` array)

---

## Phase 3: User Story 1 — Run the visual suite with zero credentials (Priority: P1) 🎯 MVP

**Goal**: `npm run visual` boots the full suite (dev server + all
scenarios) on a fresh checkout with no `.env`-style credentials of any
kind, all data living in the per-run in-process store.

**Independent Test**: On a checkout without any secret files, run
`npm run visual` through the signed-out portions: suite boots its dev
server with `VISUAL_MOCK_EXTERNAL=1`, the logged-out smoke scenario
(C2.4 logged-out `/`) passes, and no setup error names a credential.
(Full signed-in validation lands with US2 — the shared server and
store are this story's deliverable.)

### Implementation for User Story 1

- [ ] T007 [P] [US1] Rewrite `tests/visual/seed.ts` into the suite env loader (research R3/R5): drop the `@upstash/redis` client and `resetTestStore()` SCAN+DEL entirely; export `loadSuiteEnv()` with the same fail-fast `[visual-setup]` semantics as the removed `loadVisualEnv` — require ONLY `PORT` (default 3111), `VISUAL_MOCK_EXTERNAL=1` (missing → C3.2 setup error explicitly naming `VISUAL_MOCK_EXTERNAL` as "must be 1 for the visual suite"), `APPROVED_EMAILS` and `SESSION_SECRET` (≥32 bytes, keep the existing check); export the `buildServerEnv()` helper producing the dev-server child env: everything above + `VISUAL_MOCK_EXTERNAL=1` + `STORE_KEY_PREFIX=namewahl-visual-test` (constant) + dummy `UPSTASH_REDIS_REST_URL=https://mock.invalid` and `UPSTASH_REDIS_REST_TOKEN=mock-token` (never contacted — C6.2)
- [ ] T008 [US1] Update `tests/visual/harness.ts` setup half: replace `loadVisualEnv` usage with `loadSuiteEnv` + `buildServerEnv` from seed.ts (keep the `VisualEnv`-shaped runtime contract consumed by `runtime.ts` intact), boot the dev server with the child env from T007 (spawn env sets every key explicitly — Next env precedence override, research R5), keep port-occupied and server-not-ready errors and all measure/settle/screenshot code byte-identical (C3.1/C2.x preserved, FR-005)
- [ ] T009 [US1] Update `tests/visual/global-setup.ts` + `global-teardown.ts`: remove the `resetTestStore()` call (per-run reset = dev-server process lifecycle, research R3); keep server boot + teardown shutdown as-is
- [ ] T010 [US1] Checkpoint: `npm run visual` executes; the logged-out smoke scenario (`tests/visual/smoke.spec.ts`) passes; NO scenario requiring sign-in is validated yet (they will fail setup at US2's fix point — acceptable mid-flight); `npm test`, `npx tsc --noEmit`, `npm run build` green (C4.3); `git grep -i upstash tests/visual` shows no real-credential references

**Checkpoint**: the suite boots credential-free; storage is the in-process fake (US2 supplies the signed-in state the vote-screen scenarios need)

---

## Phase 4: User Story 2 — Sign-in is exercised without Google (Priority: P2)

**Goal**: The suite's sign-in step issues a REAL app-format session for
the fixed suite identity through one localhost POST — the app's real
sign-in path minus the Google ID-token verification hop; production
sign-in unchanged.

**Independent Test**: With the suite server running in mock mode,
`POST /internal/visual-signin` returns 200 + `Set-Cookie`; loading `/`
with that cookie renders the signed-in vote screen (name buttons
visible), and subsequent votes land in the in-process store. On a
server WITHOUT the marker variable the same POST returns 404.

### Tests for User Story 2 ⚠️

- [ ] T011 [P] [US2] Write failing unit test for the injectable sign-in in `tests/unit/signin-mock.test.ts` FIRST (Constitution III, research R2): call `signIn(idToken, { verifiedEmail, verifiedFirstName })` — the injected dependency shape — with the suite identity and assert: returns `{ ok: true }` with a uid of `isUserIdShape` form and label "Visueller Tester" (feature 007 first-name capture), a user record is resolved via the user store seam (`UserStoreBackend` fake in the test), and the set cookie value verifies through `verifySession` with the suite `SESSION_SECRET`; also assert the non-approved identity is still rejected (`not-approved`) and that the production signature (no injection) still compiles/calls the real verifier path unchanged. Test fails before T012 (parameter does not exist)
- [ ] T012 [US2] Modify `app/actions.ts` `signIn`: add the optional second parameter — an injectable verified-identity dependency (default: the real `verifyGoogleIdToken` call, byte-identical production path, FR-004/C6.6); when injected, skip verification and feed the verified email + firstName into the UNCHANGED remainder (`assertAuthConfigured` → `isApprovedEmail` → `resolveUser` → `sealSession` → `cookies().set`) — no other logic moves; comment documents that only the suite's internal route passes the injection (US2 acceptance scenario 2)
- [ ] T013 [P] [US2] Create `app/internal/visual-signin/route.ts` (C6.3/C6.4): `POST` handler that returns `404` with a JSON body unless `process.env.VISUAL_MOCK_EXTERNAL === "1"`; with the marker, calls the T012-injected signIn variant for the fixed suite identity (constants colocated in a tiny module per plan.md structure — email `visual-suite@nameapp.invalid`, first name `Visueller Tester`) and returns `200` (the session cookie is already set by the action's real `cookies().set`); GET → 405; no parameters accepted (body ignored) per C6.3
- [ ] T014 [US2] Update `tests/visual/harness.ts`: add `localSignInAndSaveState(page context factory, env)` per C6.5 — single `fetch` POST to `{baseUrl}/internal/visual-signin` (canary: non-200 or missing `Set-Cookie` → C3.2 setup error naming the endpoint + fix, research R4), then persist the cookie as Playwright storage state at the existing `AUTH_STATE_PATH` (always overwrite — no freshness window); DELETE the Google sign-in code (`signInAndSaveState`, `tryReuseAuthState`, `authStateFresh`, `VISUAL_HEADED` handling, GIS iframe/popup logic — `requireProcessEnv` for VISUAL_* credentials goes too)
- [ ] T015 [US2] Update `tests/visual/global-setup.ts`: replace the Google step with `localSignInAndSaveState` every boot (bounded overwrite; remove the reuse-first branch)
- [ ] T016 [US2] Checkpoint: run `npm run visual` — signed-in scenarios now pass end-to-end: vote screen renders name buttons (US2-1), votes cast in scenarios are recorded and `/ranking` + `/winners` reflect them from the in-process store (US2-3), and the identity label shows the suite firstName; separately verify US2-2: start the app WITHOUT the marker (`npm run dev` on a throwaway port or `npm run build && npm start` with a throwaway `PORT`) and confirm `POST /internal/visual-signin` → 404 and the login screen still hosts the real GIS button (SC-006 partial); `npm test`, `npx tsc --noEmit`, `npm run build` green

**Checkpoint**: fully signed-in credential-free run; production path untouched (US3 completes the assertion-surface parity)

---

## Phase 5: User Story 3 — Remaining screens stay covered without external services (Priority: P3)

**Goal**: Full parity with 011's assertion surface in credential-free
mode: every C2.1–C2.7 scenario executes, failure formats are
byte-identical, screenshots are produced.

**Independent Test**: Run the WHOLE suite credential-free; confirm
every 011 contract-table scenario (C2.1–C2.7) executes green on the
unchanged layout and the full screenshot set is written per run.

### Implementation for User Story 3

- [ ] T017 [US3] Run `npm run visual` end-to-end on the untouched layout and record the result in this tasks file: all C2.1–C2.7 scenario families pass (vote-layout 320/375/430, fitting, screens incl. landscape/tablet/desktop, notice stability) with the per-profile summary printed (C3.3) — this is US3-1/US3-3's primary proof (FR-005)
- [ ] T018 [US3] Verify the notice-stability scenario in `tests/visual/screens.spec.ts` still conducts its request-interception aborts/release cycle against the mock store and produces the persistent-notice appear/dismiss cycle with box-geometry assertions unchanged (US3-2) — fix only the SUITE's own setup if anything regressed, never the assertions; record evidence in the tasks file
- [ ] T019 [US3] Verify the screenshot contract (C4.1): after a green run `tests/visual/screenshots/` contains the full expected set (vote screens per portrait profile, landscape, desktop, logged-out, /ranking, /winners, notice-visible) and every file's mtime is newer than the run start (overwrite per run); record the file list in the tasks file
- [ ] T020 [US3] Repeat ONE regression injection from 011 quickstart C (`.nameButton { flex: 1 1 auto; }` in `app/page.module.css`), run the suite, confirm the failure names guarantee + profile + numbers identically to 011 (C3.1), revert the injection, confirm green again (SC-003)

**Checkpoint**: the credential-free suite is a full replacement for the
011 run — same scenarios, same assertions, same failure formats.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Isolation proof, determinism, production invariance, docs

- [ ] T021 [P] Verify SC-001 (quickstart B1): block all external network egress and re-run `npm run visual` — suite stays green with zero egress beyond localhost; record the run and the blocking method used
- [ ] T022 [P] Verify SC-004 (quickstart B2): run `npm run visual` 10 consecutive times — all 10 exit 0 with identical per-profile summaries (suite identity re-minted deterministically each boot, research R3); investigate any flake via the settle protocol before re-counting
- [ ] T023 [P] Provoke the new setup errors (quickstart C / FR-007): (a) remove `VISUAL_MOCK_EXTERNAL` from `.env.visual` → C3.2 setup error naming the variable; (b) temporarily rename `app/internal/visual-signin/` → canary setup error naming the endpoint; (c) confirm port-occupied (unchanged 011 message) and short `SESSION_SECRET` (unchanged 011 message) still behave; revert everything, confirm green
- [ ] T024 Final production-invariance audit (SC-006 / C6.6 / FR-004): `git grep VISUAL_MOCK_EXTERNAL` shows hits ONLY in `app/instrumentation.ts`, `app/internal/visual-signin/route.ts`, `tests/visual/`, `.env.visual`, and this feature's docs; `npm run build && npm start` serves the untouched app; suites of record: `npm test`, `npx tsc --noEmit`, `npm run build` all green; `git status` confined to `app/instrumentation.ts`, `app/internal/`, `app/actions.ts` (optional param + comment), `app/fake-store.ts` location per plan (note: file lives at repo path used in T004), `tests/visual/`, `.env.visual`, `.gitignore`, `.env.example`, `specs/012-visual-mocked-deps/`
- [ ] T025 Update `specs/012-visual-mocked-deps/quickstart.md` checkboxes/notes with actual verified values (where evidence was gathered in T017–T023) and mark 011's stale credential prerequisite rows superseded in README.md (pointer only, no new prose of consequence)
- [ ] T026 FR-011 agent judgment review (011 contract C5.1 — still the completion gate): load `tests/visual/screenshots/*` as images, judge proportions/balance/coherence per 011 quickstart D, record the verdict (pass or findings) in this tasks file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Phase 1 (T003 needs nothing
  from it, but checkpoint T006 is cleaner after the env template
  exists) — BLOCKS all user stories
- **US1 (Phase 3)**: depends on Phase 2 — wires the suite boot to mock
  mode
- **US2 (Phase 4)**: depends on US1 (server boots in mock mode; the
  endpoint's canary exercises store + session chain)
- **US3 (Phase 5)**: depends on US2 (signed-in scenarios need the
  session mechanism)
- **Polish (Phase 6)**: depends on US3; T026 strictly last

### User Story Dependencies

- **US1 (P1)**: needs Phase 2 only. Its independent validation is the
  signed-out boot + smoke scenario.
- **US2 (P2)**: needs US1's server env. Delivery of signed-in state
  unblocks the vote-screen scenario set.
- **US3 (P3)**: needs US2. Validation/parity-only phase (scenario files
  are unchanged by design — FR-005).

### Within Each User Story

- Tests written FIRST and failing (T003 → T004, T011 → T012)
- Seam/module before wiring (T004 before T005; T013 before T014)
- Checkpoint tasks close each story — do not carry red gates forward

### Parallel Opportunities

- T001 + T002 (different files)
- T003 + T004 are test-first coupled (NOT parallel with each other);
  T003 is parallel with nothing in Phase 2 because it is the red gate
  — but T003 may run alongside T001/T002 leftovers
- T011 ∥ T013 (test file vs route file) after T012's shape is agreed
- T021 ∥ T022 ∥ T023 (independent validation runs, separate evidence)
- After Phase 2, US1 → US2 → US3 are a strict chain for a single
  maintainer (the suite is single-worker by design); the parallelism
  marks remain valid for multi-file authoring

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational: fake store +
   instrumentation — everything is inert without the marker)
2. Complete Phase 3 (US1): credential-free boot proven
3. **STOP and VALIDATE**: signed-out smoke green, no credential reads
   anywhere in the suite path

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 → suite runs without credentials (signed-out surface)
3. Add US2 → signed-in scenarios run through the real app session path
4. Add US3 → full 011 parity confirmed, screenshots + failure formats
5. Polish → isolation/determinism/invariance evidence + agent review

### Risk notes

- The ONLY production-file edits are `app/actions.ts` (one optional
  parameter, default unchanged) and the two new inert-unless-marked
  files (`app/instrumentation.ts`, `app/internal/visual-signin/route.ts`)
  + `app/fake-store.ts`. If any review questions 011's "zero app
  modifications" wording, cite spec 012 (FR-003/FR-004, prior approval)
  and plan.md's governance note.
- The fake store's 9-verb surface is verified by T003 against a REAL
  SDK client — never re-architect `lib/store.ts` to accommodate the
  fake (the seam goes the other way).

---

## Notes

- [P] tasks = different files, no incomplete dependencies
- [Story] label maps tasks to spec user stories (US1 = zero-credential
  run, US2 = Google-free sign-in, US3 = assertion-surface parity)
- Constitution III (test-first) is satisfied exactly twice: T003/T004
  and T011/T012 — the two new behaviors. Everything else is wiring or
  validation where 011's suite is itself the verification instrument.
- Commit after each checkpoint (T006, T010, T016, T020, and after T024)
- Avoid changing any file under `tests/visual/*.spec.ts` or
  `tests/visual/guarantees.ts` / `profiles.ts` / `runtime.ts` — their
  byte-stability IS FR-005; contact points are only the setup/auth
  wiring this feature's tasks name
