# Research: Maximal Vote Boxes (010)

Date: 2026-11-01. Resolves the maximality mechanics for the static pair
boxes. Constraints: CSS Modules only, no new dependencies, no JS
measurement, simplicity paramount (Principle V). The spec fixed the
*behavioral* contract (equal + static per 009, dominant size per 010);
this document resolves the exact values and mechanisms.

## R1: What does "as large as possible" mean, concretely? (maximality bounds)

**Decision**: maximality is the pair of bounds the spec's FRs already
name, made exact:
1. **Width bound (FR-001/SC-001)**: the pair row fills 100% of the
   width available to the voting area — that is the viewport minus the
   global page padding (24 px per side on `.voteArea`, unchanged): at
   320 px → 272 px of row width; equal halves → each card
   (272 − 2×gap 14 − separator ≈35)/2 ≈ **104 px** (at 430 px →
   ≈166 px). The current `max-width: 44vw` on `.nameButton`
   (141 px at 320 px) does not bind on small phones but quietly caps
   larger ones — removing it makes SC-001 exact at every width.
2. **Height bound (FR-001/FR-007)**: the box grows until the vote
   column stops fitting without scrolling. Column at iPhone SE (568):
   nav ≈68 + column gaps ≈80 + sign-out ≈31 + hint ≈21 + pair + notice
   ≈75 when visible. Pair must stay ≤ ~290 px tall to remain
   scroll-free even with notice visible on the tightest device.
   Vertical padding 22 → **30 px** grows the pair to ~74–106 px tall
   (font 15–40) — dominant yet far under that bound, and the tap
   target becomes roughly 104 × 86 px at 320 px (≈9× the minimum
   44 × 44 target's area).

**Rationale**: Both bounds are measurable; the numbers below are
derived from the inherited chrome and validated in the quickstart.

**Alternatives considered**:
- *Removing the 24 px `.voteArea` padding too* — rejected: the padding
  is shared with the login (`pickUser`) and is a deliberate 008 decision
  (C3.3: keeps the login error text clear of the edge); the spec's
  assumptions say global padding stays.
- *HVH-filling height (`height: 100%` / dvh tricks)* — rejected: JS-
  free viewport-height stretching makes the column height dependent on
  notice visibility (pair would grow/shrink when the notice appears —
  breaking 009 staticity FR-S1.7) and risks clipping; fixed generous
  padding achieves the dominance without coupling.

## R2: How is maximality realized in CSS? (the mechanism)

**Decision**: Three edits, all on existing declarations in
`app/page.module.css`:
1. `.nameButton`: **delete** `max-width: 44vw` (last cap on the equal
   halves; flex `1 1 0` machinery from 009 untouched).
2. `.nameButton`: `padding: 22px clamp(...)` → **`padding: 30px clamp(...)`**
   (vertical 22 → 30; horizontal floor re-derived in R4).
3. `.nameButton`: `font-size: clamp(15px, 4.6vw, 26px)` →
   **`clamp(15px, 4.6vw, 40px)`** (cap raised; formula re-validated in
   R3 — the initially considered 8vw slope was rejected by arithmetic).
4. `.vs`: `font-size: 14px` → **`16px`** so the separator keeps visual
   weight between the now-huge cards (still `flex: 0 0 auto`, no wrap).

**Rationale**: Reuses 009's static-equal-half machinery unchanged; each
edit moves exactly one FR. No markup, no JS, no new classes.

**Alternatives considered**:
- *`clamp()`-based padding (`padding-block: clamp(30px, 12vh, 48px)`)*
  — rejected: height-responsive padding makes box height viewport-
  *height*-dependent, complicating staticity guarantees for marginal
  gain in a toy app (Principle V).
- *Separate mobile media query with different set of values* — rejected:
  the fluid `vw`-based clamp already adapts continuously; extra queries
  add branches to maintain (Principle V).

## R3: Is "names fit with at least as much margin as before" satisfied? (worst-case math)

**Decision**: YES — but only with the inherited font slope kept intact.
The candidate formula `clamp(16px, 8vw, 40px)` was checked by explicit
arithmetic and **rejected**: at 320 px the applied value would be
8vw = 25.6 px (inside clamp min 16 / max 40), so "Maximilian" ≈
0.55 em × 10 chars × 25.6 ≈ 141 px of text against ≈92 px of text room
(in a ≈104 px card) — the ellipsis would become reachable, violating
FR-003. An 8vw slope is unsalvageable below ~600 px viewports (the
text grows faster than the equal halves do).

**Final decision**: **`clamp(15px, 4.6vw, 40px)`** — keep the 008/009
floor (15 px) and slope (4.6vw), raise only the *cap* 26 → 40 px:
- At 320 px: 4.6vw = 14.7 → floor 15 px applied — identical to today;
  text ≈87 px in ≈104 px card with 2 × 8 px padding = 90 px room ⇒
  3 px margin, exactly the 009 R3 worst case (no regression, SC-004).
- At 375–430 px: applied 17.3–19.8 px; text 95–109 px against room
  121–154 px — comfortable, and the type grows with the screen.
- At ≥870 px: the cap engages — names render at **40 px** (vs 26 px
  today), the dominant-typography payoff on tablets/desktop (FR-004).

So the mobile size *dominance* demanded by SC-002 is delivered not by
a steeper font slope but by: (a) removing `max-width: 44vw` (wider
cards), (b) vertical padding 22 → 30 px (much taller cards), and (c)
the 40 px cap on wide viewports. Nowhere is the fit worse than 009.

**Rationale**: FR-003 explicitly requires fitting with *at least as
much* margin as before; the 320 px band must not regress, so floor
and slope stay and maximality is achieved through width, height, and
the wide-viewport cap instead.

**Alternatives considered**:
- *`clamp(16px, 8vw, 40px)`* — rejected by the arithmetic above
  (ellipsis reachable at 320 and 375 px ⇒ FR-003 violation).
- *Lowering the floor to 14 px to enable a steeper slope* — also
  rejected: even 14 px × 8vw overflows at 375 px (165 px text in a
  ≈121 px room); the floor exists for at-arm's-length readability.
- *Container-relative sizing (cqw)* — rejected (Principle V; 009 R6
  precedent: more moving parts than a single clamp for no gain).

## R4: Re-derived horizontal padding floor for the 40 px cap

**Decision**: `padding: 30px clamp(6px, 4vw, 26px)` (horizontal floor
8 → **6 px**). Math: with the final font formula (R3: 4.6vw slope,
15 px floor, 40 px cap) the binding case at mobile widths is unchanged
from 009: at 320 px, card ≈104 px, applied font 15 px → text ≈87 px;
remaining 17 px; 2 × 6 = 12 px floor used ⇒ 5 px slack (009: card
106 px, 19 px budget, 16 px used, 3 px margin — 010 is *better*).
On desktop (≥870 px): font
caps at 40, card grows unbounded with the window; at a 1000 px
viewport the card is ≈439 px − 2 × 26 px (clamp upper bound) =
387 px text room vs 220 px text ✓ huge margin.

**Rationale**: One clamp retune simultaneously serves FR-004 (40 px
cap = dominant type on wide screens) and FR-003 (worst-case fit
strictly no worse than 009 — actually 2 px better).

**Alternatives considered**:
- *Keeping the 8 px floor* — also safe (5−2=3 px slack at 320 px),
  but 6 px gives extra future-proof headroom for cap-related edge
  cases; both defensible, 6 px chosen.
- *Padding floors proportional to vw (e.g. 2vw)* — rejected: more
  moving parts, no additional guarantee.

## R5: Does the enlarged composition stay coherent on desktop? (FR-008)

**Decision**: YES, with the `.vs` bump to 16 px. On a 1280 px desktop
the pair row becomes two ≈574 px-wide boxes with a 35 px separator
zone — bold, poster-like, but coherent (equal halves, centered row,
one card + separator + one card). The 40 px cap (R3) keeps the type
proportional (not vw-scaled to absurdity). The 30 px vertical padding
keeps the boxes ~106 px tall — balanced against 574 px width (a wide
banner, not a degenerate line).

**Rationale**: The dominance reads as intentional on desktop too; the
existing centered layout with `.voteArea` (justify-content: center,
limit: none) keeps the row visually anchored.

**Alternatives considered**:
- *Capping the row width on desktop (e.g. `max-width: 900px` on
  `.pairButtons`)* — rejected for now: the spec asks for maximal boxes;
  a max-width cap makes SC-001's "≥95% of available" false on desktop.
  If a future feature finds 574 px posters unbalanced, THAT feature can
  add the cap (YAGNI).
- *Desktop-specific media query with different proportions* — rejected
  (Principle V; the fluid values already degrade gracefully).

## R6: Height sanity — does anything overlap or scroll? (FR-006/FR-007)

**Decision**: No overlap, no scroll at the supported heights. Column
sequence (flex column, gap 20) after enlargement: nav (≈68, in nav
element outside `.voteArea`) + `.voteArea` padding 24 + sign-out 31 +
hint 21 + pair (30 + 30 + line-height ≈ 1.15 × font 15–26 → 74–90 px
mobile; up to ~106 px on desktop 40 px) + notice (~75 when visible).
Total worst case (320 × 568 portrait, notice visible, font 15):
68 + 48(page padding) + 80(gaps) + 31 + 21 + 74 + 75 ≈ **397 px** —
comfortably under 568 ✓. Even a twice-as-tall pair (font cap 40 ⇒
~106 px) fits: ≈429 px. The only scroll risk is *landscape phones*
(e.g. 740 × 360): 68 + 48 + 80 + 31 + 21 + 74 + 75 ≈ 397 → **exceeds
360 px** ⇒ the page scrolls vertically in landscape — acceptable:
FR-006 forbids *horizontal* scroll and scrolling *of the pair itself*;
the page already scrolls vertically in landscape today (nav + pair +
notice wouldn't fit 360 px even before this feature). No regression.

**Rationale**: Confirms 30 px vertical padding is safe for all portrait
devices; landscape phones keep today's behavior (vertical page scroll
if the content exceeds the viewport).

**Alternatives considered**:
- *Reducing vertical padding in landscape via media query* — rejected:
  scoped complexity for a marginal device state; 008 explicitly put
  landscape scrolling out of scope.
