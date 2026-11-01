description: "Task list for feature 007-show-user-first-name"
---

# Tasks: Show the User's First Name

**Input**: Design documents from `/specs/007-show-user-first-name/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/contracts.md ✅, quickstart.md ✅

**Tests**: INCLUDED — Constitution Principle III requires test-first for every new behavior (one focused test per behavior, no extra scaffolding).

**Organization**: Tasks grouped by user story from spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js App Router project at repo root: `app/`, `lib/`, `tests/unit/`, `tests/integration/` (per plan.md Project Structure).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and green baseline before any change

- [X] T001 Create branch `007-show-user-first-name` from `main` (git: checkout -b; spec dir already exists with design artifacts)
- [X] T002 [P] Verify baseline is green: `npm test` passes and `npm run build` succeeds with zero type/lint errors, before any edit (Constitution quality gates)

**Checkpoint**: Branch active, baseline green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None required — the data model change (optional `firstName` on `UserRecord`) is story-scoped and lands inside US1; no cross-story infrastructure exists. All storage keys, env variables, and contracts outside the touched module are unchanged (data-model.md "What does NOT change").

**⚠️ No user story work may add storage keys, dependencies, or env variables — none are needed (plan.md Constitution Check: Free-Plan Budget intact).**

---

## Phase 3: User Story 1 — Signed-in user sees their own first name (Priority: P1) 🎯 MVP

**Goal**: The vote screen's hint line greets the signed-in user by their verified first name instead of "Person N", via the existing `label` prop (contracts.md: `app/page.tsx` shape unchanged, value changed).

**Independent Test**: Sign in as user X in a fresh session → first name (from Google `given_name`) is displayed; sign out, sign in as Y → Y's name is shown. Automated: unit tests on derivation + label precedence, integration test on persistence (quickstart V1/V2).

### Tests for User Story 1 (write FIRST — must FAIL against unmodified code, Constitution III)

- [X] T003 [P] [US1] Write failing unit tests for first-name derivation in `tests/unit/google-verify.test.ts`: (a) tokeninfo fixture with non-empty string `given_name` → success result carries `firstName` equal to that value; (b) fixture with only `name` → `firstName` is its first whitespace-separated word; (c) fixture with neither `given_name` nor `name` → success WITHOUT `firstName`; (d) failure branches (`invalid-token`, `server-config`) → result has no `firstName` property. Follow the existing string-form fixture idiom (tokeninfo returns all fields as strings, see existing `exp`-as-string test)
- [X] T004 [P] [US1] Write failing unit tests for the label precedence in `tests/unit/user-store.test.ts`: record with non-empty `firstName` → `displayLabel` returns that name (even when `num` is present); record with `firstName` and no `num` → still the name; verify precedence name > `Person N` > `Person` (data-model.md Display label table)
- [X] T005 [P] [US1] Write failing integration test in `tests/integration/submit-auth.test.ts`: sign-in with a verified token carrying a first name persists a `UserRecord` whose `users` hash value includes `firstName`; sign-in of the SAME email again returns the existing record unchanged (stored fields win over the passed name — immutability, research R5)

### Implementation for User Story 1

- [X] T006 [US1] Implement first-name derivation in `lib/google-verify.ts`: add optional `firstName?: string` to the success branch of `GoogleVerifyResult` (failure branch untouched); derive per research R3/contracts.md — `given_name` (trimmed, non-empty) wins, else first word of `name`, else property absent; name fields never influence the ok/decision logic (depends on T003 — green the tests)
- [X] T007 [US1] Implement record changes in `lib/user-store.ts`: add `firstName?: string` to exported `UserRecord`; extend `UserStore.resolveUser` signature to `resolveUser(email: string, firstName?: string)` persisting the name ONLY in the creation branch (absent → field absent, never `""`); update `displayLabel` to the precedence table name > `Person ${num}` > `Person` (depends on T004)
- [X] T008 [US1] Forward the name through sign-in in `app/actions.ts`: in `signIn`, pass the verified `firstName` (if present) into `resolveUser`; `SignInResult.ok` branch keeps its exact shape (label flows out of `displayLabel`); failure diagnostics must NOT contain name data (FR-008 lineage). Confirm `app/page.tsx` needs no edit — it already renders `displayLabel(record)` into `VoteClient`'s existing `label` prop (depends on T005, T006, T007)
- [X] T009 [US1] Run `npm test` (all green) and `npm run build` (zero errors); manually validate quickstart V1 (fresh sign-in shows real name) and V2 (second user's sign-in switches the name)

**Checkpoint**: US1 fully functional independently — deployed, a fresh sign-in greets the user by name.

---

## Phase 4: User Story 2 — Unauthenticated visitor sees no name (Priority: P2)

**Goal**: Signed-out visitors see the login screen with no name anywhere — no stale name from a previous user of the same browser.

**Independent Test**: Open the app with no session → only the Google button, no name (quickstart V3). This is existing behavior; the task is a proportional safeguard test pinning it (Constitution III: no untested regressions when the label logic changes).

### Implementation for User Story 2

- [ ] T010 [US2] Add one regression test in `tests/integration/submit-auth.test.ts`: an unauthenticated request (`uid === null`, expired/absent cookie) resolves NO user record and reaches the login screen rather than any display-label path — assert via the existing gate/`displayLabel` seams that no name string is produced for signed-out access (must pass against current code; fix `lib/user-store.ts`/`lib/session.ts` only if it fails)
- [ ] T011 [US2] Manually validate quickstart V3: signed out in a browser that previously showed user X's name → login screen shows no name of X or anyone; sign-in path still reachable

**Checkpoint**: Signed-out state provably name-free; US1 unaffected.

---

## Phase 5: User Story 3 — Name degrades gracefully when unavailable (Priority: P3)

**Goal**: Accounts without a usable given name get the neutral "Person N"/"Person" fallback — never a blank string, raw email, or error; app stays usable (contracts.md precedence rows 2–3).

**Independent Test**: sign-in with a name-less account → fallback label, voting works normally (quickstart V4/V5). Automated: unit tests on absence semantics.

### Tests for User Story 3 (write FIRST)

- [ ] T012 [P] [US3] Write failing unit tests in `tests/unit/user-store.test.ts` for the no-name path: creating a record with `resolveUser(email)` (no name argument) leaves `firstName` absent (key absent from JSON, never `""`); record without `firstName` but with `num` → `displayLabel` returns `Person ${num}` (unchanged 005 behavior); record without either → `Person`. Also verify a derived empty/whitespace-only name (`""` after trim) results in an absent field, not an empty string (data-model.md validation: "Empty strings are never stored")

### Implementation for User Story 3

- [ ] T013 [US3] Implement absence semantics in `lib/user-store.ts` `resolveUser`/`displayLabel`: never write `firstName` when the validated derivation is empty or whitespace-only (normalize at the write boundary); fallback chain per contracts.md table — this task only lands whatever T012 forces (likely confirming existing behavior plus the empty-derivation guard; change only what the failing test demands) (depends on T012)

**Checkpoint**: All three user stories independently functional; fallback never produces blanks or errors.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates, end-to-end validation, and constitutional PR hygiene

- [ ] T014 Run full quickstart V1–V6 validation against the deployment, including V6 privacy cross-check: `/ranking` and `/winners` contain no user first names (baby names only), session cookie stays `{ uid, iat }`-shaped
- [ ] T015 [P] Verify no unintended diff: `git diff --stat` shows changes only in `lib/google-verify.ts`, `lib/user-store.ts`, `app/actions.ts`, and the three test files (`tests/unit/google-verify.test.ts`, `tests/unit/user-store.test.ts`, `tests/integration/submit-auth.test.ts`) — any other touched file is re-reviewed against Constitution V
- [ ] T016 Final gates + PR: `npm test` green, `npm run build` zero type/lint errors; open PR whose description states the exercised constitution principles (I–V pass, Free-Plan Budget unchanged — no new keys/dependencies/env variables) and how test-first (III) was satisfied (red tests in T003–T005/T012 → green in T006–T008/T013)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately; T002 blocks all edits
- **Foundational (Phase 2)**: none — intentionally empty (see above)
- **User Stories (Phases 3–5)**: depend on Phase 1 only
- **Polish (Phase 6)**: depends on the stories being implemented

### User Story Dependencies

- **US1 (P1)**: independent; the core slice — tests T003/T004/T005 parallel, then T006/T007 (parallel, different files), then T008 (integration point), then T009
- **US2 (P2)**: independent of US1 implementation details — but executes simplest AFTER US1's label change so T010 pins the post-change behavior; quickstart V3 then runs live
- **US3 (P3)**: touches `lib/user-store.ts` like US1 — run after US1 lands (sequential on that file) to avoid same-file conflicts; its tests (T012) can be written in parallel with US1 implementation since only the test file is shared with T004 (write after T004 commits)

### Within Each User Story

- Tests written and failing BEFORE implementation (Constitution III)
- Storage/verification layers (T006, T007) before the action-layer integration (T008)
- Story checkpoint validation before the next story

### Parallel Opportunities

- T001/T002 … then T003 + T004 + T005 all parallel (three different test files/seams)
- T006 + T007 parallel (`lib/google-verify.ts` vs `lib/user-store.ts`)
- US2 and US3 tasks are tiny; after US1, T010 and T012 can run in the same session (different concerns), T011/T013/T014–T016 follow
- Total wall-clock: essentially one focused work session; the feature is deliberately small (plan.md Summary)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 test tasks together (three files, no overlap):
Task: "Failing derivation tests in tests/unit/google-verify.test.ts"
Task: "Failing label-precedence tests in tests/unit/user-store.test.ts"
Task: "Failing persistence test in tests/integration/submit-auth.test.ts"

# Then both implementation tasks in parallel (different lib files):
Task: "GoogleVerifyResult.firstName derivation in lib/google-verify.ts"
Task: "UserRecord.firstName + resolveUser + displayLabel in lib/user-store.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: branch + green baseline (T001–T002)
2. Phase 3: red tests (T003–T005) → implementation (T006–T008) → gates (T009)
3. **STOP and VALIDATE**: quickstart V1/V2 — the user's entire request is already delivered
4. Deploy/demo if ready

### Incremental Delivery

1. US1 lands → real names on fresh sign-ins (MVP)
2. US2 + US3 add the safeguard and fallback assurances (small, mostly pinning existing behavior)
3. Phase 6 closes with the privacy cross-check and constitutional PR

### Notes

- `app/page.tsx` and `app/vote-client.tsx` require NO changes — the label prop already carries whatever `displayLabel` returns (contracts.md "Route/UI contract")
- No migration/backfill for pre-existing records (research R5): they keep "Person N" until a fresh sign-in; never write migration code for a two-user dataset
- Every task above follows the checklist format `- [ ] TXXX [P?] [US?] description with path`
