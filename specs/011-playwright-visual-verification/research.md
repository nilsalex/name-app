# Research: Playwright Visual Verification of Designs (011)

Date: 2026-11-01. Resolves the open technical questions for the visual
verification suite. Constraints: dev-only surface, zero app-code changes,
free-plan budget, simplicity paramount (Principle V), suite stability
(SC-004) and <2 min runtime (SC-002).

## R1: `playwright` library vs `@playwright/test` runner?

**Decision**: Use the **`@playwright/test` runner** with a `playwright.config.ts`
scoped to `tests/visual/`, invoked via `npm run visual`
(`playwright test --config tests/visual/playwright.config.ts`).

**Rationale**: The runner ships exactly the pieces the spec needs already
built and battle-tested: browser lifecycle per worker, viewport fixtures,
`page.route()` for the notice test (spec Q4), per-test failure naming
(FR-009), `expect.poll`/auto-waiting for settle (FR-010), retries-off
determinism, and a per-suite summary out of the box. Hand-rolling this on
the raw `playwright` library would rebuild ~all of it in `run.ts` — the
runner is the simpler total system (Principle V). It is still one dev
dependency: `@playwright/test` includes the `playwright` library.

**Alternatives considered**:
- *Raw `playwright` library + custom `run.ts` runner* — rejected: rebuilds
  fixtures, waiting, reporting, and config; more code to maintain, and the
  "single command" (FR-001) still needs a runner script.
- *`@vitest/browser` or Cypress* — rejected: new runner paradigm for the
  repo, heavier; no advantage for measurement-only checks.

## R2: How does the suite sign in, given Google sign-in?

**Decision**: Perform a **real Google sign-in once per suite run** using
test credentials stored in `.env.visual` (`VISUAL_TEST_EMAIL` +
`VISUAL_TEST_PASSWORD`), driving the real GIS popup flow in the headless
browser; the sealed session cookie is then captured and reused (storage
state) across all scenarios and workers. **No app-code backdoor** (spec
Q4 spirit): the production auth path is itself part of what "the screens
look right" means (signed-in state renders VoteClient, not LoginClient).

Google blocks fully headless Chromium sign-ins more aggressively than
headed ones; the sign-in step therefore may run headed (CI-less local
suite — always a desktop available) or use a persistent browser profile
that keeps the Google session warm between runs. First bring-up decides
empirically; the spec requires only that the mechanism be "a local
development-mode sign-in path or local credentials" (spec Assumptions) —
both options satisfy it without app changes.

**Rationale**: Zero app changes; exercises the real auth path; one
sign-in per run keeps runtime in budget (SC-002).

**Alternatives considered**:
- *Test-only sign-in server action / magic env flag* — rejected: ships a
  test hook in product code (explicitly excluded by spec Q4 decision).
- *Manually minting a session cookie via a helper script* — rejected:
  duplicates `sealSession` logic outside the app and skips the real path;
  a maintenance liability for marginal time savings.

## R3: How is the dedicated test store realized, and how is "seeded known state" achieved?

**Decision**: `.env.visual` sets `STORE_KEY_PREFIX=namewahl-visual-test`
alongside the real Upstash credentials (same free-tier instance, isolated
key namespace). Before each suite run, `seed.ts` (a setup project)
resets the test namespace: scans and deletes `namewahl-visual-test:*`
keys (Redis `SCAN` + `DEL`), then re-seeds the minimum state: nothing is
strictly required (scores/seen zsets are read-only views that tolerate
absence — uniform selection degenerates per pairing.ts), but the user
record for the test identity is created on first sign-in automatically
(`resolveUser`). Vote streams grow during the run and are wiped on the
next run's reset — pool exhaustion (200-name pool, a few hundred votes
per run) cannot occur; SC-004 repeatability comes from the reset.

**Rationale**: Reuses the app's existing `STORE_KEY_PREFIX` seam — zero
app changes, production isolated by construction (a wrong-prefix write
would have to target `namewahl:` explicitly, and no suite code ever
omits the prefix because every store key flows through `lib/store.ts`).

**Alternatives considered**:
- *Separate local Redis (docker)* — rejected: extra moving part for no
  isolation gain; key-prefix separation on the same instance is already
  airtight for this app's access pattern.
- *Mocking the store layer* — rejected: would require app-code seams
  (excluded by Q4) and would fake the very persistence behavior whose
  UI-effects (notice flow) we verify.

## R4: How are measurements taken so they are stable (SC-004) yet meaningful?

**Decision**: All guarantees are computed from **`getBoundingClientRect()`
plus `Range`-based line measurement and `document.scrollingElement`
widths**, read inside `page.evaluate()` after an explicit settle step.
Stability measures: (a) wait for `document.fonts.ready`; (b) two
consecutive `requestAnimationFrame`s; (c) re-read the measured rect and
proceed only when two reads agree within the 1 px tolerance (FR-003), else
one more frame then fail loudly; (d) Playwright's built-in actionability
waiting for element presence. Fonts are Geist Sans via `next/font` —
self-hosted, no network font fetch flake. Animations: the only transform
is the 0.08s `:active` scale — never active during measurement (no
pointer held); the transition is disabled during measurement by moving
the mouse to (0,0) before reading.

