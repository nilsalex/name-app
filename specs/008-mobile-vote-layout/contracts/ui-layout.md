# UI Layout Contract (008)

Date: 2026-11-02. The application's "external interface" here is its user
interface. This contract states the presentation guarantees every touched
screen must meet; `tasks.md` tasks and the quickstart checks verify
against it. It is technology-agnostic by intent but anchored to the CSS
mechanisms chosen in `research.md` (R2–R5) to make each clause testable.

## C1 — Vote pair row (screen: `/`, vote state)

| # | Guarantee |
|---|---|
| C1.1 | The two candidate names occupy a single horizontal row: left slot and right slot, separator between. The row NEVER wraps onto two rows at any supported viewport width (≥320 px CSS px) and any candidate name. |
| C1.2 | Each name renders on exactly one line (`white-space: nowrap`). Mid-name line breaks never occur. |
| C1.3 | Overflow fallback chain (strictly ordered): ① reduce font size smoothly with viewport (`clamp` range ≈17–26 px); ② if still overflowing, truncate with a trailing ellipsis. Ellipsis must never trigger while a size ≥ the clamp floor still fits. |
| C1.3-data | With the current 200-name candidate set (longest "Maximilian"/"Konstantin", 10 chars), the ellipsis step is unreachable at ≥320 px — shrink alone suffices. |
| C1.4 | Slot sides are stable: the first name drawn for a pair always occupies the left slot, the second the right, for every consecutive pair (no swapping/jumping between pairs). |
| C1.5 | The pair fits its viewport: no horizontal page scrolling, no card clipped mid-glyph. When both names are long, cards flex narrower; the row is never scrollable. |
| C1.6 | "vs."-separator ("oder") remains visible between cards at every width; it never wraps independently of the cards. |

## C2 — Touch targets (all interactive elements of touched screens)

| # | Guarantee |
|---|---|
| C2.1 | Every tappable element ≥ 44 × 44 px CSS px: both name cards, the persistent notice's dismiss button, the sign-out button, and the login affordances. |
| C2.2 | Name cards meet C2.1 via padding + font floor, independent of text length (short names don't shrink the card beneath 44 px). |

## C3 — Secondary screens (screen: `/ranking`, `/winners`, logged-out `/`)

| # | Guarantee |
|---|---|
| C3.1 | No horizontal scrolling at ≥320 px on login, ranking, or winners screens. |
| C3.2 | Ranking/winners rows (rank number, name, score) all visible without truncation or clipping at ≥320 px. |
| C3.3 | Login screen: sign-in affordance and any error text fully visible and tappable at ≥320 px. |
| C3.4 | Device-pixel-ratio/zoom defaults preserved: no `user-scalable=no` or fixed zoom allowed (accessibility). |

## C4 — Behavior preservation (FR-008)

| # | Guarantee |
|---|---|
| C4.1 | Layout changes introduce zero changes to: vote submission, async dispatch/retry, notice counting/dismissal, pair generation, session handling. |
| C4.2 | Accessible names and ARIA attributes of existing controls remain unchanged (the vote button still carries the name text; the notice keeps `role="alert"`). |

## Violations

Any C-clause failure at a tested width is a spec violation, not a styling
preference. The quickstart (`quickstart.md`) enumerates the concrete check
matrix (widths × screens) used to verify this contract by hand.
