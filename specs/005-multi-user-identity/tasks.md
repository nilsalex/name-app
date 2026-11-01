---

description: "Task list for feature 005-multi-user-identity"
---

# Tasks: Multi-User Identity (005)

**Input**: Design documents from `/specs/005-multi-user-identity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contracts.md, quickstart.md

**Tests**: Included per constitution Principle III/IV (proportionate, test-first red→green): unit suites for every new/changed pure module, updated integration test for the unauthenticated-submit path. UI wiring validated by build + quickstart.

**Organization**: Tasks are grouped by user story. US1 = login with stable ID (P1), US2 = ID-based attribution + mixed-legacy rendering (P2), US3 = sign-out/access control preserved (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project Next.js App Router: `app/`, `lib/`, `tests/unit/`, `tests/integration/` at repository root (per plan.md Project Structure).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment/config contract before any code reads it.

- [ ] T001 Update `.env.example` at repository root: replace `APPROVED_USER_A_EMAIL`/`APPROVED_USER_B_EMAIL` entries with a single `APPROVED_EMAILS=person.a@gmail.com,person.b@gmail.com` line (comment: "comma-separated approved addresses; append to add a user; order no longer decides identity"); keep `GOOGLE_CLIENT_ID` and `SESSION_SECRET` entries unchanged.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: New pure modules + changed session payload that ALL user stories depend on. Test-first: each test task must FAIL before its implementation task.

- [ ] T002 [P] Write failing unit tests `tests/unit/user-ids.test.ts`: `generateUserId()` returns a 22-char base64url string matching `^[A-Za-z0-9_-]{22}$`; 1000 generations are all unique; `isUserIdShape` accepts valid ids and rejects non-strings, empty, wrong charset, >64 chars (contracts.md §4).
- [ ] T003 Implement `lib/user-ids.ts` to pass T002: `generateUserId()` via `node:crypto.randomBytes(16).toString("base64url")`; `isUserIdShape(value)` type guard (1–64 base64url chars, forward-compatible per data-model.md). Pure module, no env access.
- [ ] T004 [P] Write failing unit tests for the rewritten `lib/users.ts` in `tests/unit/users.test.ts` (replace the alias-mapping tests entirely): `parseApprovedEmails` splits on commas, trims, lowercases, drops empty/whitespace segments, dedupes; single-address list works; `parseApprovedEmails(undefined)` and empty-after-parse throw with a message naming `APPROVED_EMAILS`; `isApprovedEmail` matches normalized; `assertAuthConfigured` throws on unparseable config. Inject a raw string / env-shaped record — no `process.env` reads in tests.
- [ ] T005 Rewrite `lib/users.ts` to pass T004: `parseApprovedEmails(raw)`, `isApprovedEmail(email, approved)`, `assertAuthConfigured()` reading the new `APPROVED_EMAILS` accessor (added in T006). Remove `aliasForEmail` and the `UsersEnv` alias interface (data-model.md deletions).
- [ ] T006 [P] Update `lib/env.ts`: replace `approvedEmail(alias)` with `approvedEmails(): string` returning the raw `APPROVED_EMAILS` value (fail-fast via existing `required()`); keep `googleClientId()` and `sessionSecret()` unchanged.
- [ ] T007 [P] Write failing unit tests for `lib/user-store.ts` in `tests/unit/user-store.test.ts` using an in-memory `UserStoreBackend` (map + counter): first `resolveUser(email)` creates a record with a 22-char id, `num` 1, ISO `createdAt`; second resolve returns the SAME id and num; a different email gets num 2 and a different id; emails are normalized (trimmed/lowercased) to the same record; `displayLabel({id,num,createdAt})` returns `"Person 1"` and `"Person"` when num is missing (research R6, R3).
- [ ] T008 Implement `lib/user-store.ts` to pass T007: `UserRecord` interface, `UserStoreBackend` interface (`get`, `put`, `nextNumber` per contracts.md §4), `createUserStore(backend?)` with a default Upstash backend (hash `namewahl:users`, field = normalized email, value = JSON record; counter `namewahl:users:nextnum` via INCR — keys per data-model.md), read-or-create `resolveUser` (research R3, race behavior documented in code comment), `displayLabel`.
- [ ] T009 Update `tests/unit/session.test.ts` for the new payload: round-trip `{ uid: "<22-char>", iat }`; tamper/expiry/malformed rejections still hold; a legacy `{ alias: "A", iat }` payload (correctly signed) is REJECTED (uid missing); uid with wrong charset rejected. Tests must fail before T010.
- [ ] T010 Update `lib/session.ts` to pass T009: `SessionPayload = { uid: string; iat: number }`; `verifySession` validates uid via `isUserIdShape`; remove the `Alias` type; `getCurrentAlias()` renamed to `getCurrentUid(): Promise<string | null>` (same cookie mechanics otherwise).
- [ ] T011 Run full check: `npm test` (existing suites green incl. reworked session/users; new suites pass), `npx tsc --noEmit` clean. (`next build` may still fail until US1 rewires actions — record the failure, do not fix here.)

**Checkpoint**: Foundation ready — IDs, parsing, user store, and the new session shape are pure, typed, unit-tested.

---

## Phase 3: User Story 1 — Log in with my Gmail address (Priority: P1) 🎯 MVP

**Goal**: Approved sign-in resolves the account to a persistent internal user ID; the session carries `{ uid, iat }`; the vote screen greets the user with a neutral label (FR-001/002/004/006, FR-011; SC-001/002).

**Independent Test**: Sign in with an approved address → vote screen with "Person N" label; Upstash `namewahl:users` gains a record whose id (22-char opaque string) matches the session cookie's uid; sign out/in → same id, same label. (Live: quickstart V1/V2.)

### Implementation for User Story 1

- [ ] T012 [US1] Update `signIn` in `app/actions.ts`: after token verification, call `assertAuthConfigured()` + `isApprovedEmail(email, parseApprovedEmails(approvedEmails()))`; unapproved → `{ ok: false, reason: "not-approved" }` BEFORE any user-store access (research R7: denial leaves no record); approved → `resolveUser(email)` from `lib/user-store.ts`; set the cookie with `{ uid: record.id, iat: Date.now() }`; return `{ ok: true, uid: record.id, label: displayLabel(record) }` per contracts.md §1. Keep reason mapping and no-email-logging guarantees unchanged.
- [ ] T013 [US1] Update `app/page.tsx` session gate: `getCurrentUid()` → for a valid session resolve the display label server-side (read `namewahl:users` via a lookup by uid — add `findUserById(uid)` to `lib/user-store.ts` with unit coverage in T007's file if needed, or pass label through by re-reading the record; must not break cacheComponents/Suspense structure) → render `<VoteClient uid={...} label={...} />`; invalid → `<LoginClient clientId={...} />` unchanged.
- [ ] T014 [US1] Update `app/vote-client.tsx`: replace the `alias: Alias` prop with `uid: string, label: string`; hint line uses `label` ("Welcher Name gefällt dir besser, Person 3?"); `VoteInput.voter` receives `uid` (still ignored server-side); no other behavior changes.
- [ ] T015 [US1] Update `app/login-client.tsx` types for the new `SignInResult` (success no longer carries `alias`; nothing in this component reads it — verify and adjust the import/type only). No behavior change.

**Checkpoint**: US1 works end-to-end in a credentialed environment (quickstart V1/V2). `npm run build` must pass again here.

---

## Phase 4: User Story 2 — ID-based attribution with mixed legacy data (Priority: P2)

**Goal**: Votes are recorded under the session uid; historical "A"/"B" records coexist untouched; ranking/winners render unchanged (FR-005, FR-012; SC-003, SC-006).

**Independent Test**: Vote → new stream entries carry the 22-char uid as `user`; pre-005 entries still show "A"/"B" and ranking/winners pages render exactly as before. (Automated: T016/T017; live: quickstart V1 step 3–4.)

### Tests for User Story 2 ⚠️ (write FIRST, must FAIL or be updated meaningfully)

- [ ] T016 [P] [US2] Update `tests/integration/submit-auth.test.ts`: unauthenticated `submitVote` (no cookie) still returns `{ ok: false }` with ZERO `recordVote` calls; additionally assert the mocked `recordVote` receives `user` as the session uid when a valid `{ uid, iat }` cookie shape is present — mock `lib/session`'s `getCurrentUid` via `mock.module` to return a fixed uid for the positive case and null for the negative case (two tests).
- [ ] T017 [P] [US2] Extend `tests/unit/ranking.test.ts` (or add a focused case) proving `rankNames` is insensitive to the voter field: feed scores derived from a vote set mixing `user: "A"`, `user: "B"`, and uid-shaped voters — identical totals regardless (documents SC-006 tolerance; no production change expected — this test locks the behavior).

### Implementation for User Story 2

- [ ] T018 [US2] Widen `VoteRecord.user` to `string` in `lib/store.ts` (type only — value passes through verbatim); confirm `recordVote`/`scores` bodies need no change; run `npm test` — all suites green including T016.
- [ ] T019 [US2] Verify no alias remnants: `grep -rn "aliasForEmail\|APPROVED_USER_A\|APPROVED_USER_B\|getCurrentAlias\|: Alias" app lib tests` returns nothing (cleanup any stragglers found); `npx tsc --noEmit` clean.

**Checkpoint**: US1 AND US2 work; attribution is identity-scheme-agnostic for readers.

---

## Phase 5: User Story 3 — Sign out and access control (Priority: P3)

**Goal**: Sign-out and denial behavior preserved under the new identity scheme (FR-003, FR-007, FR-010; SC-004, SC-005).

**Independent Test**: Sign in → sign out → login screen returns and persists; a non-approved Google account is denied and creates no user record. (Live: quickstart V3 + V5.)

### Implementation for User Story 3

- [ ] T020 [US3] Verify `signOut()` in `app/actions.ts` needs no change (deletes `namewahl_session` regardless of payload shape) — add a focused unit-style assertion if cheap, else document in the task comment; confirm the Abmelden flow in `app/vote-client.tsx` still works with the new props (no code change expected).
- [ ] T021 [US3] Verify the not-approved path in `app/actions.ts` runs BEFORE `resolveUser` (T012) with a focused test in `tests/integration/submit-auth.test.ts` or a new `tests/unit/signin-flow.test.ts`: given a verified email that fails `isApprovedEmail`, the user-store backend mock records ZERO `put` calls (denial leaves no trace, research R7).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, gates, live validation.

- [ ] T022 [P] Update `README.md` Setup section: replace the two per-alias variables with `APPROVED_EMAILS` (comma-separated; append to add a user; first sign-in order assigns "Person N" labels); note the one-time re-login after deploy (004 sessions invalidated) and that old A/B vote data needs no migration.
- [ ] T023 Run the complete gate suite: `npm test`, `npx tsc --noEmit`, `npm run build` — all green; `grep -rn "APPROVED_USER_A\|APPROVED_USER_B" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git` shows only historical spec/doc references.
- [ ] T024 Run `specs/005-multi-user-identity/quickstart.md` V1–V6 in a credentialed environment: V1 sign-in/stable ID, V2 ID stability across devices, V3 denial leaves no record, V4 extend list without code changes, V5 one-time re-login, V6 fail-fast on empty config. Deferred here (no credentials in this environment).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: T002→T003, T004→T005, T007→T008, T009→T010 are independent red→green pairs; T006 parallel to all; T011 gate. **BLOCKS all user stories.**
- **US1 (Phase 3)**: Depends on Phase 2. T012 → T013 → T014 → T015 (action first, then page, then client props).
- **US2 (Phase 4)**: Depends on US1 (session shape live). T016/T017 (tests) → T018 → T019.
- **US3 (Phase 5)**: Depends on US1/T012 (not-approved ordering). T020 and T021 independent of each other.
- **Polish (Phase 6)**: Depends on all stories. T022 parallel with T023; T024 last (credentials).

### User Story Dependencies

- **US1 (P1)**: Foundational only. MVP.
- **US2 (P2)**: Builds on US1's session; tests lock mixed-legacy tolerance.
- **US3 (P3)**: Mostly verification tasks — behavior preserved by design; T021 guards the no-record-on-denial invariant.

### Parallel Opportunities

- Phase 2: three independent test/impl pairs + T006 all parallelizable.
- T016 ∥ T017 (different files).
- T020 ∥ T021.
- T022 ∥ T023.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (foundation).
2. Phase 3 (T012–T015) → login resolves to stable IDs.
3. **STOP and VALIDATE**: quickstart V1/V2.

### Incremental Delivery

1. Foundation → US1 (stable IDs, neutral labels) → validate.
2. + US2 (uid attribution, mixed-legacy tolerance locked by tests) → validate.
3. + US3 (sign-out/denial invariants verified) → validate.
4. Polish: docs, gates, live quickstart.

### Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to spec user story for traceability.
- Verify each new test FAILS before implementing (constitution Principle III).
- Commit after each task or logical group.
- No new npm dependencies (research.md R1–R3).
- Operator migration (env var swap) is quickstart.md Prerequisites + T022; the one-time 004-session invalidation is documented in research R5 / quickstart V5.
