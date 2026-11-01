# Implementation Plan: Self-Contained Visual Suite — No External Credentials

**Branch**: `012-visual-mocked-deps` | **Date**: 2026-11-01 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from
`/specs/012-visual-mocked-deps/spec.md`

## Summary

Make `npm run visual` run with **zero credentials and zero external
services**: the suite boots `next dev` with a single marker variable
(`VISUAL_MOCK_EXTERNAL=1`, loaded from an optional `.env.visual` that
ships as a committed template — no Upstash account, no Google client, no
Google account). In that mode the dev server strictly substitutes its
two external dependencies at the existing seams and nothing else:

1. **Storage**: a tiny in-memory Redis slotted behind the existing test
   seam `_setClientForTests` — a real `@upstash/redis` client built over
   a custom `Requester` that executes the exact command subset the app
   issues (`xadd`, `zincrby`, `zrange`, `hget`, `hset`, `hgetall`,
   `incr`, `scan`, `del`) against a plain `Map`. Wired once at server
   start via Next.js `instrumentation.ts`; empty and discarded per run.
2. **Sign-in**: a suite-only `POST /internal/visual-signin` route
   handler (registered only when the marker variable is set) that skips
   Google ID-token verification and calls the app's real
   `signIn`-equivalent path for a fixed approved suite identity —
   read-only server actions are passed an injected `idToken`-shaped
   dependency mock resolving the verified suite email/firstName; the
   cookie set is the real `sealSession` value, so every signed-in screen
   renders exactly as production does.

