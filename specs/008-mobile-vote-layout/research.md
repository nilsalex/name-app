# Research: Mobile-Friendly Voting Layout (008)

Date: 2026-11-02. Resolves the technical choices for the mobile layout.
Constraints: toy app for two users, CSS Modules only, no new dependencies,
simplicity paramount (constitution Principle V). The clarify session
already fixed the *behavioral* decisions (Q1 shrink-first-then-ellipsis,
Q2 44 × 44 px targets, Q3 squeeze-to-fit); this document resolves the
*implementation mechanics* within a CSS-only strategy.

## R1: Is the rendering problem real for the actual name data?

**Decision**: Treat the layout damage as a *fixed-card-size problem*, not a
long-text problem. The candidate list (`lib/names.ts`,
`COLOGNE_200_BOY_NAMES`) contains 200 single-token first names; the longest
are "Maximilian" and "Konstantin" (10 chars). There are no spaces or
hyphens in the dataset.

Consequence: once the cards stop forcing `min-width: 150px` /
`max-width: 44vw` and instead flex with `min-width: 0`, even the longest
names fit in one row at 320 px at readable sizes. The spec's hyphenated
"Constanze-Viktoria Brandenstein" example cannot occur with today's data;
the shrink/ellipsis machinery handles it as future-proofing only.

**Rationale**: Measures the real risk instead of the hypothetical one; a
two-user toy app must not grow machinery for data that doesn't exist.

**Alternatives considered**:
- *Design primarily around hyphenated multi-token names* — rejected:
  speculative data shape, would drive JS measurement or aggressive
  truncation for nothing.
- *JavaScript text-measurement + auto-fit font sizing (e.g. fitty-style)* —
  rejected: new dependency or bespoke code, violates Principle V for zero
  present need; CSS clamp/ellipsis covers the same behavior.

## R2: How does "shrink first, ellipsis last resort" (Q1) map to CSS?

**Decision**: Three-property native CSS solution on `.nameButton`:
1. `font-size: clamp(17px, 4.6vw, 26px)` — the type scales down smoothly
   as the phone gets narrower (shrink step; range fixed at reviewable
   sizes; baseline validated in R1 for the real names);
2. `white-space: nowrap` — no mid-name line breaks ever (FR-002/003);
3. `overflow: hidden; text-overflow: ellipsis;` on the button — only if
   the *shrunk* text still overflows the (flex-narrowed) card, the name is
   truncated with "…" (last-resort step).

`min-width: 0` on the flex children is required so the cards are allowed
to shrink below their content width (without it, ellipsis would never
engage and the row would overflow).

**Rationale**: Pure CSS, exactly implements the clarified priority
(shrink dominates; ellipsis is the fallback), and modern phones/browser
support all three properties without prefixes.

**Alternatives considered**:
- *Ellipsis-first* — rejected by clarification Q1 (whole name should stay
  readable whenever a smaller size fits).
- *Container queries for card-relative sizing* — rejected: more moving
  parts than a single `clamp()`; no benefit at this scale.
- *Fixed breakpoint ladder (e.g. explicit media-query font sizes)* —
  rejected: discrete jumps look jankier than a smooth clamp and need more
  rules to maintain.

## R3: How is "side by side, never wrap" (FR-001/002) enforced?

**Decision**: `.pairButtons` becomes `display: flex; flex-wrap: nowrap;`
with the two cards as flex items that may shrink (`flex: 1 1 auto;
min-width: 0`) and the "oder" separator as a non-shrinking item
(`flex: 0 0 auto`). Cards keep equal visual weight by growing equally
when short names leave spare width.

**Rationale**: Mirrors the existing flex row (today's markup needs no
change), removes the exact property (`flex-wrap: wrap`) that produces the
reported wrap bug, and keeps left/right slots stable across pairs (FR-006)
by construction — the slot order is markup order.

**Alternatives considered**:
- *`display: grid; grid-template-columns: 1fr auto 1fr`* — equally
  capable, marginally more explicit about left/right slots, but a bigger
  rewrite of the current row for no user-visible gain. Rejected for
  simplicity.
- *Keeping wrap and only shrinking fonts* — rejected: does not satisfy
  FR-002 (cards may still stack when fontSize can't shrink infinitely).

## R4: How is the 44 × 44 px touch target (Q2) satisfied?

**Decision**: Keep the existing card paddings (22/26 px + 17–26 px type ⇒
≈ 66+ px tall — comfortably above 44 px) and add an explicit floor via
CSS properties so the guarantee holds even after future tweaks:
`min-height: 44px` on `.nameButton`; bump `.noticeDismiss` to satisfy
44 × 44 px (it shrinks to `padding: 6px 14px` today = ~30 px tall — set
`min-height: 44px` and keep its small footprint). The sign-out button tops
out at 4 px vertical padding (≈27 px today); raise its min-height to 44 px,
and the same floor applies to any login affordance.

**Rationale**: The cards already comply; only the small utility buttons
(notice dismiss, sign-out) need an explicit floor. Apple HIG (44 pt) and
Android Material (48 dp) minima both met with 44 px as clarified.

**Alternatives considered**:
- *48 × 48 px everywhere (Material)* — stricter than the clarified Q2
  answer; rejected as over-constraint (44 px was the accepted answer).
- *Pseudo-element target-expanders* — rejected: invisible complexity,
  buttons here have room to simply be big enough.

## R5: How do login/ranking/winners hold up at phone widths (FR-007, US3)?

**Decision**: Minimal CSS-only pass on the three secondary screens:
- Global: Next.js already emits
  `<meta name="viewport" content="width=device-width, initial-scale=1">`
  by default (bundled docs `generate-viewport.md`: "The viewport meta tag
  is automatically set, and manual configuration is usually unnecessary"),
  so `globals.css`'s existing `overflow-x: hidden` plus device-width
  viewport means no zoom-out page shrink occurs. No `viewport` export is
  added — following the docs' "manual configuration is usually
  unnecessary" guidance.
- Ranking/winners (`app/ranking/page.module.css`): verify name + rank +
  score rows fit 320 px (they are short first names — they do); only
  adjust if the quickstart check finds an overflow.
- Login: check the Google button + error text (`max-width: 320px` on
  `.loginError` is exactly at the tightest viewport; give it a 16px page
  padding so it never touches the edge).

**Rationale**: The three screens are simple centered stacks; a check-first
approach avoids speculative redesign (Principle V) while satisfying US3.

**Alternatives considered**:
- *Full responsive redesign of ranking tables* — rejected: nothing in
  US3/FR-007 demands it; existing rows are simple short-name lists.
- *Custom `viewport` export with `maximumScale=1, userScalable=false`* —
  rejected: docs' default is sufficient and `user-scalable=no` harms
  accessibility without a briefing purpose.
