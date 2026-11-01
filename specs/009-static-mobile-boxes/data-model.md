# Data Model: Static Mobile Pair Boxes (009)

Date: 2026-11-03.

## Entities

**None.** This feature is presentational only (spec: "This feature is
presentational only; it introduces no new data entities"). It constrains
how the existing identity pair is displayed.

- The existing name pair (`Pair = [string, string]`, `lib/pairing.ts`) is
  unchanged — pairing, queueing, and persistence all operate exactly as
  before (FR-007).
- No new keys, fields, state, or state transitions are introduced.
- No persistence, no Upstash traffic, no API surface changes.

## "Layout state" of the pair row

The only state this feature introduces lives entirely in the stylesheet,
as declarative layout constraints on the existing DOM (two buttons +
separator inside one flex row). It is not application state:

| Aspect | Rule |
|---|---|
| Box width | Determined by flexbox per viewport (equal halves; separator and gaps fixed) — never by name text length |
| Box position | Direct consequence of box widths (row is a fixed sequence: left box, "oder", right box) — static per viewport |
| Text fitting | Name text is fitted into its immutable box via 008's mechanisms: font clamp shrinks first, ellipsis only as last resort |
| Orientation/font-size change | Counts as a new viewport: the static geometry is re-derived once, then stays fixed across consecutive pairs |

Validation rules from the spec (FR-001…FR-008) are enforced by the CSS
contract in `contracts/static-layout.md`, not by runtime code.
