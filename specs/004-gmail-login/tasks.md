---

description: "Task list for feature 004-gmail-login"
---

# Tasks: Gmail Login (004)

**Input**: Design documents from `/specs/004-gmail-login/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/contracts.md, quickstart.md

**Tests**: Included per constitution Principle III/IV (proportionate, test-first red→green): unit tests for every new pure module, one integration test for the auth-gated `submitVote` path. UI wiring is validated by build + quickstart, not tests.

**Organization**: Tasks are grouped by user story. US1 = login/session (P1), US2 = attribution (P2), US3 = sign-out/access control (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project Next.js App Router: `app/`, `lib/`, `tests/unit/`, `tests/integration/` at repository root (per plan.md Project Structure).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment contract for the new secrets before any code touches them.

- [x] T001 Create `.env.example` at repository root documenting every required secret with placeholder values and one-line comments: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GOOGLE_CLIENT_ID`, `APPROVED_USER_A_EMAIL`, `APPROVED_USER_B_EMAIL`, `SESSION_SECRET` (note in comment: ≥ 32 random bytes, `openssl rand -base64 32`); add a header comment "never commit .env.local". Also list the four new auth variables in `specs/004-gmail-login/quickstart.md` Prerequisites are already documented — verify they match this file exactly.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure, server-only auth modules that ALL user stories depend on. No user story work may begin until these are green.

**⚠️ CRITICAL**: Test-first per constitution: each test task must FAIL (module missing) before its implementation task.

- [x] T002 [P] Extend `lib/env.ts` with typed fail-fast accessors following the existing `required()` pattern: `googleClientId()` (env `GOOGLE_CLIENT_ID`), `sessionSecret()` (env `SESSION_SECRET`, must be ≥ 32 bytes or throw with a clear message), `approvedEmail(alias: "A" | "B")` (env `APPROVED_USER_A_EMAIL` / `APPROVED_USER_B_EMAIL`, trimmed, must be non-empty). All server-only; never log values.
- [x] T003 [P] Write failing unit tests for the session module in `tests/unit/session.test.ts`: seal/verify round-trip preserves `{ alias, iat }`; tampered payload (bit-flip) rejected; expired session (age > 30 days = `SESSION_MAX_AGE_SECONDS`) rejected; malformed value (no dot, bad base64url, wrong JSON shape, alias not "A"/"B") rejected; signature compared via constant-time compare (mock `node:crypto` `timingSafeEqual` call or verify behavior by tampering only the signature). All via injectable `deps` ({ secret, now }) per contracts.md §4 — no env access in tests.
- [x] T004 Implement `lib/session.ts` to pass T003: `sealSession`, `verifySession`, `getCurrentAlias()` (reads `cookies()` from `next/headers`, returns `Alias | null`), constants `SESSION_COOKIE_NAME = "namewahl_session"` and `SESSION_MAX_AGE_SECONDS = 30*24*60*60`; HMAC-SHA256 over base64url(JSON) + "." + base64url(sig), `timingSafeEqual` for verification; `"server-only"` import at top; cookie attributes httpOnly, secure in production, sameSite lax, path "/" (data-model.md Session).
- [x] T005 [P] Write failing unit tests for the users module in `tests/unit/users.test.ts`: `aliasForEmail` maps approved address (exact, case-insensitive, trimmed) to "A" and the other to "B"; unknown email → null; empty string → null; `assertAuthConfigured` throws when either approved email is missing and when both addresses are identical (data-model.md ApprovedAddress validation rules). All via injectable `env` record — no `process.env` in tests.
- [x] T006 Implement `lib/users.ts` to pass T005: `aliasForEmail(email, env?)` and `assertAuthConfigured()` reading via `lib/env.ts` accessors; doc comment stating this module replaces `lib/user.ts` (which stays until US2 removes it).
- [x] T007 [P] Write failing unit tests for Google token verification in `tests/unit/google-verify.test.ts` with an injected fake `fetchTokenInfo`: valid claims → `{ ok: true, email }`; `aud` ≠ client id → invalid-token; `email_verified !== "true"` → invalid-token; `exp` in the past (injectable `now`) → invalid-token; tokeninfo returns non-2xx or malformed JSON → invalid-token; missing `GOOGLE_CLIENT_ID` (injectable undefined + env unset) → server-config; token missing email → invalid-token.
- [x] T008 Implement `lib/google-verify.ts` to pass T007: `verifyGoogleIdToken(idToken, deps?)` calling `https://oauth2.googleapis.com/tokeninfo?id_token=...`, checking `aud === googleClientId()`, `email_verified === "true"`, `exp > now` (research.md R2); returns discriminated union per contracts.md §4; `"server-only"` import.
- [x] T009 Run full check: `npm test` (existing 44 + new unit suites green, new tests were seen to fail first), `npx tsc --noEmit` clean, `npm run build` passes.

