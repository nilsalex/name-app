# Implementation Plan: Gmail Login

**Branch**: `004-gmail-login` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-gmail-login/spec.md`

## Summary

Replace the manual "Person A / Person B" localStorage identity picker with a
real Google (Gmail) login. The user signs in with Google on the app's entry
route; the server verifies the Google-issued identity token, checks the
address against two secret allowlist environment variables, and sets a signed
session cookie that maps the account to its existing alias ("A"/"B"). The
vote screen becomes reachable only with a valid session, and `submitVote`
trusts only the server-derived alias from the session — never client input.
Ranking/winners and all vote-record shapes stay unchanged.

Technical approach (from research): Google Identity Services (GIS) button in
the browser produces a Google ID token; a server action verifies it via
Google's `tokeninfo` endpoint (aud + email checks) — no new npm packages.
The session is a stateless HMAC-SHA256-signed cookie built with Node's
built-in `node:crypto` (per the pinned Next.js auth guide's stateless-session
pattern, substituting a hand-rolled seal for the suggested libraries since
our session payload is two fields). With `cacheComponents` enabled, the
session read sits behind a `<Suspense>` boundary per the bundled
"Authentication with Cache Components" guide.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (App Router, `cacheComponents: true`), React 19, Node 24 (dev/test)

**Primary Dependencies**: next, react (existing); Google Identity Services loaded as a script tag (browser); Google `tokeninfo` HTTPS endpoint (server-side verification); `node:crypto` (built-in, session sealing). NO new npm dependencies.

**Storage**: Upstash Redis free tier (existing keys `namewahl:votes`, `namewahl:scores` — unchanged). New secrets in environment: `GOOGLE_CLIENT_ID`, `APPROVED_USER_A_EMAIL`, `APPROVED_USER_B_EMAIL`, `SESSION_SECRET` (per clarified spec: approved addresses are secret environment variables; alias mapping lives in the same secret config).

**Testing**: `node:test` via `tsx` (`npm test`); unit tests for pure modules (session seal/unseal, alias mapping, token verification logic); integration test only for the critical auth-gated path (per constitution Principle IV: route/page implementing core feature + server-action authorization).

**Target Platform**: Modern desktop/mobile browsers (Vercel Hobby deployment), Google accounts

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: Returning approved user → vote screen < 5 s (SC-001); first sign-in completes < 60 s (SC-002); session check adds no perceptible latency (stateless cookie verify, O(1) HMAC)

**Constraints**: Free-plan only — Google sign-in and tokeninfo endpoint are free/unmetered at two users; session stateless (no extra Redis reads per request); emails never stored in vote records (FR-008); alias attribution byte-compatible with existing data (FR-005/SC-006)

**Scale/Scope**: Exactly two approved users; changes confined to the app entry (`/`), one new server module for auth, one client login component, and the server-action authorization path; ranking/winners pages untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Session/cookie handling follows the pinned Next.js auth guide (stateless sessions via `cookies()` API, HttpOnly/Secure/SameSite options) and the Cache Components auth guide (session read behind `<Suspense>`, no `cookies()` in prerender paths). No pages-router patterns, no deprecated APIs. |
| II. TypeScript Strictness | PASS | New auth module fully typed, explicit exports, no `any`/suppressions planned. |
| III. Proportionate Test-First | PASS | One focused unit suite per new pure module (`session`, `google-verify`, `users` allowlist), written before implementation; login UI wiring covered by build + quickstart (UI-only, per Principle IV styling/UI exemption). |
| IV. Proportionate Integration Testing | PASS | One new critical path: the vote screen gate + `submitVote` session authorization. Covered by ONE integration test (unauthenticated submit is rejected; session alias is used, not client input). Ranking/winners unchanged — no new tests there. |
| V. Simplicity Is Paramount | PASS | No auth library (Auth.js et al.) — two users, one provider, one route. Hand-rolled HMAC session (≈30 lines) instead of iron-session/jose dependency; Google token verification via tokeninfo endpoint instead of a JWT library. Zero new npm packages. Each rejected dependency is justified in research.md. |
| Free-Plan Budget | PASS | Google sign-in + tokeninfo: free, unmetered, ~1 call per login (rare). Session: stateless, no per-request Redis cost. Vote write volume unchanged (1 pipeline write per vote). No paid services. |

**Post-Phase-1 re-check**: PASS — see Complexity Tracking (empty; the
auth-module split is the simplest form that keeps session logic pure and
unit-testable).

## Project Structure

### Documentation (this feature)

```text
specs/004-gmail-login/
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
├── session.ts           # NEW: stateless signed session cookie (server-only)
│                        #   — seal/unseal via node:crypto HMAC, pure helpers
├── google-verify.ts     # NEW: Google ID token verification (tokeninfo call,
│                        #   aud/email/expiry checks) — server-only
├── users.ts             # NEW: approved-address → alias mapping from secret
│                        #   env vars; fail-fast on missing/malformed config
├── user.ts              # REMOVED (superseded by session-based identity)
├── pairing.ts           # existing pure weighted draw (unchanged)
├── pair-queue.ts        # existing pair reserve (unchanged)
├── vote-sender.ts       # existing vote dispatch queue (unchanged)
├── store.ts             # existing Upstash persistence (unchanged)
├── names.ts             # existing name list (unchanged)
├── ranking.ts           # existing ranking (unchanged)
└── env.ts               # existing secret-env access (unchanged)

app/
├── actions.ts           # MODIFIED: submitVote takes NO user argument —
│                        #   derives alias from the session server-side;
│                        #   NEW: signIn(idToken) and signOut() actions
├── page.tsx             # MODIFIED: server component reads session (behind
│                        #   Suspense), renders LoginClient or VoteClient
├── login-client.tsx     # NEW: client component hosting the GIS button,
│                        #   sends the resulting ID token to signIn()
├── vote-client.tsx      # MODIFIED: receives alias as a prop (no more
│                        #   localStorage identity pick), adds sign-out button
├── ranking/, winners/   # unchanged (public pages)
└── page.module.css      # MINOR: styles for login button + sign-out

tests/
├── unit/
│   ├── session.test.ts      # NEW: seal/unseal round-trip, tamper rejection,
│   │                        #   expiry
│   ├── google-verify.test.ts# NEW: token acceptance/rejection logic (fake
│   │                        #   fetch), aud/email/expiry checks
│   ├── users.test.ts        # NEW: alias mapping, fail-fast on bad config
│   ├── pairing.test.ts      # existing (unchanged)
│   ├── pair-queue.test.ts   # existing (unchanged)
│   ├── vote-sender.test.ts  # existing (unchanged)
│   └── ranking.test.ts      # existing (unchanged)
└── integration/
    └── store.test.ts        # existing (unchanged); one NEW auth-gate
                             #   integration test accompanies tasks (see
                             #   contracts/contracts.md test requirements)
```

**Structure Decision**: Existing single-project Next.js layout is retained.
Auth logic lives in `lib/` as pure, server-only modules (unit-testable
without React); the entry route composes session → login/vote UI; the server
action layer enforces authorization at the data boundary (DAL pattern from
the bundled auth guide).

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
