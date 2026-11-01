# Feature Specification: Mobile-Friendly Voting Layout

**Feature Branch**: `008-mobile-vote-layout`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "we need good mobile layout. names should appear left and right, not wrap."

## Clarifications

### Session 2026-11-01

- Q: When a candidate name is too long to fit its card on a small phone, how should the app handle it — shrink the text, cut it off with an ellipsis, or shrink first and only cut it off if it still doesn't fit? → A: Shrink first, ellipsis as last resort (reduce size inside a fixed range, truncate only if still overflowing)
- Q: How large must a tappable element be at minimum to be comfortable to hit with a thumb on a phone? → A: 44 × 44 px minimum touch-target size
- Q: What fallback should the app use when both names in a pair are too long to fit one row at readable sizes on a narrow phone? → A: Squeeze to fit — cards flex slightly narrower, both names stay fully visible in one row, no scrolling

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Names sit side by side on a phone-sized screen (Priority: P1)

A signed-in user opens the name voting screen on a phone (roughly 320–430 px
wide). Instead of the two name cards stacking on top of each other or one card
spilling out of view, the two candidate names are presented left and right of
each other — one on the left side of the screen, one on the right — with the
"vs." label between them. Each name is fully readable on a single line: if a
name is too long to fit, the text is shown smaller first, and only shortened
with an ellipsis as a last resort, rather than breaking onto several lines. The user sees both options at once and
can compare them at a glance, just like on a desktop screen.

**Why this priority**: This is the core request. The whole feature exists so
the voting decision works on a phone; a layout where the names stack or wrap
defeats the purpose.

**Independent Test**: Open the voting screen in a phone-size viewport. Verify
the two name cards are side by side on the same horizontal line, that neither
stacks below the other, and that each name occupies a single line.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a viewport 360 px wide, **When** the voting
   screen with a name pair loads, **Then** the left name card and right name
   card appear side by side on the same row, with neither card wrapped below
   the other.
2. **Given** the two candidate names are long (e.g., a full first and last
   name such as "Constanze-Viktoria Brandenstein"), **When** the pair renders
   at 320 px viewport width, **Then** each name stays on one line (smaller
   type or ellipsis) and remains fully identifiable — no mid-name line breaks.
3. **Given** the same screen on a desktop-size viewport, **When** the pair
   renders, **Then** the side-by-side arrangement is preserved (the layout is
   a natural fit, not a phone-only special case).

---

### User Story 2 - Voting on a phone is comfortable and accurate (Priority: P2)

While voting on a phone, the user can reliably tap the name they prefer. Tap
targets are large enough for a thumb, nothing important sits so close to the
screen edge that it is hard to hit, and after casting a vote the screen
instantly shows the next pair without any layout jumping, shifting, or a
momentary scroll. The overall flow — sign in, vote, see the ranking — feels
like it was designed for the phone, not merely squeezed onto it.

**Why this priority**: Side-by-side names alone are not "good mobile layout";
the voting action itself must be comfortable on a touch screen.

**Independent Test**: On a phone-size viewport, cast several votes in a row.
Verify every pair renders fully in view without scrolling, tapping the
intended name works on the first try, and no layout jump occurs between
pairs.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a phone, **When** each new pair loads, **Then**
   the complete pair (both names and the "vs." separator) fits within the
   visible screen without horizontal scrolling or cropping.
2. **Given** a user taps a name card on a touch screen, **When** the tap
   lands anywhere within the card, **Then** the vote is registered for the
   name on that card.
3. **Given** consecutive votes with pairs of different name lengths, **When**
   the next pair replaces the previous one, **Then** the left and right cards
   keep their positions and the interface does not visibly jump or reflow in a
   disorienting way.

---

### User Story 3 - The rest of the app holds up on a phone (Priority: P3)

The login screen (sign-in affordance) and the ranking view also render
respectably on a phone: content stays within the viewport, text is readable,
buttons are tappable, and no element overflows horizontally. These screens are
secondary to the voting screen, but a "good mobile layout" should not stop at
one screen while others are broken.

**Why this priority**: Nice-to-have completeness of the mobile experience;
the voting screen is the product's core and comes first.

**Independent Test**: Open the login screen and the ranking view at phone
width; confirm no horizontal scrolling and that all interactive elements are
reachable and tappable.

**Acceptance Scenarios**:

1. **Given** a signed-out user on a phone, **When** the login screen renders,
   **Then** the sign-in affordance is visible and tappable without horizontal
   scrolling.
2. **Given** a signed-in user on a phone, **When** the ranking view renders,
   **Then** the ranked names are readable and contained within the viewport.

---

