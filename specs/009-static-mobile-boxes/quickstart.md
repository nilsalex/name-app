# Quickstart: Static Mobile Pair Boxes (009)

Date: 2026-11-03. Validation guide for feature 009. Automated gates run
locally; the geometry checks below are manual device/DevTools checks (per
Constitution Principle IV, styling/layout requires no integration tests —
this checklist is the proportionate verification, same precedent as 008).

## Prerequisites

- `.env.local` with the usual credentials (Upstash, Google, approved
  emails, session secret); both approved users available.
- `npm install` done; on this branch: `npm test`, `npx tsc --noEmit`,
  `npm run build` all pass before starting manual checks.
- A phone, or Chrome/Safari DevTools device toolbar (e.g. iPhone SE
  375 × 667; plus a custom 320 × 568 profile for the tightest width).
- DevTools tip: in the Elements panel, hovering a `.nameButton` shows its
  box overlay — useful for V2's "identical rectangles" check.

## V1 — Automated gates still green (FR-007: no behavior change; contract S3)

1. Run `npm test`, `npx tsc --noEmit`, `npm run build`.
2. **Pass**: zero failures, zero type errors, zero lint/build errors. The
   existing voting/pairing/store suites pass unchanged (proof that no
   logic changed — the diff touches only `app/page.module.css`).

## V2 — Boxes never move between pairs (spec US1, SC-001, contract S1.1–S1.3)

1. Sign in on the phone (or 320 px DevTools profile), open `/`.
2. Note both name boxes' rectangles (left edge, width, top, height) —
   e.g. via DevTools element inspection or a screenshot with the box
   overlay on.
3. Vote several times consecutively, seeking pairs with very different
   name lengths (short like "Paul"/"Felix" round, then long like
   "Maximilian"/"Konstantin").
4. **Pass after every transition**: both boxes have *exactly* the same
   rectangles as before — pixel-identical left/right edges, widths, and
   heights; only the text inside changed (S1.1/S1.2). Nothing shifts,
   resizes, or reflows (SC-001: 10+ consecutive transitions, 0 jumps).
5. Measure visually: the two boxes are equally wide at every width, and
   "oder" sits centered exactly between them (S1.3).

## V3 — Text fits inside the immutable boxes at 320 px (US3, SC-002, S1.4/S1.5)

1. At the 320 px profile, vote until the longest names appear
   ("Maximilian" / "Konstantin" — re-sign-in and vote a few short pairs
   to cycle reserve refills if needed).
2. **Pass**: each long name fits on one line inside its box, no wrapper,
   no mid-name break, no overflow beyond the box edge, no ellipsis (the
   math says the 15 px floor + 8 px padding floor leave ≈90 px of text
   room for ≈87 px of worst-case text — margin is thin, this check is
   the empirical confirmation, R3).
3. Optional (future-proofing / last-resort check): temporarily add a
   ~30-character artificial name to `COLOGNE_200_BOY_NAMES` locally
   (revert after the check!). Pair it and observe at 320 px.
   **Pass**: the font shrinks down to its floor first; only if it still
   does not fit does "…" appear — and crucially the *box rectangle
   stays identical* to the neighboring pair's boxes (ellipsis changes
   the text, never the geometry; S1.4). Remove the probe name.

## V4 — Tap targets and rapid voting (US2, SC-003, contract S2)

1. On the phone: tap a name card at its corners and center — the whole
   fixed box must respond, not just the visible text (S2.1).
2. Vote rapidly in an alternating left/right pattern (tap left, tap
   right, tap left…).
   **Pass**: every vote is registered for the intended side — targets
   cannot move between pairs, so rapid alternating taps never mis-tap
   (SC-003). Verify the session tally later in `/ranking` matches the
   number of taps cast.
3. Trigger the failure notice (airplane mode mid-session, then
   reconnect), dismiss it.
   **Pass**: the notice appears *above/below* without nudging the pair
   boxes (S1.7); dismiss works first-tap (≥44 px target, S2.2); sign-out
   likewise first-tap reliable.

## V5 — Viewport / orientation / font-size changes (FR-005, S1.6)

1. Rotate the phone, or resize the DevTools viewport from 320 → 375 →
   430 → desktop.
   **Pass**: box geometry recalibrates once for the new viewport and is
   then again pixel-static across consecutive pairs at the new size (no
   per-pair wobble afterwards).
2. Enlarge the device font setting (accessibility), reload, vote.
   **Pass**: staticity still holds pair to pair; text fits per V3 rules
   inside the (possibly re-derived) boxes.

## V6 — Desktop sanity (spec clarifications; preserved desktop experience)

1. Open `/` at a desktop viewport and vote a few pairs.
   **Pass**: the row is intact and centered — two equal cards with
   "oder" between; the desktop look changes only in that both cards now
   share the space equally (acceptably compact), and boxes are static
   here too (S1.2 applies at every width).

## V7 — Secondary screens unaffected (008 C3 regression guard)

1. Open `/ranking` and `/winners` at 320 px; sign out and view the
   logged-out `/` at 320 px.
   **Pass**: no horizontal scrolling, no clipping, buttons tappable —
   identical to the state after feature 008 (this feature must not
   touch them).

## Done

All Vs pass ⇒ contract `contracts/static-layout.md` holds ⇒ FR-001…FR-008 satisfied. If V3.2 fails empirically (name clipped or ellipsized at 320 px), the padding floor estimate in `plan.md`/research R3 was too optimistic: re-measure real text width in the browser and lower the padding floor (minimum 4 px/side) while re-running V3 — box sizes stay static in every case.
