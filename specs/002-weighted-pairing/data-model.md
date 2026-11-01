# Data Model: Weighted Pair Selection

Feature: 002-weighted-pairing | Date: 2026-11-01

This feature introduces **no new stored entities**. It consumes existing
data in a new way.

## Existing entities (unchanged)

### Score

- **Representation**: entry in the Upstash Redis sorted set `namewahl:scores`
  (member = name, score = win count via ZINCRBY). Absent member = score 0.
- **In-memory shape at draw time**: `Record<string, number>` mapping name →
  win count (as returned by `scores()` in `lib/store.ts`).
- **Role in this feature**: read-only input to the weighting function.
- **Validation**: names in the map are a subset of the 200-name list;
  scores are non-negative integers. Missing keys default to 0.

### Pair

- **Shape**: `[string, string]` — two distinct names from the fixed
  200-name list, ordered as displayed.
- **Validity rules (unchanged from feature 001)**:
  - `pair[0] !== pair[1]`
  - not equal to the previous pair in either order
- **New in this feature**: members are selected with probability
  proportional to `score + 1` instead of uniformly.

## Derived values (not stored)

### Weight

- **Definition**: `weight(name) = score(name) + 1`
- **Properties**: positive for every name (reachability, FR-003); equal
  weights for equal scores (uniform fallback, FR-004); linear in score
  (proportionality, FR-002).
- **Lifecycle**: recomputed from the score map on every draw; never
  persisted (FR-006).

### Cumulative weight table

- **Definition**: prefix sums of weights over the 200-name list, used for
  the cumulative draw (research R1).
- **Lifecycle**: transient, built per draw; O(200) — no memory or storage
  concerns.

## State transitions

None. Voting (the only state-changing flow) is unchanged; it continues to
append to the `votes` stream and ZINCRBY the `scores` set atomically.
Weighted selection only alters how the *next* pair is chosen from the
current score state.
