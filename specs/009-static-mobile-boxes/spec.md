# Feature Specification: Static Mobile Pair Boxes

**Feature Branch**: `009-static-mobile-boxes`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "boxes in the mobile layout should not move. sizes should be static"

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

### User Story 1 - Pair boxes stay put while voting (Priority: P1)

A signed-in user votes on a phone. After every vote, the next pair appears
with its two name boxes in exactly the same position and at exactly the same
size as the pair before it. Nothing shifts, grows, shrinks, or slides: the
left box is always the left box, the right box is always the right box, the
"vs." separator never moves, and tapping the same spot on the screen taps the
same side twice in a row. The voting screen feels like a fixed control panel
rather than something that rearranges itself with every interaction.

**Why this priority**: This is the core request. Boxes that move between
pairs undermine muscle memory and cause mis-taps; static boxes make voting
fast and predictable.

**Independent Test**: On a phone-size viewport, cast several votes
consecutively and compare the screen between pairs. Verify box positions and
sizes are pixel-identical from pair to pair.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a phone-size viewport, **When** a vote is
   cast and the next pair loads, **Then** every box (left name box, right
   name box, "vs." separator) occupies the same position and size it had in
   the previous pair.
2. **Given** consecutive pairs contain names of very different lengths (one
   pair of short names, the next of long names), **When** the next pair
   renders, **Then** box boundaries do not change — the new text is fitted
   into the existing boxes, not the boxes resized around the text.
3. **Given** a voting session of at least five consecutive votes, **When**
   each pair replaces the previous one, **Then** the page scroll position
   stays fixed and no box visibly moves, resizes, or reflows at any point.

---

### User Story 2 - Tap targets are dependable (Priority: P2)

Because the boxes never move, the user can trust where the tap targets are.
Tapping the left half of the voting area always selects the left name, and
tapping the right half always selects the right name — including the tap
immediately after a vote, when a user is often tapping rapidly. A user can
vote quickly in succession (tap left, tap right, tap left, …) and every tap
lands on the intended name.

**Why this priority**: The payoff of static boxes is reliable tapping;
without this the static layout delivers little extra value.

**Independent Test**: Rapidly cast alternating votes (left, right, left,
right) on a phone-size viewport. Verify each vote is registered for the
intended side with no mis-taps attributable to shifting targets.

**Acceptance Scenarios**:

1. **Given** a user casting votes rapidly in an alternating left/right
   pattern, **When** each tap lands at the same screen coordinates, **Then**
   each vote is counted for the name shown in that position at tap time.
2. **Given** a pair whose text does not fill its box (short names), **When**
   the user taps anywhere within that box's fixed area, **Then** the vote is
   registered (the whole fixed-size box is the tap target, not just the
   visible text).
3. **Given** the user taps twice in quick succession as a pair transition
   completes, **When** the second tap lands, **Then** it cannot accidentally
   cast a vote for an unintended side — the tap target under any given
   screen position belonged to the same side immediately before and after
   the transition, so wherever the second tap lands it selects a deliberate
   side (or is absorbed by standard rapid-tap gesture handling).

---

### User Story 3 - The static size choice is readable on the narrowest screen (Priority: P3)

When the fixed box sizes are chosen, they hold across all supported name
lengths: the size must be one that fits the longest names the app can
encounter without wrapping, truncating mid-name, or overflowing at the
narrowest supported viewport (320 px). Users never see names cut off or
squeezed illegibly just because the sizes are static.

**Why this priority**: Static sizes must not break the readability rules
established for the mobile layout (008); this keeps the two features
consistent.

**Independent Test**: Render the longest-present names on a 320 px viewport.
Verify each name stays on one line and fully identifiable inside its
fixed-size box with no overflow.

**Acceptance Scenarios**:

1. **Given** the longest names present in the app, **When** a pair renders at
   a 320 px viewport, **Then** each name remains fully identifiable on one
   line within its fixed-size box (shrinking text per 008, ellipsis as the
   last resort), with no overflow outside the fixed box edges.
2. **Given** a very narrow viewport such as 320 px, **When** any supported
   pair renders, **Then** the fixed box geometry does not cause the pair row
   to overflow the viewport or trigger horizontal scrolling.

---

### Edge Cases

