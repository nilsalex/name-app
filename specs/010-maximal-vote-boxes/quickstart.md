# Quickstart: Maximal Vote Boxes (010)

Date: 2026-11-01. Validation guide for feature 010. Automated gates run
locally; the size/fit checks below are manual device/DevTools checks (per
Constitution Principle IV, styling/layout requires no integration tests —
this checklist is the proportionate verification, precedent 008/009).

## Prerequisites

- `.env.local` with the usual credentials; both approved users available.
- `npm install` done; on this branch: `npm test`, `npx tsc --noEmit`,
  `npm run build` all pass before starting manual checks.
- A phone, or Chrome/Safari DevTools device toolbar (profiles: 320 × 568,
  375 × 667, 430 × 932, plus a desktop width ≥1024).
- DevTools tip: hover a `.nameButton` in the Elements panel to see its box
  overlay; also useful for the V2 staticity re-check.

## V1 — Automated gates still green (FR-009; contract M3.4)

1. Run `npm test`, `npx tsc --noEmit`, `npm run build`.
2. **Pass**: zero failures, zero type errors, zero lint/build errors; the
   diff touches only `app/page.module.css`.

## V2 — Maximal width and height (US1, SC-001/SC-002, contract M1.1/M1.2)

1. Sign in on the phone (or 320/375/430 px profiles), open `/`.
2. **Pass**: the pair row touches both available edges (24 px page margin
   on each side, no idle gap beyond that) — no `44vw` cap remains; the
   two boxes are equal halves with "oder" between (M1.1).
3. **Pass**: each box is prominent — ≈104 × 86 px at 320 px (30 px
   vertical padding visible as generous breathing room around the name);
   the two boxes dominate the screen's voting region (M1.2, SC-002).
4. **Pass**: name type is clearly the largest text on the screen — larger
   than the hint line and separator; the sign-out button stays visible
   and first-tap tappable; nothing overlaps (M2.3/M3.2).

## V3 — Staticity preserved at the new sizes (US2, SC-003, contract M1.3)

1. At 320 and 375 px, vote 10+ consecutive times seeking very different
   name lengths.
2. **Pass**: box rectangles are pixel-identical from pair to pair (equal
   halves never move or resize; the 44vw-cap removal did NOT reintroduce
   content-sizing); short names ("Paul") leave the box unchanged (M1.3).
3. Trigger the failure notice (airplane mode mid-session, reconnect):
   **Pass**: it appears/disappears without moving or resizing the pair
   boxes (M3.1/M2.3).

## V4 — Fitting never regressed (US2/US3, SC-004, contract M2)

1. At the 320 px profile, vote until "Maximilian"/"Konstantin" appear.
2. **Pass**: each name fits on one line inside its box — no wrap, no
   ellipsis, ≥ a few px of margin; identical fit to the pre-010 build
   (M2.1/M2.2 — this is the empirically confirmed R3/R4 arithmetic).
3. Optionally (revert afterwards) add a ~30-character probe name to
   `COLOGNE_200_BOY_NAMES` in `lib/names.ts`: **Pass** — font shrinks
   first; "…" only as last resort; the box rectangle never changes with
   the text (008 chain intact inside the bigger box).
4. Check 375 and 430 px with long names: **Pass** — the type grows
   slightly (17.3–19.8 px range) and still fits comfortably (M1.4/M2.1).

## V5 — Desktop & tablet coherence (US3, FR-008, contract M3.3)

1. Open `/` at ≥1024 px width; vote a few pairs.
2. **Pass**: two equal boxes with a legible "oder" between; names render
   at the 40 px cap; the composition reads as one centered row (poster-
   like but intentional — two islands / absurd proportions = fail).
3. Narrows checks: 640 px and 768 px profiles — **Pass**: graceful scaling
   (fluid type growing toward the cap), no overflow, no horizontal
   scrolling (M2.3).

## V6 — Regression guard (inherited contracts)

1. `/ranking`, `/winners`, logged-out `/` at 320 px: **Pass** — unchanged
   from post-008/009 state (no horizontal scroll, no clipping, buttons
   first-tap tappable).
2. Landscape phone (e.g. 740 × 360): **Pass** — behavior identical to
   today (vertical page scroll only; the pair itself never scrolls or
   clips mid-box) (M3.1).

## Done

All Vs pass ⇒ `contracts/maximality.md` holds ⇒ FR-001…FR-009 satisfied.
If V4.2 fails empirically at 320 px (ellipsis visible for a real name),
the R3/R4 arithmetic was too optimistic: re-measure the real text width
in the browser and either lower the horizontal padding floor (min 4 px)
or drop the font cap to 36 px — box maximality (V2) stays; only the type
cap/floor rebalance. Box positions and sizes stay static in every case.
