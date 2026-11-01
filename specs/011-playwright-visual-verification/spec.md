# Feature Specification: Playwright Visual Verification of Designs

**Feature Branch**: `011-playwright-visual-verification`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "designs are visually verified with playwright"

## Clarifications

### Session 2026-11-01

- Q: When the suite "visually verifies" a screen, what kind of check should it perform? → A: Measure the rendered layout (box rectangles, text lines, scroll widths) and assert the 008–010 guarantees numerically — not screenshot pixel-diffing; additionally, an AI agent visually judges the rendered screens as a review step before the implementation tasks are finished.
- Q: Should the visual suite also run automatically on every push (e.g., on a CI service), or stay a local-only command you run yourself? → A: Local-only — you run the command yourself before pushing/shipping; no CI service.
- Q: When the suite votes through pairs to test static geometry, where should those test votes go — a separate local development database, or your normal local dev data? → A: Dedicated local store for test runs (separate keys/database via test environment config); production untouched by construction.
- Q: How should the failure notice be tested, given the suite runs against a real local server? → A: Intercept/block the vote-request network calls in the test browser only; unblock to test recovery — no app-code test hooks.
- Q: Should the numeric tolerance for "boxes are equal halves" and "pixel-identical across pairs" be exact (0 px) or allow a small tolerance? → A: 1 px tolerance (absorbs browser sub-pixel rounding without masking real geometry drift).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The accumulated layout guarantees are verified automatically (Priority: P1)

A maintainer runs the visual verification suite locally. Without opening a
browser by hand, they get a clear pass/fail answer to the question: "do the
voting screens still look the way features 008–010 designed them?" The suite
renders the signed-in voting screen at the supported phone viewport profiles
(320 × 568, 375 × 667, 430 × 932) and asserts the design guarantees that
were until now only verified by manual DevTools inspection: the two name
boxes sit side by side with the "oder" separator between them and never
wrap; each name stays on a single line (smaller type first, ellipsis only as
a last resort); the box pair spans the full available width with only the
24 px page margin to spare; the boxes are equal, content-independent halves
whose rectangles are pixel-identical from one pair to the next; and the name
type is the visually dominant text on the screen.

**Why this priority**: This is the core value — replacing the manual
quickstart checklists (V2–V4 of features 008–010) with an automated check.
Without it, every layout change risks silent regressions that only a
patient human with DevTools would catch.

**Independent Test**: Run the visual suite with no layout changes pending —
it passes; then run it against a deliberately broken layout (e.g., a
re-introduced width cap) — it fails naming the violated guarantee.

**Acceptance Scenarios**:

1. **Given** the app running locally and a test user signed in, **When** the
   visual suite runs at the 320 × 568 profile, **Then** it asserts the pair
   row touches both available edges (no idle gap beyond the 24 px page
   margin), the two boxes are equal halves, and "oder" sits between them.
2. **Given** the same setup, **When** consecutive pairs are voted through at
   a fixed profile, **Then** the suite asserts the box rectangles are
   pixel-identical from pair to pair regardless of name length (short name
   "Paul" vs long name "Maximilian").
3. **Given** a pair containing the longest supported names, **When** the
   suite inspects the box at 320 px, **Then** it asserts each name renders
   on exactly one line with no ellipsis and at least a few px of margin
   inside its box.
4. **Given** any supported profile, **When** the suite measures the name
   text against the surrounding UI (hint, sign-out, separator), **Then** it
   asserts the name type is the largest text on the voting screen.

---

### User Story 2 - Layout regressions fail loudly, not silently (Priority: P2)

When a future change breaks a design guarantee — a box that resizes around
its text, a re-introduced width cap, a horizontal scroll appearing at 320 px
— the visual suite fails and says exactly which viewport and which
guarantee broke, instead of the regression shipping unnoticed. The suite is
part of the project's standard verification habit: a change is not
considered done until the visual checks pass alongside the existing
automated gates.

**Why this priority**: The suite only delivers lasting value if failures are
actionable and the habit of running it sticks; a silent or vague checker is
worse than none.

**Independent Test**: Inject one layout regression at a time (wrap, cap,
overflow); run the suite; confirm each run fails with a message naming the
violated guarantee and the viewport profile.

