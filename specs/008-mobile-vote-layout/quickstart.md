# Quickstart: Mobile-Friendly Voting Layout (008)

Date: 2026-11-02. Validation guide for feature 008. Automated gates run
locally; the layout checks below are manual device/DevTools checks (per
Constitution Principle IV, styling/layout requires no integration tests —
this checklist is the proportionate verification).

## Prerequisites

- `.env.local` with the usual credentials (Upstash, Google, approved
  emails, session secret); both approved users available.
- `npm install` done; on this branch: `npm test`, `npx tsc --noEmit`,
  `npm run build` all pass before starting manual checks.
- A phone, or Chrome/Safari DevTools device toolbar (e.g. iPhone SE
  375 × 667; plus a custom 320 × 568 profile for the tightest width).

## V1 — Automated gates still green (FR-008: no behavior change)

1. Run `npm test`, `npx tsc --noEmit`, `npm run build`.
2. **Pass**: zero failures, zero type errors, zero lint/build errors. The
   existing voting/pairing/store suites are untouched and pass unchanged
   (proof that no logic changed).

## V2 — Side-by-side, never wraps (spec US1, SC-001/SC-002, contract C1.1–C1.3)

1. Sign in on the phone (or 320 px DevTools profile), open `/`.
2. **Pass**: both name cards sit left/right of "oder" on ONE row; neither
   stacks; no horizontal page scroll.
3. Vote several times rapidly.
4. **Pass**: every consecutive pair keeps the same arrangement (left
   slot = first name of pair); no reflow jump (SC-004, C1.4).
5. Inspect the longest names (scroll the queue until "Maximilian" /
   "Konstantin" appear — can force by re-signing-in and voting a few
   pairs of short names to reach reserve refills with long names).
6. **Pass**: single line, no mid-name break (C1.2), no ellipsis needed
   for real data (C1.3-data).
7. (Future-proofing, optional) Temporarily add a long artificial name to
   `COLOGNE_200_BOY_NAMES` locally (revert after check!): pair with it.
   **Pass**: font shrinks first; only if still too long does "…" appear;
   the row stays un-wrapped and un-scrollable (C1.3 chain order).

## V3 — Touch targets (US2, SC-003, contract C2)

1. On the phone: tap each name card deliberately at its corner regions.
2. **Pass**: taps land within the card; vote registers for the tapped
   name (visible by the instant next pair having consumed the vote
   later in `/ranking`).
3. Trigger the failure notice (airplane mode during votes, then
   reconnect & dismiss): tap the dismiss button.
4. **Pass**: dismiss works first-tap; the button (and sign-out button)
   visibly has a ≥44 px tall hit area (C2.1/C2.2).
5. Sign out via the small button: first-tap success (C2.1).

## V4 — Secondary screens at phone width (US3, FR-007, contract C3)

1. Sign out; open `/` logged-out at 320 px.
   **Pass**: Google sign-in button fully visible, no horizontal scroll
   (C3.1/C3.3).
2. Sign in; open `/ranking` at 320 px.
   **Pass**: rows show rank + name + score; no wrap/clipping; no
   horizontal scroll (C3.1/C3.2).
3. Open `/winners` at 320 px. **Pass**: same (C3.1/C3.2).
4. Zoom the page (pinch or accessibility settings): **Pass**: zoom is
   possible — no `user-scalable=no` (C3.4).
5. Landscape phone (≈740 × 360): **Pass**: voting pair still side by
   side, targets still ≥44 px (C1.1/C2.1).

## V5 — Real-device sanity (SC-005, qualitative)

1. Both actual users open the deployed app on their own phones and vote
   a handful of pairs, check ranking, sign out/in.
2. **Pass**: each reports nothing feels broken, cut off, or awkward
   (the spec's qualitative criterion).