**Checkpoint**: Foundation ready — session, allowlist mapping, and token verification are pure, typed, and unit-tested. User stories can start.

---

## Phase 3: User Story 1 — Log in with my Gmail address (Priority: P1) 🎯 MVP

**Goal**: An approved user opens the app, sees a Google sign-in button, signs in, and lands directly on the vote screen identified as their alias; the session persists across reloads (FR-001, FR-002, FR-006; SC-001, SC-002).

**Independent Test**: Fresh browser session on `/` → login screen (no Person A/B buttons); sign in with an approved Google account → vote screen shows the alias; reload → still signed in. (Live validation: quickstart.md V1/V2.)

### Implementation for User Story 1

- [x] T010 [US1] Add `signIn(idToken: unknown)` server action to `app/actions.ts`: validates input is a non-empty string, calls `verifyGoogleIdToken`, on `ok` calls `aliasForEmail` (via `assertAuthConfigured` guard) and — if the alias is non-null — sets the `namewahl_session` cookie (attributes per data-model.md: httpOnly, secure in production, sameSite lax, maxAge `SESSION_MAX_AGE_SECONDS`, path "/") and returns `{ ok: true, alias }`; maps failures to `{ ok: false, reason: "invalid-token" | "not-approved" | "server-config" }` exactly per contracts.md §1; never returns or logs the email (FR-008). Add exported `SignInResult` type.
- [x] T011 [US1] Create `app/login-client.tsx`: `"use client"` component that loads `https://accounts.google.com/gsi/client` via `next/script` (strategy `afterInteractive`), receives `clientId` as a prop from the server (never reads env itself), renders the GIS button (`data-client_id`, `data-callback`), posts the Google credential to `signIn` via a local wrapper (fetch a server action import), on `{ ok: true }` calls `router.refresh()`, on any failure shows a short honest German hint "Anmeldung fehlgeschlagen — bitte erneut versuchen." (FR-010; the distinct denial message is US3/T020). Handle cancelled popup: state simply stays on login with the same hint, no partial state (spec Edge Case 1).
- [x] T012 [US1] Rework `app/page.tsx` into the session gate per contracts.md §2: static shell stays; wrap a small async server component in `<Suspense fallback={...}>` that calls `getCurrentAlias()` (lib/session.ts) — valid session renders `<VoteClient alias={...} />`, otherwise `<LoginClient clientId={googleClientId()} />`. No `cookies()` access outside the Suspense boundary (cacheComponents build must pass). Add the German fallback text "Anmeldung wird geprüft…".
- [x] T013 [US1] Update `app/vote-client.tsx`: replace the `getCurrentUser`/`setCurrentUser` identity-picker logic with a required `alias: "A" | "B"` prop (display label "Person A"/"Person B" stays); keep every other behavior (pair reserve, instant swap, failure notice) unchanged; keep passing the alias to `submitVote` for now (signature changes in US2/T016). Remove any "Wer bist du?" identity UI.
- [x] T014 [US1] Add login-screen styles (centered card, Google button spacing, error hint) to `app/page.module.css`; reuse existing CSS variable palette; no new dependencies.

**Checkpoint**: User Story 1 works end-to-end in a credentialed environment (quickstart V1/V2). `npm run build` must pass with `cacheComponents: true` — if the session read leaked outside Suspense, the build fails here.

---

## Phase 4: User Story 2 — Votes attributed to the real logged-in account (Priority: P2)

**Goal**: Every vote is attributed to the alias of the actually signed-in account; the client can no longer choose the identity; ranking/winners unchanged (FR-005, FR-009; SC-003, SC-006).

**Independent Test**: Sign in as alias A, vote → record shows `user: "A"`; from alias B → `"B"`. Unauthenticated `submitVote` call writes nothing. (Automated: T015 integration test; live: quickstart V1 step 4, V6.)

### Tests for User Story 2 ⚠️ (write FIRST, must FAIL)

- [x] T015 [P] [US2] Write failing integration test `tests/integration/submit-auth.test.ts`: import `submitVote` from `app/actions.ts` with NO session cookie in the environment → result is `{ ok: false }` with an unauthenticated error and NO store write occurs (assert via a mocked `lib/store` module — e.g. register a `node:test` mock or inject by temporarily setting env-free failure path; follow the harness style of `tests/integration/store.test.ts`); also assert a valid-name pair with `winner === loser` still errors identically to today. This test must not require Upstash credentials to run.

### Implementation for User Story 2

- [x] T016 [US2] Change `submitVote(winner, loser)` in `app/actions.ts` to drop the third `user` parameter: derive `user` from `getCurrentAlias()`; unauthenticated/expired → `{ ok: false, error: "Abgelaufen — bitte bitte neu anmelden." }` (adjust wording to match T015 exactly) with zero store calls; keep all existing validation (unknown name, same-pair) unchanged; update the call site in `app/vote-client.tsx` / `lib/vote-sender.ts` send function accordingly.
- [x] T017 [US2] Delete `lib/user.ts` and confirm zero remaining references (`rg -n "lib/user|getCurrentUser|setCurrentUser|USER_IDS" app lib tests` is empty); run `npm test` — all suites green including T015.

