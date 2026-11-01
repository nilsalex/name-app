# Quickstart: Playwright Visual Verification of Designs (011)

Date: 2026-11-01. Validation guide for feature 011. The feature IS a
verification suite, so this guide covers (A) bringing the suite up for
the first time, (B) the daily pre-ship habit, (C) the one-time SC-003
regression-injection validation, and (D) the FR-011 agent review that
completes the feature.

## Prerequisites

- Node 20+, dev server dependencies installed (`npm install`).
- `.env.visual` created from `.env.example`-style values (never
  committed): real `UPSTASH_REDIS_REST_URL`/`TOKEN` (same free-tier
  instance as dev is fine — the prefix isolates it),
  `STORE_KEY_PREFIX=namewahl-visual-test`, real `GOOGLE_CLIENT_ID`,
  `APPROVED_EMAILS` containing the test identity,
  `SESSION_SECRET`, and `VISUAL_TEST_EMAIL` + `VISUAL_TEST_PASSWORD`
  for a real Google sign-in (research R2).
- One-time: `npx playwright install chromium`.
- Nothing may listen on the visual port (default 3111).

## A — Bring-up (first run only)

1. `npm run visual` → first run compiles routes and (possibly) opens a
   headed window for the one-time Google sign-in (research R2); the
   session is captured and reused headlessly afterwards.
2. **Pass**: suite exits 0 with a per-profile summary (contract C3.3);
   `tests/visual/screenshots/` populated (C4.1).
3. Verify isolation: inspect Redis — all written keys start with
   `namewahl-visual-test:`; `namewahl:*` (dev/production) untouched
   (SC-005).

## B — Daily pre-ship habit

1. Make the layout change; `npm test`, `npx tsc --noEmit`,
   `npm run build` stay green (C4.3).
2. `npm run visual` → **Pass**: exit 0, per-profile summary, no skipped
   guarantees; screenshots refreshed.
3. Glance at the screenshots (the agent review, D) — numbers green +
   visual judgment = ship.

## C — SC-003 regression-injection validation (one-time, re-runnable)

Apply each one-line CSS injection (research R8), run `npm run visual`,
confirm the named failure, then revert:

| Injection (temporary edit to `app/page.module.css`) | Expected failure |
|---|---|
| `.nameButton { max-width: 44vw; }` | maximality fails at 375/430 px |
| `.nameButton { white-space: normal; }` | one-line rule fails for long names at 320 px |
| `.nameButton { flex: 1 1 auto; }` | staticity/equality fails across pairs of different name lengths |
| `overflow-x: visible` + an oversized child | horizontal-scroll rule fails at 320 px |

**Pass**: each run exits non-zero, and the message names the guarantee
family + profile + measured numbers (C3.1). Revert each injection
afterwards and confirm a green run.

## D — FR-011 agent judgment review (completes the feature)

1. After a green run, load `tests/visual/screenshots/*` as images.
2. Judge: proportions and balance of the enlarged pair at each profile,
   separator legibility, desktop coherence (not "two islands"),
   notice-state composition.
3. Record the verdict (pass / findings) in the tasks file.
   **Pass**: agent approves — the tasks may then be marked finished
   (C5.1). A red suite or unapproved review blocks completion.

## Done

Suite green (A/B) + injections validated (C) + agent review passed (D)
⇒ contracts/visual-suite.md holds ⇒ FR-001…FR-012 satisfied.
