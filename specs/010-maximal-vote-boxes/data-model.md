# Data Model: Maximal Vote Boxes (010)

Date: 2026-11-01.

## Entities

**None.** This feature is presentational only (spec: "This feature is
presentational only; it introduces no new data entities"). It constrains
the *size* of the existing voting pair boxes.

- The existing name pair (`Pair = [string, string]`, `lib/pairing.ts`) is
  unchanged — pairing, queueing, and persistence all operate exactly as
  before (FR-009).
- No new keys, fields, state, or state transitions are introduced.
- No persistence, no Upstash traffic, no API surface changes.

## "Layout state" of the pair row

The only state this feature introduces lives entirely in the stylesheet,
as declarative size constraints on the existing static equal halves
(feature 009's `flex: 1 1 0` row). It is not application state:

| Aspect | Rule (carried forward or changed by 010) |
|---|---|
| Box width | Equal halves of the available row (010 removes the `44vw` cap → halves now stretch to the full available width; still content-independent, 009) |
| Box height | Grown via vertical padding 22 → 30 px; still fixed per viewport, content-independent (no text- or notice-driven resizing) |
| Text fitting | Inherited 008 chain: font clamp shrinks first (floor 15 px, slope 4.6vw, new cap 40 px), ellipsis only as last resort — verified strictly no worse than 009 at every width (research R3/R4) |
| Staticity/equality | Carried forward unchanged from 009: pixel-identical positions and sizes across consecutive pairs at a given viewport; notices never move the boxes |
| Viewport change | Counts as a new viewport: static geometry re-derives once, then stays fixed (009 S1.6) |

Validation rules from the spec (FR-001…FR-009) are enforced by the CSS
contract in `contracts/maximality.md`, not by runtime code.