- What happens when a long-name pair follows a short-name pair? Same
  rectangles both times; only the text inside changes (text fitting per
  008's shrink-then-ellipsis rule).
- What happens when device orientation changes (portrait to landscape)? Box
  geometry must recalibrate deterministically for the new viewport so that
  boxes are static *within* an orientation; a change of viewport (rotation,
  window resize) may update the static geometry, but boxes must then stay
  fixed from pair to pair under the new geometry.
- What happens when the device font setting is enlarged? The static geometry
  rule still applies pair to pair; fitting adjustments happen to the text,
  not the boxes, per 008.
- What happens if the persistent uncounted-votes notice appears above the
  voting area? It must not cause the vote boxes themselves to move; the
  notice may occupy its own fixed space (e.g., above the pair row), but the
  pair boxes' positions must remain unchanged across appearances and
  disappearances of such notices.
- What happens when a vote fails with a network error? The error notice
  behavior specified elsewhere must not alter box geometry or position.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On the voting screen at phone-sized viewports, the two name
  boxes and the "vs." separator MUST each hold a fixed position and fixed
  size across consecutive pairs: rendering the next pair MUST NOT move,
  grow, shrink, or reflow any box.
- **FR-002**: The name boxes MUST NOT be sized by their text content; the
  text is fitted into the fixed-size boxes (using the 008 rules: shrink text
  first, ellipsis only if it still does not fit), never the reverse.
- **FR-003**: Each fixed-size name box MUST be a complete tap target for its
  side; tapping anywhere within a box's fixed area MUST register a vote for
  the name displayed there, regardless of whether the text fills the box.
- **FR-004**: The fixed geometry MUST be determined per viewport size (and
  per device font setting) so that, at the narrowest supported viewport
  (320 px), even the longest-present names remain readable on one line
  inside the boxes with no overflow and no horizontal scrolling.
- **FR-005**: A change of viewport or device font setting MAY change the
  static geometry once; after that change, box positions and sizes MUST
  again remain fixed across consecutive pairs under the new geometry.
- **FR-006**: Any status or notice elements (uncounted-votes notice, error
  messages) that appear above, below, or around the voting pair MUST NOT
  change the position or size of the voting boxes.
- **FR-007**: Box-fixed behavior MUST NOT alter any existing voting
  behavior: instant feedback after a vote, pairing order, vote persistence,
  and error handling all remain as previously specified.
- **FR-008**: The voting boxes MUST be at least 44 × 44 px at every
  supported viewport, consistent with 008's touch-target requirement, and
  this minimum must be preserved even while keeping geometry fixed.

### Key Entities *(include if feature involves data)*

This feature is presentational only; it introduces no new data entities. It
constrains how the existing name pair (two candidate names) and the existing
vote records are displayed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a session of at least 10 consecutive votes at a
  phone-size viewport, 100% of pair transitions show zero movement or size
  change of any box (positions and sizes unchanged).
- **SC-002**: At a 320 px viewport, 100% of pairs with the longest
  names present in the app show each name fully identified on one line
  inside its fixed box with no overflow or horizontal scrolling.
- **SC-003**: A user voting rapidly in an alternating left/right pattern
  completes at least 95% of taps as intended votes (no mis-taps due to
  moving targets).
- **SC-004**: Both users (the entire user base) can vote on their phones and
  report that boxes never jump or resize between pairs (qualitative check,
  once per person after rollout).

## Assumptions

- This spec refines feature 008 ("Mobile-Friendly Voting Layout") on the
  same voting screen; where it constrains 008's allowance for cards to "flex
  narrower" per pair (008 clarification Q3), FR-001/FR-002 wins: card sizes
  are chosen statically per viewport instead of flexing per pair.
- The static geometry is chosen per breakpoint/viewport rather than per pair:
  the app decides the fixed box layout for the current viewport once, and
  fits names into it using 008's shrink-then-ellipsis rules.
- Rotation, window resize, or a changed device font size counts as a new
  viewport; boxes may then re-set their static geometry once and stay fixed
  thereafter.
- No voting logic, pairing, or persistence changes; this stays a
  presentation-only change consistent with the project constitution, so a
  proportionate focused test of the static-box behavior suffices (no
  integration tests).
- The 44 × 44 px minimum touch target (008 clarification Q2) still applies,
  including that fixed geometry must satisfy it at every supported width.