The sign-in step saves the session storage state and the local sign-in
endpoint **always** runs per suite boot (bounded overwrite — no manual
delete). Production and `npm run dev` keep today's behavior unchanged;
in the deployed app the internal route is not registered. All feature
011 scenarios and failure formats (C2.1–C2.7, C3.1/C3.2) keep working
unchanged, and the four 011 screen tests that reference the live
sign-in constant (`session.ts`'s `COOKIE_NAME`) or prod-only slug
(`service-desk` route's slug) keep working; alongside that there are
mock-mode equivalents with the same slugs under a `.mock` infix.

## Technical Context

**Language/Version**: TypeScript 5.x strict; Next.js 16.4.3 (pinned in
`package.json`), React 19; Node 20+; suite under `@playwright/test`
1.64 (already the 011 toolchain, unchanged).

**Primary Dependencies**: No NEW runtime or dev dependency. Reuses:
`@playwright/test` (suite), `@upstash/redis` custom-`Requester`
in-memory backend (pattern documented in the package's own JSDoc),
Next.js `instrumentation.ts` file convention, Playwright
`browser.newContext({ storageState })`.

**Storage**: Suite mode — in-process `Map`-backed Redis emulator inside
the dev server's Node process, created fresh per server boot. Tenancy
unchanged in production (Upstash free tier).

**Testing**: `npm run visual` (Playwright, unchanged invocation and
scenario files — only setup/auth wiring changes); `npm test` unit and
integration suites unchanged; one new unit test for
`createVisualFakeRequester` and one contract-check per chunk (a dead
server route, missing marker variable, etc.).

**Target Platform**: Maintainer's dev machine (macOS/Linux); headless
Chromium; suite-local server on 127.0.0.1 only.

**Project Type**: Existing single-project Next.js web app + dev-only
visual suite (`tests/visual/`) + two dev-only source additions
(`instrumentation.ts`, one internal route handler).

**Performance Goals**: Full suite under 2 minutes (SC-002 budget from
011, unchanged). In-memory store makes vote flows slightly faster than
011's real Redis; nothing slower (sign-in shortcut removes the slowest
200 ms round trip).

**Constraints**: Zero egress beyond localhost in suite mode (SC-001);
zero behavioral drift in production (SC-006); every 011 guarantee
(C2.1–C2.7) and failure format (C3.1/C3.2) preserved byte-for-byte in
suite mode (FR-005); no new dependency (Principle V); no `any`/ts-ignore
(Principle II); API surface additive-only and off by default (FR-004).

**Scale/Scope**: ~6 modified/new suite files + 3 app-side additions
(instrumentation, signer action, internal route); total diff under 400
lines; zero changes to 011's scenario guarantee assertions or failure
messages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | `instrumentation.ts` and the internal route handler are standard App Router file/route conventions per the bundled docs of the pinned Next 16.4.3 (checked against `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` — `register()` runs once at server start in the Node runtime; guard with `NEXT_RUNTIME === "nodejs"`). No pages-router pattern, no deprecated API. |
| II. TypeScript Strictness | PASS | All new files strict-clean, explicit export types, no `any`/`@ts-ignore`; `fakeStore`-side implementation uses a discriminated `Map` union keyed by real variable shapes. |
| III. Proportionate Test-First | PASS | One focused unit test per new behavior: (a) fake requester executes the exact `@upstash` command subset faithfully, (b) mock-mode signin action with injected mock ID token verifies/signs — each test written red against unmodified code first. No scaffolding beyond those two tests (Principle V). |
| IV. Proportionate Integration Testing | PASS | No production critical path touched. The suite itself remains the integration layer for the visual layout as in 011 — a credential-free run IS the direct test against a live `next dev` server. |
| V. Simplicity Is Paramount | PASS | No new dependency. The storage mock reuses the existing `_setClientForTests` seam rather than adding configuration. The auth mock reuses the real `signIn` action with one injected parameter — no parallel code path. All three mock pieces together are the simplest mechanism that satisfies FR-001…FR-008 without weakening what 011 measures (the alternates — local Redis container, system/browser-level fake vending, Playwright route interception alone — are all strictly more moving parts; documented in research R1). |
| Free-Plan Budget | PASS | Zero new services or paid tiers. Suite mode runs a Map'ed in-memory store. Upstash consumption in production unchanged (single writer). |
| Governance note | PASS | Feature 011's C4.2 aspirationally recorded "zero app modifications" for THAT feature's bring-up — this feature's spec (FR-003/FR-004) supersedes it with prior, explicit user approval for a minimal, strictly-additive, guarantee-preserving dev-only mechanism; recorded in research R1 rather than treated as a violation. |

## Project Structure

### Documentation (this feature)

```text
specs/012-visual-mocked-deps/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (suite-scoped entities of 012:
│                        # marker, local session, fake store, mock routes)
├── quickstart.md        # Phase 1 output (how to run the credential-free suite)
├── contracts/           # Phase 1 output (012 mock-layer contract deltas)
├── checklists/          # Spec-kit quality checklist (already present)
├── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
└── [copied-from-011/]   # Reference docs preserved alongside (suite)
```

### Source Code (repository root)

```text
app/
├── commons-visual-mode.ts         # NEW (dev-only, tiny): shared constants —
│                                  # VISUAL_MOCK_EXTERNAL env name, fixed suite
│                                  # identity (email/firstName/uid space), the
│                                  # route-add placement cookie name
├── instrumentation.ts             # NEW (Next.js file convention): register()
│                                  # — when VISUAL_MOCK_EXTERNAL=1: inject the
│                                  # in-memory fake store (Chunk A) BEFORE the
│                                  # first request; zero-op otherwise
├── internal/
│   └── visual-signin/
│       └── route.ts               # NEW: POST handler, registered ONLY in mock
│                                  # mode (returned 404 otherwise); wraps the
│                                  # real signIn action with the injected
│                                  # mock-ID-token dependency (Chunk B)
└── actions.ts                     # MODIFY (smallest possible surface): signIn
                                   # gains one optional injected dependency
                                   # parameter (default: unchanged real verify)

lib/
├── fake-store.ts                  # NEW (dev-only, server-side): the in-memory
│                                  # Upstash `Requester` slotted into
│                                  # _setClientForTests; executes the exact
│                                  # command subset the app uses; get() pinned
│                                  # as the store constructor boundary
└── [existing files]               # UNCHANGED (store.ts keeps its seams)

tests/visual/
├── harness.ts                     # MODIFY: setup only — load marker var, boot
│                                  # server with suite-mode env (no .env.real
│                                  # fallback vars), per-boot local sign-in via
│                                  # storageState (no Google), save storage
│                                  # state (no .env.real fallback), bounded
│                                  # overwrite; measure()/settle()/screenshot()
│                                  # untouched (C2.1–C2.7/FR-005)
├── global-setup.ts                # MODIFY: call the local sign-in instead of
│                                  # Google; store reset removed (mock store is
│                                  # fresh per boot — data-model.md R2 piece)
├── global-teardown.ts             # UNCHANGED shutdown semantics; added write
│                                  # of a tiny "Mock compressed" marker note
│                                  # (diagnostics only, no output contract kept
│                                  # beyond screenshots overwrite rule)
├── seed.ts                        # REWRITE: previously required live Upstash
│                                  # retries + mannual scan-reset; now performs
│                                  # the equivalent O(1) wait for the store's
│                                  # empty-bucket contract (same C3.2 report)
├── playwright.config.ts           # UNCHANGED (env loading moves to harness)
├── smoke.spec.ts / vote-layout.spec.ts / fitting.spec.ts / screens.spec.ts
│                                  # UNCHANGED scenarios — they still verify the
│                                  # same C2.1–C2.7 guarantees: signed-in
│                                  # session storage states and vote cycles are
│                                  # indistinguishable from production at the
│                                  # screen level (data-model.md "Local
│                                  # session" section)
├── guarantees.ts / profiles.ts / runtime.ts   # UNCHANGED
└── .auth-state.json               # still gitignored; now reproducible in-repo
                                   # no extra secrets

.env.example                       # MODIFY: swaps the "real credentials" block
                                   # for the one-line-note about mock mode (the
                                   # template file itself)
.env.visual                        # COMMITTED (policy change, R1): a template
                                   # with VISUAL_MOCK_EXTERNAL=1, PORT=3111, +
                                   # the two dummy store credential values the
                                   # app env contract requires to construct.
package.json                       # UNCHANGED (`npm run visual` exact)
next.config.ts                     # UNCHANGED
```

**Structure Decision**: Existing single-project layout, unchanged. The
spec adds exactly three dev-only files in canonical Next.js positions
(`instrumentation.ts` at root, one internal route subtree, one lib
module) plus small, surgical modifications to the suite's setup layer.
No new dependency; no new npm script; no new `.env` schema beyond one
dummy pair the existing `lib/env.ts` contract already requires.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be
> justified**

*(empty — no violations; the one aspirational tension — 011's "zero app
modifications" — is out-ruled by this feature's own spec per governance
and documented in research.md R1.)*