**Acceptance Scenarios**:

1. **Given** a change that makes box geometry depend on name content,
   **When** the suite runs, **Then** it fails and its report names
   "static geometry" (or equivalent) and the profile where it failed.
2. **Given** a change that reintroduces horizontal scrolling at 320 px,
   **When** the suite runs, **Then** it fails naming the overflow and the
   viewport width.
3. **Given** a clean layout, **When** the suite runs, **Then** it exits
   successfully with a per-profile summary (no failures, no skipped
   guarantees).

---

### User Story 3 - The whole app surface is covered, not just one screen (Priority: P3)

The suite also verifies the screens and states around the voting pair: the
logged-out sign-in screen, the ranking and winners screens, the landscape
phone behavior (vertical page scroll only — the pair itself never scrolls or
clips mid-box), the desktop/tablet coherence of the enlarged pair (equal
boxes, dominant but proportional type, one centered composition at ≥1024 px,
graceful scaling at 640/768 px), and the failure-notice state appearing and
disappearing without moving or resizing the boxes.

**Why this priority**: These are the inherited contracts from features
008–010's V5/V6 checks; valuable as a full regression net, but only after
the core voting screen is covered.

**Independent Test**: Run the suite and confirm it visits and asserts on
each named screen/state at the named profiles; temporarily break one (e.g.,
an overlap on /ranking) and see the suite catch it.

**Acceptance Scenarios**:

1. **Given** a signed-out state, **When** the suite renders `/` at 320 px,
   **Then** it asserts no horizontal scroll, no clipped text, and first-tap
   tappable buttons.
2. **Given** a signed-in session with at least one vote cast, **When** the
   suite renders `/ranking` and `/winners` at 320 px, **Then** it asserts
   both match the established post-010 layout (no horizontal scroll, no
   clipping).
3. **Given** a landscape phone profile (740 × 360), **When** the suite
   renders the voting screen, **Then** it asserts only vertical page scroll
   occurs and the pair never scrolls or clips mid-box.
4. **Given** a desktop viewport (≥1024 px, plus 640/768 px spot checks),
   **When** the suite renders the voting screen, **Then** it asserts two
   equal boxes with a legible separator, one coherent centered composition,
   and no overflow.
5. **Given** a forced vote-send failure, **When** the notice appears and is
   dismissed, **Then** the suite asserts the pair boxes did not move or
   resize.

---

### Edge Cases

- What happens when the suite cannot sign in (missing test credentials)?
  It fails fast with a setup-oriented message, not a confusing timeout deep
  into a run.
- What happens when a render is slow or fonts load late? The suite waits
  for stable rendering before measuring, so a slow first paint is not
  reported as a layout failure.
- What happens when the vote pool is exhausted mid-run? With the
  dedicated test store (FR-008), the suite starts from a known seeded
  state each run; a genuinely exhausted pool fails setup with a
  setup-oriented message, never as a layout failure.
- What happens when the failure notice is visible during a measurement?
  Notice-visible states are measured deliberately (M3.1); unexpected notice
  states in non-notice scenarios are treated as a setup anomaly and
  reported, not silently ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single visual verification command
  that renders the app's screens in a real browser engine and asserts the
  design guarantees of features 008–010 automatically. The checks are
  measurement-based: the suite reads the rendered layout (box rectangles,
  text line counts, scroll widths, font sizes) and asserts the guarantees
  numerically; it does not rely on screenshot pixel-diffing.
- **FR-011**: Before the feature's implementation tasks are considered
  finished, an AI agent MUST visually judge the rendered screens (a guided
  review of the key states/profiles, checking for anything the numeric
  assertions miss — e.g., visual imbalance, ugly proportions) and its
  findings recorded; only an agent-approved state completes the tasks.
- **FR-012**: The suite is a local-only command: it runs against the
  developer's local dev server and local environment; no CI service or
  unattended push-triggered execution is in scope.
- **FR-002**: The suite MUST verify, at the 320/375/430 px portrait
  profiles, that the name pair renders side by side, unwrapped, with the
  separator between the boxes (008 guarantees).
- **FR-003**: The suite MUST verify that box geometry is static and equal:
  rectangles are pixel-identical across consecutive pairs at a fixed
  profile (within a 1 px tolerance to absorb browser sub-pixel rounding),
  and each box occupies an equal half of the available row width with no
  idle gap beyond the 24 px page margin (009/010 guarantees).