### Edge Cases

- What happens when a candidate name is extremely long (multi-part first
  names, hyphenated surnames)? The name must remain on one line and stay
  identifiable — shrink or ellipsize, never wrap or overflow.
- What happens when both names in a pair are long simultaneously? Both cards
  must remain side by side at readable-at-a-glance size within the viewport:
  flexing narrower per FR-002 is the accepted fallback — the pair row stays
  fixed, never scrollable, never stacking.
- What happens on a very narrow viewport (320 px) or in landscape orientation
  (e.g., 740 × 360)? The side-by-side arrangement must persist wherever the
  two cards remain meaningfully tappable (min 44 × 44 px, Q1/Q2 rules apply);
  names must never be clipped mid-glyph.
- What happens when the user's device font size is enlarged (accessibility
  setting)? Text must still behave per the no-wrap rule without breaking the
  side-by-side arrangement.
- What happens when a vote fails (network error) mid-interaction? This is
  already specified elsewhere; the layout change must not alter or hide the
  existing error notice behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The voting screen MUST display the two candidate names of a pair
  side by side — one left, one right — on a shared row on every screen size,
  including phone-sized viewports.
- **FR-002**: The voting screen MUST NOT allow the name cards to wrap onto
  separate rows at any supported viewport width, for any supported name
  length; when both names of a pair are too long to fit one row at readable
  sizes on a narrow viewport, the cards MUST flex narrower so both names
  remain fully visible in a single row with no scrolling, rather than the
  pair becoming scrollable or either card stacking.
- **FR-003**: Each candidate name MUST be rendered on a single line; when a
  name exceeds its card's width, the system MUST first reduce the text size,
  and only truncate with an ellipsis if the name still does not fit at the
  smallest supported size — never breaking the name onto multiple lines or
  overflowing the card.
- **FR-004**: The user MUST be able to distinguish which side (left/right)
  each name occupies, and the "vs." indicator MUST remain visible between the
  two cards.
- **FR-005**: On phone-sized viewports, the complete voting pair MUST fit
  within the viewport without horizontal scrolling, and every tappable
  element on the voting screen MUST be comfortably touch-target sized
  (minimum 44 × 44 px per clarification Q2).
- **FR-006**: Consecutive pairs of different name lengths MUST render in a
  stable arrangement — the left and right slots keep their sides between
  pairs without disorienting layout jumps.
- **FR-007**: The login screen and ranking view MUST be usable at phone width:
  no horizontal scrolling, readable text, and tappable interactive elements.
- **FR-008**: The layout changes MUST NOT alter any existing voting behavior,
  including instant feedback after a vote, the persistent uncounted-votes
  notice, and error handling.

### Key Entities *(include if feature involves data)*

This feature is presentational only; it introduces no new data entities. It
operates on the existing name pair (two candidate names rendered left/right)
and the existing vote records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At every tested viewport width from 320 px to desktop, both
  name cards of a pair are side by side on one row in 100% of rendered pairs.
- **SC-002**: For the longest names actually present in the app's name list,
  100% of pair renderings at 320 px show each name on a single line with no
  mid-name line break and no horizontal scrolling.
- **SC-003**: A user voting on a phone-size viewport can complete a vote on
  the first tap attempt in at least 95% of attempts (no mis-taps caused by
  cramped or shifted targets).
- **SC-004**: While users vote, the next pair appears in place — no instance of the
  page scroll position or card arrangement visibly jumping between successive
  pairs during a normal voting session.
- **SC-005**: Both users (the entire user base of this two-person app) can
  use the app on their phones and report that nothing feels broken, cut off,
  or awkward (qualitative check, confirmed once per person after rollout).

## Assumptions

- The existing name list (first and last names used for voting) is unchanged;
  this feature changes presentation only, not voting logic, pairing, or
  persistence.
- "Side by side" means left and right slots on the same row; it does not
  prescribe equal card widths — cards may shrink to fit long names.
- A mild text-size reduction on very long names is preferred over truncation;
  an ellipsis is the fallback when even the smallest supported text size does
  not fit (per clarification Q1).
- Supported target: mobile phone browsers in portrait (down to ~320 px) and
  landscape, plus existing desktop browsers. Dedicated native apps, tablets,
  and foldables are out of scope.
- The user request refers to the voting screen ("names … left and right");
  login and ranking are included only to keep the mobile experience coherent
  (User Story 3) — their layouts need not be redesigned beyond basic
  usability.
- Styling-only change, consistent with the project constitution: layout
  adjustments do not require integration tests; a focused check that the
  side-by-side, no-wrap behavior holds serves as the proportionate test.