**Rationale**: Deterministic reads + settle protocol = the 10/10
stability requirement without loosening the guarantees to worthlessness.

**Alternatives considered**:
- *Screenshot pixel-diffing* — rejected by spec Q1 (baseline maintenance,
  font/AA flake).
- *Blind fixed sleeps* — rejected: either too slow or too racy; the
  settle protocol is both faster and stricter.

## R5: How is the failure notice produced for FR-007 without app hooks?

**Decision**: `page.route('**/api/**', route => route.abort())`-style
**request interception in the test browser only** (precisely: abort the
POST that server actions issue, identified by URL pattern, after
sign-in). The vote-sender's bounded retry exhausts against aborted
requests, the notice appears (feature 003); unroute → tap again → send
succeeds → notice dismissed path verified. Box geometry is captured
immediately before abort, at notice-visible, and after dismissal;
equality within 1 px is asserted across all three (M3.1 analog).

**Rationale**: Deterministic, repeatable within one run, zero app-code
hooks (spec Q4), and it exercises the real client retry/notice logic.

**Alternatives considered**:
- *Stopping the store/Redis mid-run* — rejected: crude, slow recovery,
  affects everything (collateral failures pollute FR-009 messaging).
- *App test hook* — excluded by spec Q4.

## R6: Does the visual suite join the existing `tsconfig.json` type-check gate?

**Decision**: Yes — `tests/visual/**` is included in the project
`tsconfig` (the existing tsconfig already covers `tests/`), so
`npx tsc --noEmit` type-checks the suite; the suite must pass tsc like
all other code (Constitution II). Playwright config/test files carry
proper types; the only new ambient types come from `@playwright/test`
itself. The suite is NOT part of `npm test` (Constitution III/IV: it is
a separate, explicitly-run gate `npm run visual`).

**Rationale**: Type safety without a second tsconfig; clear separation
of the fast unit gate from the slower visual gate.

**Alternatives considered**:
- *Separate `tsconfig.visual.json`* — rejected: divergent config for no
  benefit; one strict gate is simpler.

## R7: How does the AI agent visual judgment review (FR-011/SC-007) work concretely?

**Decision**: After a green suite run, the runner saves full-page
screenshots of the key states/profiles (voting screen at each portrait
profile, landscape, desktop, /ranking, /winners, logged-out, notice
state) into `tests/visual/screenshots/` (gitignored). The implementation
tasks then conclude with an agent-review task: the agent loads the
screenshots as images, judges proportions/balance/coherence against the
008–010 intent, and records the verdict (pass or findings) in the tasks
file/checkpoint note. Only an agent-approved state completes the tasks
(FR-011). The suite's own green run is necessary but not sufficient.

**Rationale**: Screenshots already exist as a byproduct of a Playwright
run; the agent review catches aesthetic regressions numbers cannot name
— exactly what spec Q1's addendum demands, with zero extra tooling.

**Alternatives considered**:
- *Structured numeric "beauty" scores* — rejected: pseudo-precision;
  judgment is the point.
- *Skipping screenshots since assertions passed* — rejected: FR-011
  requires the agent to SEE the rendered screens.

## R8: Which regressions are injected for SC-003 bring-up validation?

**Decision**: The four named injections, applied temporarily during
bring-up (T-phase), each verified to fail with the right message, then
reverted: (1) re-add `max-width: 44vw` to `.nameButton` → maximality
assertion fails at 375/430 px; (2) `white-space: normal` on
`.nameButton` → single-line assertion fails for long names; (3) change
`flex: 1 1 0` to `flex: 1 1 auto` → static-equality assertion fails
across pairs with different name lengths; (4) set `.voteArea`/body
`overflow-x: visible` + oversized child → horizontal-scroll assertion
fails at 320 px. Each injection is a one-line CSS change — quick, and it
validates the failure MESSAGES too (FR-009), not just failure occurrence.

**Rationale**: One-line injections are fast to apply/revert and map 1:1
to the four SC-003 bullets.

**Alternatives considered**:
- *Automated permanent "chaos" tests that self-inject* — rejected:
  permanent test-the-tests machinery (Principle V); SC-003 is a one-time
  bring-up validation, documented in quickstart for future re-runs.

## R9: Runtime budget — is <2 minutes (SC-002) realistic?

**Decision**: Yes, with the shared-storage-state design (R2/R3).
Estimated: sign-in (once, ≤20 s) + 7 profiles × 2–3 page loads
(~3 s each, dev-server compile warm after first) + settle waits (ms) +
notice scenario (~10 s) + reset/seed (~2 s) ≈ 60–90 s. First-ever run
adds one-time `playwright install chromium` and Next.js dev compile of
each route — accepted as bring-up, not per-run cost (documented in
quickstart).

**Rationale**: Arithmetic from per-navigation costs; budget holds
without parallelism tricks; `fullyParallel` workers each reuse the
captured storage state.

**Alternatives considered**:
- *`next build && next start` (production server) for the suite* —
  rejected for daily use: slower iteration; `next dev` reflects the
  code being written. Quickstart notes a production-server variant as
  an optional pre-ship double-check.