- **FR-004**: The suite MUST verify the text-fitting chain: names render on
  one line, shrink before truncation, no ellipsis for any supported name at
  ≥320 px, and the name type is the dominant text on the voting screen.
- **FR-005**: The suite MUST verify no horizontal scrolling and no clipped
  or overlapping elements on `/` (signed in and logged out), `/ranking`, and
  `/winners` at the supported profiles, plus landscape (740 × 360) vertical-
  scroll-only behavior.
- **FR-006**: The suite MUST verify the desktop/tablet presentation
  (≥1024 px, spot checks at 640/768 px): equal boxes, dominant but
  proportional type, one coherent centered composition.
- **FR-007**: The suite MUST verify the failure notice appears and
  disappears without moving or resizing the pair boxes. The failure is
  produced by intercepting/blocking the vote-request network calls in the
  test browser (unblocking them restores normal sending so recovery can
  be tested in the same run); the app ships no test-only failure switch.
- **FR-008**: The suite MUST run entirely against a local development
  instance and MUST NOT write any data to the production store (votes cast
  during visual checks never touch real tallies). Test runs MUST use a
  dedicated local store (separate keys/database selected via test
  environment configuration), so test votes never mix with normal
  development data and production is isolated by construction, not by
  careful configuration.
- **FR-009**: A failed visual check MUST report which guarantee was
  violated and at which viewport profile, in a form readable without
  diving into tool internals.
- **FR-010**: The suite MUST be stable: a passing layout never produces
  intermittent failures (rendering and fonts are given time to settle
  before any measurement).

*(FR numbering note: FR-011/FR-012 were added by the 2026-11-01
clarification session; numbering follows insertion order.)*

### Key Entities *(include if feature involves data)*

None — this feature introduces no new data entities. It observes the
existing screens and reuses the existing name pool, users, and vote flow;
it adds no keys, fields, or state to the application itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the current main branch, the full visual suite runs to
  completion with zero failures.
- **SC-002**: The suite completes a full run in under 2 minutes on a
  development machine.
- **SC-003**: Each of the following deliberately injected regressions is
  detected and reported with the violated guarantee and viewport: a
  reintroduced box width cap, a text-wrap-enabled name, a removed equal-
  halves rule, and a horizontal overflow at 320 px (verified once during
  bring-up, then removed).
- **SC-004**: Ten consecutive runs on an unchanged layout produce identical
  results (no flaky failures; geometry comparisons use the 1 px tolerance
  fixed in FR-003).
- **SC-005**: Zero writes reach the production data store during any suite
  run.
- **SC-006**: The manual quickstart checklists V2–V6 of features 008–010
  can each be answered by the suite's assertions (the manual checks become
  optional spot checks rather than the only verification).
- **SC-007**: The final rendered states pass an AI agent's visual judgment
  review (no objection to proportions, balance, or overall look) before the
  implementation tasks are marked finished.

## Assumptions

- "Visually verified with Playwright" is the user's stated direction: the
  browser-automation mechanism is Playwright; the spec deliberately
  describes WHAT must be verified, leaving selectors, measurement
  techniques, and runner wiring to `/speckit.plan`.
- Checks run locally against a development instance (dev server +
  dedicated test store per FR-008), consistent with the free-plan budget;
  production data is never touched.
- A test user credential for signing in is available in the local
  development environment (the app has exactly two approved users; a
  development-mode sign-in path or local credentials file will be used —
  mechanism decided at planning).
- The supported viewport set is inherited from features 008–010: 320 ×
  568, 375 × 667, 430 × 932 portrait; 740 × 360 landscape; 640/768 px spot
  checks; ≥1024 px desktop.
- Playwright is added as a development-only dependency; application bundle
  size and runtime behavior are unaffected.
- The existing unit/integration gates remain unchanged; the visual suite
  complements them (styling/layout finally gets automated coverage, which
  the earlier features' manual checklists only promised).
- No CI integration is in scope (clarified 2026-11-01): the suite is run
  manually by the maintainer as part of the pre-ship habit; CI wiring may
  be reconsidered by a future feature.
