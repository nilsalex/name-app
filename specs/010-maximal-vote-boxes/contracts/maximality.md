# UI Maximality Contract (010 — amendment to the 009 static-layout contract)

Date: 2026-11-01. Feature 010 layers a **maximality** guarantee on top of
the 009 contract (`specs/009-static-mobile-boxes/contracts/static-layout.md`),
whose clauses remain fully in force (S1 staticity, S2 touch targets, S3
behavior preservation) and through it the 008 contract (C1 no-wrap chain,
C2 targets, C3 secondary screens, C4 behavior). The M-clauses below
override two 009/008 specifics: (a) 009's assumed 44vw card cap and pad
floor 8 px (now removed/lowered), (b) 008's 26 px type cap (now 40 px on
wide viewports). Everything else stands. Any M-clause failure at a tested
width is a spec violation, verified by the quickstart check matrix.

## M1 — Maximality (screen: `/`, vote state)

| # | Guarantee |
|---|---|
| M1.1 | The pair row spans the full width available to the voting area (viewport minus the global 24 px page padding per side): SC-001's ≥95% holds at 320/375/430 px, and there is no idle gap between the row and the available edge. (The old `max-width: 44vw` card cap is gone.) |
| M1.2 | Each box is generously taller than the 44 × 44 touch minimum (≈104 × 86 px at 320 px): vertical padding is 30 px top/bottom; the two boxes plus separator dominate the visible voting region on phones. |
| M1.3 | Box geometry remains content-independent and pair-static: removing the cap does NOT reintroduce content-based sizing — the halves stay `flex: 1 1 0` equal halves; positions/sizes pixel-identical across consecutive pairs (009 S1.1/S1.2 intact at the new sizes). |
| M1.4 | Name type is the dominant text on the vote screen at every width (clearly larger than the 15 px hint and auxiliary text), growing with the viewport (4.6vw slope) and reaching 40 px on wide viewports/tablet/desktop (new cap; old cap 26 px gone). |
| M1.5 | The "oder" separator remains visible and legible between the enlarged cards at every width (bumped 14 → 16 px), still non-shrinking and non-wrapping (008 C1.6 intact). |

## M2 — Fitting never regresses (FR-003; refines 008 C1 + 009 S1.5)

| # | Guarantee |
|---|---|
| M2.1 | With the new values (padding `30px clamp(6px, 4vw, 26px)`, font `clamp(15px, 4.6vw, 40px)`), every supported name in the current 200-name set fits on one line inside its box at every viewport ≥320 px — margin at 320 px is ≥3 px ("Maximilian"/"Konstantin" ≈87 px text vs 90 px text room), i.e. fitting is strictly no worse than after 009. |
| M2.2 | The inherited fallback chain remains ordered: shrink within [15..40] px first; ellipsis only if a name still overflows at 15 px; boxes/consumed geometry never resize around text. With the current name list the ellipsis stays unreachable (amended 008 C1.3-data / 009 S1.5). |
| M2.3 | No horizontal scrolling, no clipped boxes, no overlapping elements at any supported viewport (FR-006; 008 C1.5 intact — the row may grow, but never past the available edge). |

## M3 — Surroundings and behavior (FR-007/FR-008/FR-009; extends 009 S2/S3)

| # | Guarantee |
|---|---|
| M3.1 | With the enlarged pair, the vote column stays scroll-free in portrait at all supportable heights (nav + sign-out + hint + pair + notice ≈397 px worst case < 568 px); landscape phones may page-scroll vertically as they already do today — no new scroll axis, no element overlap. |
| M3.2 | Sign-out, hint, notices, and dismiss remain visible, sane, and ≥44 px tappable around the enlarged boxes (008 C2 floors untouched); the enlarged pair does not crowd out or overlap them (FR-007). |
| M3.3 | On desktop the enlargement is proportional and coherent: equal halves, 40 px type, visible separator — one composition, not two islands; no overflow at any tested desktop width (FR-008). |
| M3.4 | Zero behavior changes: vote submission, instant swap, tallies, notice counting/dismissal, pairing, sessions (009 S3.1–S3.3 inherited; markup still untouched — stylesheet-only change). |
