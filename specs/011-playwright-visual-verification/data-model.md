# Data Model: Playwright Visual Verification of Designs (011)

Date: 2026-11-01.

## Entities

**None in the application.** This feature introduces no new application
data entities, keys, fields, or state. It observes existing screens and
reuses the existing name pool, user records, and vote flow.

## Suite-side model (test infrastructure, not application data)

The suite's own conceptual objects — they exist only inside
`tests/visual/` and `.env.visual`:

### Viewport Profile

A named browser geometry at which scenarios render and measure.

| Aspect | Value |
|---|---|
| Phone portrait | 320 × 568, 375 × 667, 430 × 932 |
| Phone landscape | 740 × 360 |
| Tablet spot checks | 640 × ~960, 768 × ~1024 |
| Desktop | 1280 × ~800 |
| Usage | Every scenario selects profiles from this set (spec Assumptions) |

### Measurement

A point-in-time numeric reading of the rendered layout taken inside the
page after the settle protocol (research R4):

| Measurement | Source | Feeds guarantee |
|---|---|---|
| Box rect (x, y, width, height) | `getBoundingClientRect()` on each `.nameButton` | equality, staticity, maximality |
| Row rect | bounding rect spanning both boxes + separator | maximality (24 px margins) |
| Separator presence/position | `.vs` element rect, between the boxes | 008 side-by-side rule |
| Name line count | `Range.getClientRects()` on the name text node | one-line rule |
| Ellipsis state | `scrollWidth > clientWidth` on the name element | ellipsis-last-resort |
| Font size (name vs hint/aux) | `getComputedStyle().fontSize` | dominant type |
| Page scroll width | `document.scrollingElement.scrollWidth` vs `clientWidth` | no horizontal scroll |
| Element overlap | rect intersection among sibling UI blocks | no-overlap rule |

### Tolerance

| Constant | Value | Applied to |
|---|---|---|
| GEOMETRY_TOLERANCE_PX | 1 | equality of box rects, pair-to-pair rect identity (spec Q5, FR-003) |

### Scenario

One verification behavior: (profiles × screen/state × guarantees). Each
scenario asserts guarantees via `guarantees.ts` and reports failures as
"{guarantee} violated at {profile}" (FR-009). Scenario inventory follows
the spec's user stories: vote-layout (US1/US2), fitting (FR-004),
screens/landscape/desktop (US3), notice stability (FR-007).

### Test-store state (prefix-isolated, research R3)

| Aspect | Rule |
|---|---|
| Key namespace | `namewahl-visual-test:*` (via `STORE_KEY_PREFIX` in `.env.visual`) |
| Pre-run reset | SCAN + DEL all `namewahl-visual-test:*` keys, then natural re-seed on sign-in/votes |
| Repeatability | Every run starts from the same empty-namespace state (SC-004) |
| Production isolation | No suite code path can omit the prefix — all keys flow through `lib/store.ts` (SC-005) |

### Screenshot set (agent review input, research R7)

One full-page screenshot per key state/profile, written to
`tests/visual/screenshots/` (gitignored) after a green run; the set is
the input for the FR-011 agent judgment review that gates task
completion.

## State transitions

None — the suite is stateless between runs by design (reset + seed);
within a run, the only transition is signed-out → signed-in (once,
captured as storage state) and notice-hidden → notice-visible → notice-
dismissed (within the notice scenario).
