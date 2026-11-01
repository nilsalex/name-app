# Implementation Plan: Playwright Visual Verification of Designs

**Branch**: `011-playwright-visual-verification` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-playwright-visual-verification/spec.md`

## Summary

Build a local Playwright suite (`npm run visual`) that renders the real app
in a headless Chromium, measures the rendered layout numerically, and
asserts the accumulated design guarantees of features 008–010: side-by-side
unwrapped pair boxes with the "oder" separator (008), static equal halves
pixel-identical across pairs within 1 px (009/010), maximality (row fills
the available width, 24 px margin only), the fitting chain (one line, no
ellipsis, dominant type), plus cross-screen regression rules (`/` logged
out, `/ranking`, `/winners`, landscape, desktop/tablet coherence) and the
failure-notice stability (produced by intercepting the vote request in the
test browser). Runs against `next dev` with a dedicated test store
(separate key prefix), a real Google sign-in, and a seeded pool state.
Before the implementation tasks are marked finished, an AI agent performs
a visual judgment review of screenshots taken by the suite and its verdict
is recorded (FR-011/SC-007). No CI; the maintainer runs the suite before
shipping (FR-012).

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (pinned), React 19, Node 20+; suite runs under `tsx`/`node:test`-style conventions already used by the repo, driving Playwright programmatically (no `@playwright/test` runner unless research shows it is simpler — R1)

**Primary Dependencies**: `playwright` (new DEV dependency, pinned; browsers installed once via `npx playwright install chromium`); no runtime dependency changes — the app itself is untouched

**Storage**: Upstash Redis free tier, reached through a **dedicated test key prefix** (`STORE_KEY_PREFIX=namewahl-visual-test`, read from `.env.visual`); `lib/store.ts` already derives every key from `PREFIX = process.env.STORE_KEY_PREFIX ?? "namewahl"` — the suite points the dev server at a test prefix so test votes/tallies never mix with development or production data (spec Q3, FR-008)

**Testing**: Playwright-driven measurement assertions (a new `tests/visual/` suite, NOT part of `npm test` — styling/layout is exempt from the unit gate per Constitution III/IV; the suite is its own gate `npm run visual`); the existing 141-test unit/integration gate stays unchanged

**Target Platform**: Maintainer's development machine (macOS/Linux, Node 20+), headless Chromium rendering `next dev` on localhost; viewports 320×568, 375×667, 430×932 portrait, 740×360 landscape, 640/768 spot checks, 1280 desktop (spec Assumptions)

**Project Type**: Next.js App Router web app (existing single-project layout) + a new dev-only visual test suite (`tests/visual/`)

**Performance Goals**: Full suite under 2 minutes (SC-002); assertions measure rendered geometry with sub-ms cost — the budget is dominated by page loads (~7 viewports × 2–3 navigations) and font/render settle waits

**Constraints**: Zero writes to production store (FR-008/SC-005, enforced by prefix isolation, not by care); no app-code test hooks (spec Q4); suite stability — 10/10 identical runs (SC-004) via explicit font/render settle waits and the 1 px tolerance (FR-003); single command `npm run visual`; deterministic pair control where needed via seeded store state rather than app changes

**Scale/Scope**: One new dev-only suite (~8–10 scenario files), one new npm script, one new dev dependency, one new env file; zero changes to `app/`, `lib/`, or existing tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | The suite is an external observer: it drives the real app over HTTP and never imports app internals or Next.js APIs; no pages-router patterns, no deprecated APIs |
| II. TypeScript Strictness | PASS | The suite is TypeScript, type-checked by the project `tsconfig` (scope decision R6), no `any`/`@ts-ignore`; public helper signatures explicitly typed |
| III. Proportionate Test-First | PASS | The feature IS a test suite; it tests CSS/layout behavior that unit tests cannot reach. The suite itself is verified via SC-003's one-time regression injection during bring-up, documented in quickstart — not as a permanent meta-test (Principle V: no test-the-tests scaffolding) |
| IV. Proportionate Integration Testing | PASS | No critical server paths touched; the suite is read-only over HTTP against a real dev server, which is the natural integration point for visual layout |
| V. Simplicity Is Paramount | PASS | One dev dependency (Playwright), one script, one env file, one new directory. Chose measurement assertions over pixel-diff baselines (spec Q1) — no baseline-image maintenance. Chose real Google sign-in over an app test-backdoor (spec Q4 spirit). Reuses the existing `STORE_KEY_PREFIX` seam instead of adding new app configuration |
| Free-Plan Budget | PASS | All browser/traffic is local; test store is the existing free-tier Redis reached with a distinct key prefix — a few hundred extra keys at most, zero production traffic. No paid services |

**Post-Phase-1 re-check** (after research.md / data-model.md / contracts):
PASS — design stays external-observer-only: zero changes to `app/`, `lib/`,
existing tests, or runtime deps; the only new surface is dev-only
(`tests/visual/`, `.env.visual`, one script, one devDependency).
Complexity Tracking stays empty. (Recorded 2026-11-01.)

## Project Structure

### Documentation (this feature)

```text
specs/011-playwright-visual-verification/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (suite-side model: profiles, scenarios, store seeding)
├── quickstart.md        # Phase 1 output (bring-up + daily-use validation guide)
├── contracts/           # Phase 1 output (visual-suite command & assertion contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
tests/
├── unit/                # UNCHANGED (141 existing tests stay the unit gate)
├── integration/         # UNCHANGED
└── visual/              # NEW: Playwright visual verification suite (dev-only)
    ├── harness.ts       # server/session/page helpers: launch, sign in,
    │                    # goto, settle, measure (typed)
    ├── profiles.ts      # viewport profile constants (320/375/430/740×360/
    │                    # 640/768/1280) + tolerance constants (1 px)
    ├── guarantees.ts    # the 008–010 guarantee assertions as small typed
    │                    # functions over measurements (single source used
    │                    # by all scenarios; failure messages name the
    │                    # guarantee + profile — FR-009)
    ├── seed.ts          # test-store seeding/reset via the prefix-isolated
    │                    # Redis connection (known pool state per run)
    ├── screenshots/     # output dir (gitignored) for the agent review step
    ├── vote-layout.spec.ts    # US1/US2 core: 008/009/010 guarantees at
    │                    # 320/375/430; staticity across consecutive pairs
    ├── fitting.spec.ts  # FR-004 chain: one line, no ellipsis, dominant type
    ├── screens.spec.ts  # US3: /, /ranking, /winners, logged-out; landscape;
    │                    # desktop/tablet coherence; notice stability
    └── run.ts           # entry point wired to `npm run visual`: boots the
                         # dev server with .env.visual, runs scenarios,
                         # prints per-profile summary, writes screenshots
                         # for the agent review, exits non-zero on failure

app/                     # UNCHANGED (zero production code changes)
lib/                     # UNCHANGED
.env.visual              # NEW (gitignored): PORT, STORE_KEY_PREFIX, real
                         # GOOGLE_CLIENT_ID, APPROVED_EMAILS, SESSION_SECRET
package.json             # MODIFY: scripts.visual + devDependency playwright
.gitignore               # MODIFY: tests/visual/screenshots/, .env.visual
```

**Structure Decision**: Existing single-project layout retained. The
feature's identity is a new dev-only `tests/visual/` directory following
the repo's existing `tests/unit` + `tests/integration` convention, plus
one script and one dev dependency. The app itself is observed, never
modified.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(empty — no violations)*
