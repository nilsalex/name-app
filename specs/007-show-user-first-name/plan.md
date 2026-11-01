# Implementation Plan: Show the User's First Name

**Branch**: `007-show-user-first-name` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-show-user-first-name/spec.md`

## Summary

The signed-in user sees their own **first name** on the vote screen, in
place of today's neutral "Person N" label. The name is not stored and not
asked for: Google's `tokeninfo` endpoint already returns `given_name` for
the very ID token the sign-in path verifies, so `verifyGoogleIdToken`
additionally derives a verified given name, `resolveUser` persists it once
in the existing `UserRecord` (a plain optional `firstName` field — first
sign-in writes it; it is immutable afterwards, matching `num`), and the
vote gate passes `displayLabel(record)` through, which now renders
`firstName` (first word of `name` when `given_name` is absent) and falls
back to "Person N"→"Person" exactly as before. Zero new keys, zero extra
round trips, one optional field added to an existing hash value — a
read-only-feeling feature that is really a small sign-in-time capture.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (App Router,
`cacheComponents: true`), React 19, Node 24 (dev/test). All code targets
the pinned Next.js version; bundled docs in `node_modules/next/dist/docs/`
are the convention source (Constitution I).

**Primary Dependencies**: next, react, @upstash/redis (all existing);
Google Identity Services script (already loaded client-side); **no new npm
dependencies** (Constitution V).

**Storage**: Upstash Redis free tier, existing keys only. The users hash
`namewahl:users` keeps its shape; its JSON values gain one optional
`firstName?: string` field written at first sign-in only (+nothing at
runtime; exact same write count as today — Free-Plan Budget intact). No
new keys are created.

**Testing**: Node's built-in test runner via `npm test`
(`node --conditions=react-server --experimental-test-module-mocks --import
tsx --test tests/unit/*.test.ts tests/integration/*.test.ts`) — existing
convention, no new tooling.

**Target Platform**: Vercel free (Hobby) plan, modern browsers; two users.

**Project Type**: Web application (Next.js App Router, server actions).

**Performance Goals**: Unchanged by this feature: vote tap → next pair
swap < 100 ms (feature 003 SC-001); sign-in flow gains **no** extra network
call (the `given_name` arrives in the same `tokeninfo` response the server
already fetches once per sign-in).

**Constraints**: Free-plan Upstash budget must not grow: **zero** new
localStorage/refill/seen-frequency interactions beyond feature 006's
existing budget (~1 score fetch per 5 votes, unchanged). FR-008 privacy
rule is preserved and extended: the email was already never shown; the
first name shown to the user is **their own**, in their own session — no
name ever appears in vote records, ranking data, or another user's
session. German remains the UI language; the name is rendered as
Google reports it (no localization of names).

**Scale/Scope**: 1 route touched for display (`app/page.tsx` → props into
`VoteClient`), 2 lib modules extended (`google-verify.ts`, `user-store.ts`),
1 action result field added (`SignInResult.label` is already a string —
same shape). Two users, one line of visible UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | ✅ PASS | No new routing/rendering patterns; reuse of the existing Suspense + server-component gate exactly as features 004–006 did. Bundled Next.js docs consulted for `cookies()` read timing — unchanged usage. |
| II. TypeScript Strictness | ✅ PASS | One new optional field `firstName?: string` on an exported interface; no `any`, no suppression. `GoogleVerifyResult` gains a typed discriminated addition — no loosened unions. |
| III. Proportionate Test-First | ✅ PASS | One focused unit test per new behavior: (a) tokeninfo response with `given_name` yields a verified name; (b) response with only `name` falls back to its first word; (c) record without `firstName` still yields "Person N". Integration: sign-in against the store persists `firstName`. Proportionate to a two-user toy app; no new scaffolding. |
| IV. Proportionate Integration Testing | ✅ PASS | Critical paths touched: the sign-in route action (`signIn`) and the vote gate (`/`). One integration test for sign-in persistence of `firstName` against the store backend; display composition itself is a pure-function unit test. |
| V. Simplicity Is Paramount | ✅ PASS | Simplest viable approach chosen: reuse the one `tokeninfo` call the sign-in already makes (fields are free in the same response); store the name as an optional field in the record that already exists; reuse `displayLabel` as the single rendering point. No new dependency, no new storage key, no new client fetch, no profile UI. |
| Free-Plan Budget | ✅ PASS | Sign-in is a rare event (two users); its write count is unchanged (one `HSET` per first sign-in, already happening). Upstash request/storage quotas unaffected at runtime. |

**Gate result**: PASS — no violations, nothing to record in Complexity
Tracking. Post-Phase-1 re-check: PASS (data model adds an optional field
to an existing record; no architectural change).

## Project Structure

### Documentation (this feature)

```text
specs/007-show-user-first-name/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── actions.ts           # signIn gains naming capture; SignInResult.label unchanged shape
├── page.tsx             # vote gate passes record-based label; unchanged structure
└── vote-client.tsx      # renders the passed label — no logic change needed

lib/
├── google-verify.ts     # tokeninfo result gains verified firstName derivation
├── user-store.ts        # UserRecord gains optional firstName; displayLabel prefers it
└── env.ts               # unchanged (no new variables)

tests/
├── unit/google-verify.test.ts        # extended: given_name / name first-word / absent
├── unit/user-store.test.ts           # extended: label precedence, legacy record
└── integration/submit-auth.test.ts   # extended: sign-in persists firstName
```

**Structure Decision**: Existing single Next.js App Router tree; this
feature adds one optional field flowing through `signIn` → `UserRecord` →
`displayLabel` → page props. No new directories, no new modules.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |
