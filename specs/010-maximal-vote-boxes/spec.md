# Feature Specification: Maximal Vote Boxes

**Feature Branch**: `010-maximal-vote-boxes`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "in the mobile layout, boxes should be of equal size and not move (the previous spec is correct here), but they should also be as large as possible!"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Vote boxes fill the phone screen edge to edge (Priority: P1)

A signed-in user opens the voting screen on a phone. The two name boxes
have grown as large as the screen allows: together with the "oder"
separator they span the full width available to the voting area, and each
box is as tall as the screen comfortably permits. The name text inside
each box renders as large as the space supports. One clean, decisive tap
per side on a comfortably huge target — the boxes dominate the viewport
instead of floating as two modest buttons in the middle of it.

**Why this priority**: This is the core request ("as large as possible!");
everything else preserves constraints that are already satisfied.

**Independent Test**: Open the voting screen at a phone-size viewport and
measure: the pair row spans the full available width (no idle horizontal
margins beyond whatever the app already applies globally), the boxes
together occupy the dominant share of the screen area, and the name type
is visibly larger than the surrounding hint text.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a phone-size viewport (320–430 px wide),
   **When** the voting screen with a pair loads, **Then** the two name
   boxes together span the full available width of the voting area
   (left box at the left edge of the available area, right box at the
   right edge), with the "oder" separator between them.
2. **Given** the same screen at 320 px, **When** the pair renders, **Then**
   each box is substantially larger than before this feature — its height
   is comfortably more than the minimum touch size and its area dominates
   the visible voting region.
3. **Given** a phone-size viewport with names of any supported length,
   **When** the pair renders, **Then** the name text within each box
   renders at the largest size that fits inside the fixed box (per the
   inherited shrink-then-ellipsis rules), visibly more prominent than any
   hint or auxiliary text on the screen.

---

### User Story 2 - Bigger boxes change nothing else (Priority: P2)

While the boxes have grown, every guarantee the mobile layout already
made continues to hold: the boxes are equal in size and never move or
resize between consecutive pairs (feature 009), names never wrap
(feature 008), the pages never scroll horizontally, neighboring elements
(sign-out button, hint text, notice) keep their sane placement, and
voting behavior itself is untouched. Nothing else on the screen shifts,
shrinks, or crowds to make room for the enlarged boxes beyond what the
user can immediately see as intentional.

**Why this priority**: The enlargement is only a win if it doesn't
regress the previous three features; this story is the regression guard.

**Independent Test**: Cast 10+ consecutive votes at a phone-size
viewport; confirm boxes are static and equal across pairs, names fit on
one line, and vote registration/tallies behave exactly as before.

**Acceptance Scenarios**:

1. **Given** consecutive pairs of different name lengths at a phone-size
   viewport, **When** each new pair replaces the previous one, **Then**
   both boxes keep the exact same position and size (equal halves,
   pixel-static per feature 009) while containing the enlarged
   presentation.
2. **Given** a user voting rapidly in an alternating left/right pattern,
   **When** votes are cast, **Then** every vote lands on the intended
   side and the session tally in the ranking view matches the taps cast
   (behavior unchanged).
3. **Given** the failure notice appears (votes could not be counted),
   **When** it renders or is dismissed, **Then** the enlarged boxes do
   not move or resize (notice occupies its own space, per feature 009).

---

### User Story 3 - The desk too keeps a workable pair (Priority: P3)

On desktop the pair row also uses the enlarged presentation proportion:
the two equal boxes share the space generously with the separator
between, without the pair row deteriorating into two distant islands
with a huge gap in the middle, and without the enlarged typography
looking broken or comically oversized.

**Why this priority**: The request targets mobile; desktop must remain
presentable but is not the point of the feature.

**Independent Test**: Open the voting screen at a desktop viewport;
confirm the pair row is coherent (equal boxes, readable separator,
balanced composition) and nothing overflows.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **When** a pair renders, **Then** the
   two boxes are equal in size and the composition looks intentional —
   boxes and separator form one coherent row, not two stretched islands.
2. **Given** a desktop viewport, **When** any supported pair renders,
   **Then** no text overflows its box and no horizontal scrolling is
   introduced.

---

### Edge Cases

- What happens when a name is long ("Maximilian")? The enlarged box is
  *bigger*, so the inherited fitting rules (shrink within the supported
  size range, ellipsis only as last resort) apply inside a larger area —
  names should fit with *more* margin than before, never less.
- What happens when a name is very short ("Paul")? The box stays at its
  maximal fixed size for the viewport; the text sits inside the larger
  box (short names never shrink the box).
- What happens when the enlargement would exceed what the viewport can
  hold (very small landscape viewport, split screen)? The "as large as
  possible" is bounded by the space actually available per orientation,
  and the no-wrap/no-scroll guarantees of feature 008 still win: boxes scale to
  the space actually available without horizontal scrolling.
