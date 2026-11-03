# Quickstart: Name Nomination Round (013)

Date: 2026-11-03. Validation scenarios for the deployed feature. Live steps
run in the user's environment (Vercel + real Google/Upstash creds);
automated gates (`npm test`, `npm run build`) run locally. References:
[contracts.md](./contracts/contracts.md), [data-model.md](./data-model.md).

**Prerequisites**: Both approved users have signed in at least once (005
flow); deployed branch. Fresh Upstash DB or a key prefix without
`nominations` keys so both users start with incomplete rounds.

**Walk-through evidence (2026-11-03)**: V1–V5/V7 and V6 were executed
locally against the mock-mode server via `scripts/quickstart-013.mts` and
`scripts/quickstart-013-v6.mts` (Playwright-driven, all checks pass — see
scripts' headers for the exact invocation). Note: run them against
`next start` of a `npm run build` output; under Next 16.4.3 turbopack dev
the app-router hydration stalls (React never reaches hydrateRoot), which
does not affect the production build (nor the visual suite's webpack dev
server). The per-user independence part of V5 (two distinct users seeing
their own pools) is pinned by the T016 integration test.

## V1 — Nomination gate blocks voting (spec US1 AC1, FR-006, SC-003)

1. User X (round incomplete) opens `/`.
2. **Pass**: exactly ONE name is displayed (no pair), counter reads
   "0 von 200" with buttons "Aufnehmen" / "Ausschließen". No vote
   interaction is reachable for X anywhere in the app.

## V2 — One-by-one flow and persistence (US1 AC2–AC4, FR-003/FR-004, SC-002)

1. X includes the first name, excludes the second.
2. **Pass**: each tap swaps to the next undecided name instantly
   (<100 ms presentation), counter increments ("1 von 200", "2 von 200"),
   the decided names never reappear.
3. Close the tab after ~10 decisions; reopen `/`.
4. **Pass**: the round resumes at the first undecided name in canonical
   list order; all 10 prior decisions are intact; decided names are not
   presented again.

## V3 — Progress counter (FR-012, clarified Q3)

1. Decide 36 names in a fresh round.
2. **Pass**: the 37th decision screen shows "36 von 200" (decided/total —
   not remaining, not a percentage).

## V4 — Completion transitions straight into voting (US1 AC5, US2 AC1, FR-009, FR-013)

1. X decides all 200 names (any mix; keep ≥2 "in").
2. **Pass**: on the final decision the UI transitions directly into the
   vote screen — no waiting screen, no extra step, regardless of user Y's
   progress.
3. X re-opens `/` later.
4. **Pass**: X lands directly in the voting screen (no nomination content
   shown again — decisions final).

## V5 — Pool restriction and independence (US2 AC1–AC2, US3 AC1–AC2, FR-007, SC-004)

1. X excluded "Noah"; Y (own round complete) included "Noah".
2. X votes through ≥5 refills (≈25 pairs); Y votes through ≥5 refills.
3. **Pass**: "Noah" never appears in any of X's pairs but does appear in
   Y's; every pair either user sees consists exclusively of names that
   user included.

## V6 — Locked state with <2 included names (edge case, FR-008)

1. Fresh user Z completes a round excluding 199 of 200 names (1 "in").
2. **Pass**: Z sees the locked message ("Zu wenige Namen übrig (1) —
   Abstimmung nicht möglich."); no pair voting for Z; X's and Y's voting
   unaffected.

## V7 — Decisions are final (FR-011, clarified Q2)

1. After X's round is complete, X re-opens `/` and inspects all screens.
2. **Pass**: there is no UI path to change any include/exclude decision;
   the vote screen contains no nomination controls.

## Automated gates (local, before deploy)

```bash
npm test         # unit + integration suites, including the new
                 # nomination-logic / pairing-pool unit tests and the
                 # nomination-store integration test (R8)
npm run build    # zero type/lint errors (constitution gate)
```
