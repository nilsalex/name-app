# Visual Verification Contract (011)

Date: 2026-11-01. Defines the interface the visual suite exposes to the
maintainer (commands, configuration, outputs, failure format). The suite
is a dev-only gate; it changes no application interface (the 008–010 UI
contracts are its *input*, asserted — not amended).

## C1 — Commands and configuration

| # | Contract |
|---|---|
| C1.1 | `npm run visual` runs the complete suite headlessly and exits 0 (pass) or non-zero (any assertion failure, setup failure, or crash). No arguments required for the standard run. |
| C1.2 | Configuration lives in `tests/visual/playwright.config.ts` and `.env.visual` (gitignored: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STORE_KEY_PREFIX=namewahl-visual-test`, `GOOGLE_CLIENT_ID`, `APPROVED_EMAILS`, `SESSION_SECRET`, `VISUAL_TEST_EMAIL`, `VISUAL_TEST_PASSWORD`). Missing variables fail fast with a message naming the variable. |
| C1.3 | The suite starts its own dev server (port from `.env.visual`, default 3111) with the `.env.visual` environment; a pre-existing server on that port fails setup with a clear message. |
| C1.4 | First-time bring-up: `npx playwright install chromium` (one-time browser download) and a headed first sign-in may be required (research R2) — documented in quickstart, never needed per-run. |

## C2 — Assertion surface (what a green run proves)

A green run proves, per the guarantee modules in `tests/visual/guarantees.ts`:

| # | Guarantee family | Profiles |
|---|---|---|
| C2.1 | Side-by-side pair, separator between, no wrap (008) | 320 / 375 / 430 |
| C2.2 | Static equal halves: pair-to-pair rect identity ≤ 1 px; equal halves; row fills available width, 24 px margin only (009/010) | 320 / 375 / 430 |
| C2.3 | Fitting chain: one line, no ellipsis for current names, dominant name type (FR-004) | 320 / 375 / 430 (+1280 for 40 px cap) |
| C2.4 | No horizontal scroll, no clipped/overlapping elements on `/` (signed in + logged out), `/ranking`, `/winners` | 320 + per-screen set |
| C2.5 | Landscape: vertical page scroll only; pair never clips mid-box | 740 × 360 |
| C2.6 | Desktop/tablet coherence: equal boxes, proportional dominant type, one centered composition | 1280, 640, 768 |
| C2.7 | Notice stability: boxes unmoved/unresized (≤ 1 px) across notice appear/disappear (via request interception, research R5) | 320 |

## C3 — Failure format

| # | Contract |
|---|---|
| C3.1 | Every assertion failure message names the violated guarantee family (C2 table wording), the profile, and the measured vs expected numbers (e.g., `maximality: row right gap 41 px > 24 px margin at 320×568`). |
| C3.2 | Setup failures (missing env var, port in use, sign-in failure, store unreachable) are reported as setup errors distinct from guarantee failures, naming the fix (FR-009, quickstart "Prerequisites"). |
| C3.3 | A passing run prints a per-profile summary (profiles × scenarios passed). |

## C4 — Outputs and side effects

| # | Contract |
|---|---|
| C4.1 | On a green run, full-page screenshots of the key states/profiles are written to `tests/visual/screenshots/` (gitignored) as the input for the FR-011 agent judgment review. |
| C4.2 | The suite writes ONLY to the `namewahl-visual-test:*` key namespace and `tests/visual/screenshots/`; it never modifies `app/`, `lib/`, or existing test files (stylesheet-only guarantee inherited: bring-up regression injections are temporary and reverted). |
| C4.3 | The suite is not part of `npm test` (separate gate per plan R6); `npm test`, `npx tsc --noEmit`, and `npm run build` remain unchanged and must stay green. |

## C5 — Agent judgment review gate (FR-011/SC-007)

| # | Contract |
|---|---|
| C5.1 | Task completion requires: suite green + agent review of the C4.1 screenshot set with verdict recorded (pass, or findings with follow-ups). A red suite or an unapproved agent review blocks completion. |
