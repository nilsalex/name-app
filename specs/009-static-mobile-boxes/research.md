# Research: Static Mobile Pair Boxes (009)

Date: 2026-11-03. Resolves the technical choices for static pair-box
geometry. Constraints: toy app for two users, CSS Modules only, no new
dependencies, simplicity paramount (constitution Principle V). The spec
already fixed the *behavioral* contract (boxes must not move, sizes
static per viewport); this document resolves the *implementation
mechanics*, with one genuinely hard question (R3: worst-case fitting
inside static halves).

## R1: Why do the 008 boxes move today? (root cause)

**Decision**: Treat the movement as a *flex-basis problem*, not a markup
or measurement problem. `.nameButton` is `flex: 1 1 auto` (008's
implementation of clarification Q3 "squeeze to fit"): its base size is
its content width, so when a pair's names change length, the flex
resolver re-derives both card widths from the new text — the boxes are
rebuilt around the text on every pair. The left card's width directly
sets the right card's x-position, so "sizes change" and "boxes move" are
the same defect. FR-002's "boxes not sized by their text content" is the
formal statement of that property.

**Rationale**: Locating the exact mechanism keeps the fix minimal and
verifiable — no other property (gap, separator, viewport units) moves
the boxes between pairs.

**Alternatives considered**:
- *Attributing the movement to font-size clamp differences* — rejected:
  the clamp varies only with viewport (static per orientation), not per
  pair; it cannot cause pair-to-pair movement.
- *React re-mount / key instability* — rejected: the buttons are stable
  JSX in one branch of the same component; position changes are pure
  layout math, not reconciliation.

## R2: How are content-independent, per-viewport-static box sizes implemented? (the core)

**Decision**: Change `.nameButton` to `flex: 1 1 0` — equal thirds-style
halves of the row. Basis 0 makes every card's size independent of its
content: each card gets exactly half of the space left over after the
fixed separator and two gaps, *no matter what text it holds*. This makes
the entire spec contract (FR-001, FR-002, FR-004) true **by
construction**: fixed sizes → fixed positions; text is forced to fit
into its immutable box; left slot is always [`row start`, midpoint],
right slot always [`midpoint`, row end].

**Rationale**: One declaration delivers the whole feature. `flex-basis:
0` is the canonical CSS mechanism for "equal, content-independent share
of a flex row" and needs no JS measurement, no grid rewrite, and no
markup change. The 008 mechanisms (nowrap, clamp, ellipsis, min-height
44 px) are inherited unchanged — only the *tuning* may need adjustment
for the tighter static width (see R3).

**Alternatives considered**:
- *Keeping `flex: 1 1 auto`* — that IS the bug (R1); rejected.
- *`display: grid; grid-template-columns: 1fr auto 1fr; min-width: 0`
  on the items* — equally capable and slightly more explicit about the
  halves, but a bigger rewrite of a working row for no user-visible
  gain; subsumed by `1 1 0` on the existing flex row (008's R3
  precedent). Rejected for simplicity.
- *JS text measurement + per-pair dynamic sizing* — rejected:
  reintroduces exactly the movement the feature removes, and violates
  Principle V.
- *Pair-independent per-name hash-sized columns ("size once per name")*
  — over-engineered for the actual complaint (right card jumping on
  transition), and 009 spec FR-002 says sizes may depend on viewport
  only. Rejected.

**Viewport-dependency is preserved**: `4.6vw`-based clamp and `vw`-
based padding keep the static geometry a pure function of viewport
width; a window/orientation change recomputes the static layout once.
No JavaScript participates.

## R3: Does 008 C1.3-data ("ellipsis unreachable at ≥320 px for real data") survive static halves? (worst-case math)

**Decision**: YES — but only after lowering the horizontal padding
floor from **16 px → 8 px**. Text fitting inside a **static** card is
strictly tighter than 008's content-fitted worst case, so the margins
from the 008 build had to be re-derived for 009:

- Static card width at 320 px: (inner 272 − 2×gap 14 − "oder" ≈33) / 2
  ≈ **106 px** (row on `.voteArea`'s 24 px padding; 008's `max-width:
  44vw` is 141 px at 320 px and no longer binds: a `1 1 0` item can
  still grow past basis 0, and two equal growers converge to one equal
  split ≤141 px).
- Flat widening past 320 px moves each card by ≈ +2.6 px *per CSS px*,
  while the `clamp(15px, 4.6vw, 26px)` type repairs demand at ≈ +1.5 px
  *per CSS px* (avg advance ≈0.58 em → +0.75 px per side). Verdict:
  **320 px is the binding width** — if the worst name fits at 320 px
  (card ≈106 px), it fits at every wider viewport. This recovers the
  monotonicity that 008's analysis lost with content-sized cards.
- Worst-real-data text width ("Maximilian"/"Konstantin"): ≈0.58 em ×
  10 → at 15 px ≈ 87 px. Zero-padding capacity of the 106 px card is
  max 18.3 px font ⇒ the 15 px clamp floor alone would fit. But a card
  needs breathing room: at font 15 px the static card leaves 106 − 87 =
  19 px for horizontal padding — the 008 floor (16 px ×2 = 32 px) does
  **not** fit and the ellipsis would silently become reachable.
