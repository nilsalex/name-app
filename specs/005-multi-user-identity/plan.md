# Implementation Plan: Multi-User Identity

**Branch**: `005-multi-user-identity` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-multi-user-identity/spec.md`

## Summary

Replace the A/B alias mapping (env vars `APPROVED_USER_A_EMAIL` /
`APPROVED_USER_B_EMAIL`) with app-generated, opaque, persistent **internal
user IDs**. On first approved sign-in, a user record (ID + creation time) is
persisted server-side in Upstash; the session cookie carries that ID instead
of an alias. Vote records are attributed to the internal ID going forward
while historical "A"/"B" records stay untouched, and ranking/winners must
tolerate the mixed identifier set. The approved list becomes a single
comma-separated secret env var (`APPROVED_EMAILS`) extendable without code
changes (FR-011), and per-user display names stay neutral ("Person 1", …)
without storing emails anywhere (FR-008/FR-012).

Technical approach (from research): a `users` hash in Upstash
(`namewahl:users`) maps `email → userId`; IDs are 128-bit `node:crypto`
`randomBytes` base64url tokens (opaque, non-enumerable). Sign-in does a
read-or-create on that hash (HGETALL/HSET — one extra Redis round trip per
*sign-in only*, never per vote). Session payload becomes
`{ uid, iat }`. Display names for new users are assigned sequentially at
first sign-in (`namewahl:users:nextnum` counter) so they are stable without
storing any personal data.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (App Router, `cacheComponents: true`), React 19, Node 24 (dev/test)

**Primary Dependencies**: next, react, @upstash/redis (all existing); Google Identity Services script (existing from 004); `node:crypto` (built-in: HMAC sessions + `randomBytes` for IDs). NO new npm dependencies.

**Storage**: Upstash Redis free tier (existing). NEW key `namewahl:users` (hash: email → JSON user record) and `namewahl:users:nextnum` (display-name counter); existing `namewahl:votes` stream and `namewahl:scores` zset keep their shapes — only the `user` field's *value domain* widens from {A,B} to opaque IDs (legacy values untouched). Env config: `GOOGLE_CLIENT_ID`, `APPROVED_EMAILS` (comma-separated, replaces the two per-alias vars), `SESSION_SECRET`.

**Testing**: `node:test` via `tsx` (`npm test`); unit tests for new pure modules (user IDs, email list parsing); unit tests for session payload change; store-level unit coverage for the users hash via mocked `@upstash/redis` is NOT added — the read-or-create logic is kept in a thin pure function tested with a fake map store; one integration test extends the existing unauthenticated-submit test to the new session shape.

**Target Platform**: Modern desktop/mobile browsers (Vercel Hobby deployment), Google accounts

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: Returning user → vote screen < 5 s (SC-001); sign-in completes < 60 s (SC-002); session verify stays O(1) HMAC (no Redis read per request); sign-in adds one Redis read-or-create (~10 ms, rare event)

**Constraints**: Free-plan only — one hash + one counter key, writes only at first sign-in per user and per vote (unchanged); emails never stored in vote records or session (FR-008/FR-012); legacy "A"/"B" vote records must render unchanged (SC-006); display labels derive from records without exposing emails

**Scale/Scope**: Bounded only by the approved list; changes confined to `lib/users.ts` (rewrite), `lib/session.ts` (payload field), `lib/store.ts` (new users-hash accessors), `app/actions.ts` (signIn resolution), `app/page.tsx` + `app/vote-client.tsx` (label derivation); ranking/winners page logic untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Session change is payload-only; cookies()/Suspense patterns from 004 unchanged and still match the pinned auth guides. No new routes, no deprecated APIs. |
| II. TypeScript Strictness | PASS | New `lib/user-ids.ts` and rewritten `lib/users.ts` fully typed, discriminated unions for results, no `any`. |
| III. Proportionate Test-First | PASS | Unit suites for ID generation (uniqueness, opacity, format), email-list parsing (trim/case/dedupe), user-store read-or-create (fake map), and the updated session payload — written before implementation. |
| IV. Proportionate Integration Testing | PASS | One updated integration test (unauthenticated submit rejected, zero writes) covering the changed session shape. No new integration tests for ranking/winners (untouched logic). |
| V. Simplicity Is Paramount | PASS | No auth library, no ID library — `node:crypto.randomBytes(16)` base64url (one line). Users hash is a flat Redis hash, not "user accounts infrastructure". Email list is one env var, not a config file format. Zero new npm packages. |
| Free-Plan Budget | PASS | +2 Redis keys, +1-2 commands per sign-in only (HGETALL/HSET + INCR at first sign-in). Vote-write volume unchanged. Well inside 10k commands/day. |

**Post-Phase-1 re-check**: PASS — Complexity Tracking stays empty; the
users-hash approach is the smallest server-side store that satisfies
"persistent, app-generated, not email-derived" without a schema migration.

## Project Structure

### Documentation (this feature)

```text
specs/005-multi-user-identity/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lib/
├── user-ids.ts          # NEW: opaque internal user ID generation
│                        #   (node:crypto.randomBytes(16) → base64url, 22 chars)
├── users.ts             # REWRITTEN: approved-email parsing from single
│                        #   APPROVED_EMAILS env var (parse/normalize/dedupe);
│                        #   alias mapping removed
├── user-store.ts        # NEW: Upstash-backed read-or-create user records
│                        #   (hash namewahl:users, counter namewahl:users:nextnum);
│                        #   pure resolution logic separated for unit testing
├── session.ts           # MODIFIED: payload { uid: string, iat } — Alias type
│                        #   removed; verification rejects unknown shapes
├── env.ts               # MODIFIED: APPROVED_EMAILS accessor replaces
│                        #   approvedEmail(alias)
├── store.ts             # MODIFIED: VoteRecord.user widens to string
│                        #   (legacy "A"/"B" values pass through unchanged);
│                        #   users-hash accessors re-exported or co-located
├── actions.ts (app/)    # MODIFIED: signIn resolves email → userId via
│                        #   user-store, sets session with uid
├── page.tsx (app/)      # MODIFIED: VoteClient receives uid + display label
├── vote-client.tsx      # MODIFIED: label prop instead of alias
└── login-client.tsx     # unchanged (still sends idToken to signIn)

tests/
├── unit/
│   ├── user-ids.test.ts     # NEW: format, uniqueness, opacity (not email-derived)
│   ├── users.test.ts        # REWRITTEN: APPROVED_EMAILS parsing rules
│   ├── user-store.test.ts   # NEW: read-or-create with fake map store,
│   │                        #   sequential display names, stable re-resolution
│   ├── session.test.ts      # UPDATED: { uid, iat } payload round-trip/tamper
│   └── (existing suites unchanged except session)
└── integration/
    └── submit-auth.test.ts  # UPDATED: unauthenticated rejection + zero writes
                             #   against the { uid } session shape
```

**Structure Decision**: Existing single-project Next.js layout retained. The
identity domain grows one pure module (`user-ids.ts`), one storage module
(`user-store.ts`), and a rewrite of `lib/users.ts` (config parsing); all
other changes are payload/prop plumbing. Ranking/winners modules are not
touched.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
