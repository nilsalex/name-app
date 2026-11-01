# Contracts: Self-Contained Visual Suite — No External Credentials (012)

Date: 2026-11-01. Feature 011's contract (`specs/011-playwright-visual-
verification/contracts/visual-suite.md`) remains the suite's user-facing
contract — C1.1 (single command), C2.1–C2.7 (assertion surface),
C3.1/C3.3 (failure/summary formats), C4.1/C4.2 (outputs/isolation)
continue to hold, with the configuration changes below. This file
documents the deltas and the new internal interfaces the mock layer
exposes.

## C1 (amended) — Commands and configuration

| # | Contract |
|---|---|
| C1.1 | **Unchanged**: `npm run visual` runs the complete suite headlessly; exit 0 / non-zero; no arguments. |
| C1.2 (amended) | Configuration lives in `.env.visual` (committed template — see below) and `tests/visual/playwright.config.ts`. Suite-mode required variables: `PORT` (default 3111), `VISUAL_MOCK_EXTERNAL=1`, `APPROVED_EMAILS` (the suite identity), `SESSION_SECRET` (≥32 bytes). The suite sets the dummy storage pair and `STORE_KEY_PREFIX` itself. Missing variables fail fast naming the variable (C3.2 shape). |
| C1.3 | **Unchanged**: the suite boots its own dev server on its port; port occupied → same named setup error. |
| C1.4 | First-time bring-up: `npx playwright install chromium`, unchanged. **Google sign-in bring-up is removed entirely** — no headed-Google fallback, no `VISUAL_TEST_EMAIL`/`VISUAL_TEST_PASSWORD`, no real Upstash credentials anywhere in the suite. |

**`.env.visual` file policy (changed from 011)**: the file becomes a
committed template (no secrets exist in it — only `SESSION_SECRET`,
which is suite-local by definition and never valid in production, the
mock marker, the port, and the suite identity). Contributors clone the
repo and run the suite without editing it. `SESSION_SECRET` being in a
committed file is safe here because the suite's server is ephemeral and
localhost-only; production always uses the Vercel-stored secret.

## C2 — Assertion surface

**Unchanged.** C2.1–C2.7 (side-by-side, static equal halves, fitting
chain, cross-screen rules, landscape, desktop/tablet coherence, notice
stability) hold identically in mock mode: the mock layer stores state
and issues sessions — it does not touch rendering, CSS, or measurement
(research R1/R2). The 011 guarantees keep their exact names, profiles,
and numeric message formats.

## C3 — Failure format

| # | Contract |
|---|---|
| C3.1 | **Unchanged**: guarantee violations name guarantee + profile + measured numbers. |
| C3.2 (extended) | Setup errors are distinct named errors (`[visual-setup]` prefix, fix named). Existing ones (missing env var, port occupied, server not ready) keep their exact 011 text. New ones (see C6) — missing marker variable, mock boot canary failure, internal sign-in endpoint unreachable/non-OK — follow the same shape. |
| C3.3 | **Unchanged**: green run prints per-profile summary. |

## C4 — Outputs and side effects

| # | Contract |
|---|---|
| C4.1 | **Unchanged**: screenshots to `tests/visual/screenshots/`, overwritten per run. |
| C4.2 (amended wording) | The suite writes ONLY to its own ephemeral in-memory store, its screenshots dir, and its (gitignored) storage-state file; external services are never contacted. The 011 "never modifies app/ or lib/" rule narrows to "never modifies app/ or lib/ **beyond the additive dev-only files this feature introduces**" — the 008–010 layout/CSS and all production behavior are untouched (FR-004/SC-006). |
| C4.3 | **Unchanged**: not part of `npm test`; `npm test`/`npx tsc --noEmit`/`npm run build` stay green. |

## C6 (new) — Mock-layer internal contracts

These are internal to the suite's own bootstrapping; they exist so the
suite can fail fast and so future maintainers can audit the seams.

| # | Contract |
|---|---|
| C6.1 | **Marker variable**: `VISUAL_MOCK_EXTERNAL=1` and only `=1` enables mock mode. It MUST be present in the dev server child-process env booted by the suite and MUST NOT be present in any production or manual dev invocation. Both `app/instrumentation.ts` and the internal sign-in route check it independently (double guard). |
| C6.2 | **Store injection**: in mock mode, store commands execute against the in-process fake (data-model.md command table) slotted via the existing `_setClientForTests` seam before the first request; the fake throws loudly (caught as C3.2 setup error by the canary) on any command outside its 9-verb surface. Dummy upstash credentials (`https://mock.invalid` / `mock-token`) satisfy the env contract and would fail loudly if ever actually contacted — never silently guessed around. |
| C6.3 | **Suite identity**: the only identity the mock sign-in path can issue is the fixed suite record (`.invalid` email, fixed firstName) — approved via `APPROVED_EMAILS` in the suite env; no parameters on the endpoint; non-allowed identities cannot be minted because there are no parameters to mint them with. |
| C6.4 | **Internal endpoint**: `POST /internal/visual-signin` returns 200 with a real app-format `Set-Cookie` session for the suite identity when the marker variable is set; 404 otherwise. It is not documented in user-facing docs beyond this contract file. |
| C6.5 | **Storage state protocol**: global-setup always POSTs the endpoint once per boot, asserts the canary 200 + `Set-Cookie`, then persists the session as Playwright storage state (overwritten each boot). Scenarios continue to load it exactly as in 011. |
| C6.6 | **Production invariance (SC-006)**: without the marker variable this feature's additions are unreachable/inert — `instrumentation.register()` returns without loading the mock seam, the internal route returns 404, and `signIn` uses its unchanged default verifier. No app file reads any suite-only value in any non-mock path. |

## Out of scope (unchanged from 011)

- CI: no continuous integration; the maintainer runs the suite
  pre-ship (011's FR-012).
- Agent judgment review gate: C5.1 continues to apply (screenshot set
  + agent verdict) — unchanged by this feature.