- **Fix**: `padding: 22px clamp(8px, 4vw, 26px)`. At 320 px (vw =
  3.2px): `clamp(8px, 4vw, 26px)` = clamp(8, 12.8, 26) — the clamp
  immediately snaps to its 8 px floor ⇒ **8 px ×2 sides = 16 px used ≤
  19 px budget**; per-card text room = 106 − 16 = **90 px ≥ 87 px**
  worst text. Ellipsis stays unreachable for the real 200-name set;
  the inherited 3-step chain (shrink in [15..26] px, then ellipsis)
  remains end-to-end valid. Temporary test-only probe names (e.g. a
  30-character artificial name) can confirm the ellipsis leg engages
  as the last resort without any box movement.

**Rationale**: Preserves the inherited 3-step chain while making box
geometry content-independent; a single clamped value change re-derives
the safety margin instead of adding machinery. The worst-case math is
font-metric estimation (not browser-verified); the quickstart includes
a worst-case check at 320 px to confirm the margin empirically.

**Alternatives considered**:
- *Lowering the font floor to 12 px instead of padding* — keeps more
  padding but degrades readability at the tightest band; the pad-floor
  change affects only narrow viewports and keeps 15 px readable type.
  Rejected.
- *Removing `max-width: 44vw`* — unneeded: basis-0 growers can grow
  past basis 0 (44vw exceeds the half-row share at all supported
  widths), and the cap keeps the desktop row reasonable; the growth
  analysis in R2 shows the cap does not bind. Kept unchanged.

## R4: How is the 44 × 44 px touch floor (FR-008) preserved under static halves?

**Decision**: Static halves only change *width* behavior. Every
mechanism 008 used for the touch guarantee remains: static card width
(≈106 px at 320 px up to ≈161 px at 430 px, more on desktop) ×
`min-height: 44px` × vertical 22 px padding with 15–26 px type ⇒
comfortably ≥44 px in both dimensions. The explicit declarations
(`min-height: 44px` on `.nameButton`, `.noticeDismiss`, `.signOut`)
stay unchanged.

**Rationale**: The floors stay explicit; the static-width analysis (R3)
shows widths remain far above 44 px. The touch guarantee is actually
*stronger* under static halves: targets can never shrink with content.

**Alternatives considered**: none needed — no mechanism touched.

## R5: Does desktop need mitigation? "oder" grows on narrow viewports?

**Decision**: **NONE needed, for either part.**
- *Desktop*: desktop currently shows wide, content-fitted cards (the
  flex row distributes spare width by content). Under static halves
  the row becomes two equal halves with the separator centered — the
  row gets marginally more compact and evenly balanced in exchange for
  guaranteeing identical geometry everywhere (and spec US3 keeps
  desktop preserved by construction). No mitigation rule can beat the
  mechanism itself; adding media queries would just duplicate it.
- *"oder" width*: bounded and content-independent — the separator is
  styled `flex: 0 0 auto` with its own fixed text width (≈33 px plus
  the surrounding 14 px gaps), so it is already "static" in exactly
  the way this feature prescribes for the two boxes; it cannot steal
  meaningful width from the halves. Non-issue; kept unchanged.

**Rationale**: Both hypothetical risks dissolve under the R3 numbers
and the `1 1 0` resolver behavior; adding media queries or JS would be
Principle V violations for no present need.

**Alternatives considered**:
- *Desktop compaction media queries* — rejected: the static halves
  *are* the compaction; extra rules would fight the same mechanism.
- *JS measuring "oder"* — rejected: measurement-only use with no
  behavioral role (Principle V violation).

## R6: Can the fix be verified with a proportionate automated test? (constitution III/IV)

**Decision**: **No.** There are no arithmetic predicates to decide in
TypeScript (the layout math deciding box geometry lives in the browser
flexbox resolver); the new contract clauses are layout validators for
HTML-in-CSS behavior. Per Constitution Principle IV that kind of
assertion "MUST NOT be implemented" as a project test: node's runtime
isn't a verifier for browser CSS layout, and the R4-inherited floors
(min-height 44px etc.) are already guarded by explicit CSS
declarations.

**New key acceptance evidence** consists of the `npm test / tsc /
build` gates staying green (T-V1) plus the manual
device/DevTools checks in `quickstart.md` — which must now explicitly
include the *static* geometry assertion: approximate by screenshots
(box rectangles at a given viewport are pixel-identical from pair to
pair; text changes only, fitted in place).

**Rationale**: Constitution-exempt category, unchanged precedent from
008 (whose plan recorded the same decision).

**Alternatives considered**:
- *Container-query-based static halves* (`cqw` units + `@container`) —
  would work but couples which container to a query line and needs a
  `container-type` property on `.pairButtons`, more moving parts than
  one flex declaration; rejected for simplicity (Principle V).
- *jsdom/Playwright layout test* — would need new dev dependencies
  (Playwright) or a jsdom harness knowing nothing about flexbox
  math; rejected — Principle IV forbids framework-boundary tests for
  layout, and Principle V rejects the scaffolding.