- What happens when the device font size is enlarged (accessibility)?
  The static-geometry rule (feature 009) still holds pair to pair, and
  the inheritance fitting rules operate inside the enlarged boxes.
- What happens to the hint text, sign-out button, and notices around the
  enlarged pair? They keep their purpose and remain visible and tappable;
  the enlargement must not swallow the surrounding UI entirely — the
  voting screen must still read as one designed screen, not as two boxes
  with lost chrome.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On phone-sized viewports, the two name boxes MUST be as
  large as possible: the pair row MUST span the full width actually
  available to the voting area (no idle horizontal margins between the
  row and the available edges beyond what the app already applies
  globally), and each box's height MUST be generously larger than the
  minimum touch-target size so the pair visibly dominates the viewport.
- **FR-002**: The enlarged boxes MUST keep the equal-size, static
  geometry of the previous feature: equal halves, fixed positions and
  fixed sizes across consecutive pairs at a given viewport (boxes never
  move, grow, or shrink between pairs).
- **FR-003**: The inherited single-line fitting rules MUST hold inside
  the enlarged boxes: names render on one line, shrinking first within
  the supported size range and only truncating with an ellipsis as the
  last resort; names MUST fit with at least as much margin as before the
  enlargement (the larger box must not make long names harder to fit).
- **FR-004**: Within each enlarged box, the name text SHOULD render as
  large as the box supports so the choice is instantly readable at arm's
  length (name text visibly dominant over hint/auxiliary text).
- **FR-005**: The "oder" separator MUST remain visible between the boxes
  at all supported widths and in the enlarged composition.
- **FR-006**: The enlargement MUST NOT introduce horizontal scrolling,
  vertical scrolling of the pair itself, or any clipped/overlapping box
  at any supported viewport width; the no-wrap and no-scroll guarantees
  of the previous features still hold.
- **FR-007**: The surrounding voting-screen elements (sign-out button,
  hint text, persistent uncounted-votes notice, error notices) MUST
  remain visible, sane, and tappable around the enlarged boxes; the
  enlarged pair MUST NOT overlap or crowd out these elements entirely.
- **FR-008**: On desktop viewports the enlarged presentation MUST scale
  proportionally so the pair row remains a coherent composition (equal
  boxes, visible separator, no absurd two-islands layout); the desktop
  arrangement stays recognizably the same app.
- **FR-009**: The enlargement MUST NOT change any behavior: vote
  submission, instant pair swap, per-user tallies, notice/dismissal, and
  error handling remain exactly as before.

### Key Entities *(include if feature involves data)*

This feature is presentational only; it introduces no new data entities.
It constrains the size of the existing voting pair boxes (equal static
halves) on the existing vote screen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At every phone-size viewport tested (320 / 375 / 430 px),
  the pair row spans ≥ 95% of the width actually available to the voting
  area, with zero gap between row and available edge beyond the existing
  global page margin.
- **SC-002**: At the same viewports, each name box's area is visibly
  larger than under the previous implementation — both box dimensions are
  at least ~1.5× their previous footprint in the voting composition, and
  the two boxes together cover the dominant share of the visible voting
  region (qualitative confirmation by both users after rollout).
- **SC-003**: Across 10+ consecutive pairs of varying name lengths at any
  tested phone viewport, 0 movements or size changes of any box occur
  (the static-geometry guarantee of the previous feature is preserved
  intact) and both boxes remain exactly equal in size in every pair.
- **SC-004**: For the longest names in the app's name set, 100% of pair
  renderings at 320 px show the name on one line inside its enlarged box
  with no mid-name break, no ellipsis, and no horizontal scrolling (the
  enlarged box must not have made fitting harder than before).
- **SC-005**: Both users of this two-person app can vote on their phones
  without mis-taps (targets enlarged, not shrunk) and report the enlarged
  pair reads as the clear focal element of the voting screen (qualitative
  check, once per person after rollout).

## Assumptions

- The previous feature's static, equal-halves geometry is confirmed
  correct and carried forward unchanged (FR-002); this feature only
  changes how large the static boxes are, not their staticity or
  equality.
- "As large as possible" is bounded by the screen the voting area already
  occupies: horizontal growth fills the row to the edges of the available
  area; vertical growth is limited by keeping the surrounding elements
  (hint text, sign-out, notices) on screen and singly tappable, and by
  avoiding page scrolling while the pair is in view.
- The available-width baseline is the current global page padding; the
  enlargement may reduce padding *inside the pair row*'s own immediate
  surrounding (e.g. margins between the row and its available edges), but
  must not change the app's global page padding elsewhere.
- The inherited fitting rule (shrink first, ellipsis last resort) and
  touch-target floor (44 × 44 px minimum) remain in force unchanged.
- Typographic enlargement on desktop is proportional, not identical to
  mobile: the desktop row keeps its balanced, centered look.
- Styling-only change consistent with the project constitution: no
  voting-logic, pairing, or persistence changes; layout/size changes do
  not require integration tests; a proportionate check that the
  staticity/equality/maximality behavior holds serves as verification.