**Checkpoint**: User Stories 1 AND 2 both work; votes are tamper-proof against client-side identity choice.

---

## Phase 5: User Story 3 — Sign out and access control (Priority: P3)

**Goal**: Signed-in users can end their session deliberately; only the two approved addresses get past login; everyone else sees a friendly denial (FR-003, FR-007; SC-004, SC-005).

**Independent Test**: Sign in, click sign-out → login screen returns and stays after reload; sign in with a non-approved Google account → friendly German denial, no vote UI. (Live validation: quickstart V3/V4.)

### Implementation for User Story 3

- [x] T018 [US3] Add `signOut()` server action to `app/actions.ts`: delete the `namewahl_session` cookie via `cookies().delete(...)`; idempotent (succeeds with no session); returns `{ ok: true }` (contracts.md §1).
- [x] T019 [US3] Add a subtle "Abmelden" control to `app/vote-client.tsx` (button in the header area, styled in `app/page.module.css`): calls `signOut()` then `router.refresh()`; after refresh the gate in `app/page.tsx` shows the login screen (FR-007: no vote UI reachable).
- [x] T020 [US3] Extend `app/login-client.tsx` to distinguish the denial case: when `signIn` returns `{ ok: false, reason: "not-approved" }`, show the friendly German message "Diese Adresse ist nicht freigeschaltet." instead of the generic failure hint; keep `invalid-token` and `server-config` on the generic hint (SC-004).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, full gates, and live validation.

- [x] T021 [P] Update `README.md` (or create a short "Setup" section if absent): list the four new auth env vars, the Google Cloud Console steps (OAuth client ID + authorized JavaScript origins for localhost and the production URL), and point to `specs/004-gmail-login/quickstart.md`.
- [x] T022 Run the complete gate suite: `npm test` (all unit + integration suites), `npx tsc --noEmit`, `npm run build` — all green; verify `rg -n "lib/user" app lib tests` stays empty and `.env.local` is gitignored.
- [ ] T023 Run `specs/004-gmail-login/quickstart.md` scenarios V1–V6 in a credentialed environment (Google client ID + approved addresses + Upstash): V1 sign-in/vote, V2 session persistence, V3 non-approved denial, V4 sign-out + tampered cookie, V5 fail-fast on missing config, V6 historical data unchanged. Mark any scenario that cannot run here as deferred to the user's environment (same as feature 003).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on T001 (env contract). T002 → T003–T008 (tests before implementations, pairs independent of each other) → T009 gate. **BLOCKS all user stories.**
- **US1 (Phase 3)**: Depends on Phase 2. T010 → T011 → T012 → T013 → T014 (strict order: action, then client, then gate, then vote-client prop, then styles).
- **US2 (Phase 4)**: Depends on US1 (vote-client must already render from a session). T015 (test, red) → T016 → T017.
- **US3 (Phase 5)**: Depends on US1 (needs the session gate + login client) and US2 (submitVote signature final). T018 → T019, T020 (T019/T020 touch different files, parallelizable).
- **Polish (Phase 6)**: Depends on all stories. T021 parallel with T022; T023 last (needs credentials).

### User Story Dependencies

- **US1 (P1)**: Foundational only — no other story dependency. MVP.
- **US2 (P2)**: Builds on US1's session; independently testable via T015 once T010 exists.
- **US3 (P3)**: Safety net around US1; needs US2's final action signatures to avoid rework.

### Parallel Opportunities

- Phase 2: T003+T004, T005+T006, T007+T008 are three independent test/implementation pairs (different files) — pairs can interleave, and T002 is parallel to all.
- T015 is parallel to nothing else in its phase (it blocks T016 by design: red first).
- T019 and T020 (different files: vote-client vs login-client) can run in parallel.
- T021 parallel with T022.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001) and Phase 2 (T002–T009) — foundation.
2. Complete Phase 3 (T010–T014).
3. **STOP and VALIDATE**: quickstart V1/V2 in a credentialed environment.
4. At this point login replaces the identity picker (FR-001/002/006 done).

### Incremental Delivery

1. Foundation → US1 (MVP: real login, persistent session) → validate.
2. + US2 (attribution from session; client identity choice impossible) → validate T015 green + quickstart V6.
3. + US3 (sign-out + access control) → validate quickstart V3/V4.
4. Polish: docs, full gates, live quickstart pass.

### Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to spec user story for traceability.
- Verify each new test FAILS before implementing it (constitution Principle III).
- Commit after each task or logical group.
- No new npm dependencies anywhere in this feature (research.md R1–R3 decisions).
