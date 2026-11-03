# Quickstart: Reset Votes and Nominations (014)

Date: 2026-11-03. Validation scenarios for the deployed feature. Live steps
run in the user's environment (Vercel + real Google/Upstash creds);
automated gates (`npm test`, `npm run build`) run locally. References:
[contracts.md](./contracts/contracts.md), [data-model.md](./data-model.md).

**Prerequisites**: Both approved users have signed in at least once (005
flow) and completed their nomination rounds (013 flow), with at least a
few votes cast each; deployed branch.

**Walk-through evidence (2026-11-03)**: V1–V6 were executed locally
against the mock-mode server via `scripts/quickstart-014.mts` (Playwright
driven, all checks pass — see the script header for the exact
invocation). Run against `next start` of a `npm run build` output (same
posture as the 013 quickstart: turbopack dev hydration stalls do not
affect the production build).

## V1 — Reset votes clears only my tally (spec US1 AC1, FR-001/FR-003, SC-001)

1. User X (≥3 votes cast) opens `/`; tap "Stimmen zurücksetzen".
2. **Pass**: inline confirm appears ("Wirklich löschen?"); confirm.
3. Open the ranking view.
4. **Pass**: all 200 names at the neutral bottom rank (empty personal
   tally) in under 5 s end-to-end; X can vote again immediately.

## V2 — Reset votes is per-user (US1 AC2, FR-001/FR-005)

1. Y has votes; X resets X's votes (V1).
2. Y opens their ranking.
3. **Pass**: Y's ranking is unchanged; X's reset never touched Y's keys.

## V3 — Reset nominations returns to a fresh round (US2 AC1, FR-002/FR-004, SC-002)

1. X (round complete) taps "Nominierungen zurücksetzen"; confirm.
2. **Pass**: X is returned to the nomination screen at the first
   canonical-list name, counter "0 von 200", all 200 names undecided, in
   under 5 s; X's vote tally was NOT deleted (votes reset is a separate
   action — FR-005).
3. Complete X's round again (include ≥2 names).
4. **Pass**: X resumes voting normally; prior votes still counted.

## V4 — Reset nominations is per-user (US2 AC2, FR-002/FR-005)

1. Y's round is complete and voting; X resets X's nominations (V3).
2. **Pass**: Y's voting pool, decisions, and votes are unchanged; Y is
   never pulled into a nomination round by X's reset.

## V5 — Reset everything in one action (US3 AC1, FR-006, SC-004)

1. X has both votes and a completed round; tap "Alles zurücksetzen";
   confirm once.
2. **Pass**: X lands in a fresh nomination round ("0 von 200") AND the
   personal tally is empty (ranking: all neutral bottom) — both wiped by
   the single confirmed action, no second confirmation needed.

## V6 — Guard rails (FR-007/FR-009, edge cases)

1. Tap "Stimmen zurücksetzen", then "Abbrechen".
2. **Pass**: nothing is deleted — ranking still shows prior votes.
3. Confirm a reset with zero data of that type (fresh user Z, no votes).
4. **Pass**: no error; the control returns to neutral; the view is a
   valid state (FR-009).

## Automated gates (local, before deploy)

```bash
npm test         # unit + integration suites, including the new
                 # reset-store unit test and reset integration test (R1/R2)
npm run build    # zero type/lint errors (constitution gate)
```
