# Feature Specification: Instant Vote Feedback

**Feature Branch**: `003-instant-vote-feedback`

**Created**: 2026-11-01

**Status**: Draft

## Clarifications

### Session 2026-11-01

- Q: When a vote cannot be recorded at all (connection stays down for the rest of the session), what should the user ultimately see? → A: B — retry for a while, then show a persistent "N votes didn't count" notice that stays until dismissed.
- Q: How eagerly should the pair reserve be refilled — at what point during a voting session does the app fetch fresh scores and prepare the next batch? → A: B — just-in-time refill: top up the reserve only when it drops below a small threshold (e.g., fewer than 2 pairs left).
- Q: How long should the app keep retrying a failed vote before giving up and showing the "N votes didn't count" notice? → A: B — time-boxed: retry for a few minutes, then give up and show the notice.
- Q: While a failed vote is still within its retry window (not yet given up on), should the user be shown any indication that voting is degraded? → A: No indication during the retry window — the experience stays clean until the notice appears.
- Q: When the pair reserve runs dry despite just-in-time refills (e.g., very rapid tapping on a slow connection), what should the wait look like? → A: Brief unobtrusive loading indication on the pair area, taps disabled until the next pair arrives.

**Input**: User description: "Have seemingly instant acceptance of votes and loading of next pairs. Do it by prefetching pairs in batches and decoupling the actual updates/fetches from the presentation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tap a name, next pair appears instantly (Priority: P1)

A user taps one of the two names. Their choice is accepted immediately — the
tapped name gives visible feedback and the next pair of names appears without
any perceptible wait, even though the vote is still travelling to the backend.
If the vote later fails to record, the user is told clearly and the current
pair stays put (existing behaviour from feature 001 is preserved).

**Why this priority**: This is the core of the feature — voting is the app's
only interaction, and any visible lag between tap and next pair directly
undermines the "quick round" feel. Everything else is secondary.

**Independent Test**: Cast a vote and measure the time until the next pair is
fully visible; can be fully tested by tapping through a session and observing
that no tap-to-next-pair wait is ever perceptible, while votes still count.

**Acceptance Scenarios**:

1. **Given** a pair is displayed, **When** the user taps a name, **Then** the
   next pair appears immediately (no waiting state that blocks interaction
   visibly), and the vote is accepted without the user having to wait for any
   network round trip to finish.
2. **Given** a vote was cast, **When** the user looks at the pair area,
   **Then** there is no spinner, disabled period, or blank flash between
   accepting the vote and showing the next pair.
3. **Given** a vote fails to be recorded (e.g., connection error), **When**
   the next pair was already shown, **Then** the user sees a clear error
   message about the vote not counting, and the failed vote is not silently
   lost without notice.

### User Story 2 - Steady supply of fresh pairs (Priority: P2)

While a user votes through a session, the app always has the next pair ready
before it is needed. Pairs are prepared in advance in small batches, so a
voting session never stalls waiting for new pair material, even when scores
influence which names are drawn.

**Why this priority**: Prefetching is what makes US1 possible at all, but the
user only perceives it through US1's smoothness. It is a distinct, testable
guarantee (availability of the next pair) and matters most in long sessions.

**Independent Test**: Vote through 20+ pairs rapidly in a row and verify that
no pair transition ever waits on fresh material; can be tested by timing
rapid successive votes.

**Acceptance Scenarios**:

1. **Given** a user is voting through a session, **When** each pair is
   displayed, **Then** at least one further pair is already prepared so the
   next tap never waits for pair generation or score fetching.
2. **Given** the user has voted several times in a row quickly, **When** the
   next pair appears, **Then** it still respects the current standings
   (weighting follows recent votes — feature 002 behaviour preserved).

### User Story 3 - Weighting stays truthful while feeling instant (Priority: P3)

The instant experience does not come at the cost of correctness: pair
selection continues to use the freshest reasonably-available win counts, and
a vote that was shown as accepted is never silently dropped. If a displayed
pair later turns out to be invalid (e.g., it would repeat the immediately
preceding pair), it is replaced by another prepared pair rather than shown
broken.

**Why this priority**: Correctness guard — the feature must not regress
feature 002's weighted selection or feature 001's vote integrity. It is
lower priority because it is a constraint on how US1/US2 behave, not a
user-visible capability on its own.

**Independent Test**: Cast votes and compare subsequent pair frequencies
against expected weighting; can be tested by verifying that heavily-favoured
names still dominate and zero-score names still appear, while all
transitions remain instant.

**Acceptance Scenarios**:

1. **Given** recent votes have shifted the standings, **When** new pairs are
   prepared, **Then** they reflect the updated standings within the same
   session (no need for a reload to see weighting changes).
2. **Given** a pair was prepared before the latest votes, **When** it is
   about to be shown and it would be an exact repeat of the current pair,
   **Then** it is swapped for another prepared pair instead of being
   displayed as an invalid repeat.

## Edge Cases

- What happens when the connection drops mid-session? Votes are queued and
  retried rather than lost; the user keeps getting pairs (from the prepared
  reserve). If the connection stays down and a time-boxed retry window
  (a few minutes) is exhausted, a persistent "N votes didn't count" notice
  is shown until dismissed.
- What happens when the prepared pair reserve runs empty (e.g., extremely
  rapid tapping on a very slow connection)? The pair area shows a brief
  unobtrusive loading indication with taps disabled until the next pair
  arrives — but no invalid state (empty pair, repeated pair) is ever shown.
- What happens when a queued vote is retried and succeeds twice (double
  submission)? Each vote is recorded at most once — a retry after a confirmed
  success must not count the same vote twice.
- What happens when the user votes on the very last prepared pair just as
  scores refresh? The vote is still accepted instantly; the refreshed scores
  influence the next batch of prepared pairs, not the one already shown.
- What happens when the user closes the tab with votes still in flight?
  Unsent votes are lost silently acceptable (toy project) — but any vote the
  user saw "accepted" on the pre-close screen must have already been
  dispatched.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a vote immediately upon tap, without
  blocking on the vote's network round trip; visible feedback (the next pair)
  appears without perceptible delay.
- **FR-002**: The system MUST prepare upcoming pairs in advance in small
  batches so that a next pair is available before the user votes again. The
  reserve MUST be refilled just-in-time: fresh scores are fetched and a new
  batch prepared only when the reserve drops below a small threshold (e.g.,
  fewer than 2 pairs left), not after every vote and not on a timer.
- **FR-003**: The system MUST decouple the recording of votes and the
  fetching of scores from the presentation of pairs: presentation MUST NOT
  wait for either to complete.
- **FR-004**: The system MUST show a clear error message when a vote fails to
  be recorded, and MUST NOT count the vote in that case (feature 001 FR-012
  behaviour preserved). If retries also fail, the system MUST surface a
  persistent "N votes didn't count" notice that remains until dismissed.
  Failed votes are retried for a bounded time (a few minutes) before the
  notice appears. During that retry window the experience MUST stay clean —
  no degraded-voting indication is shown until the notice appears.
- **FR-005**: The system MUST ensure each user action results in at most one
  recorded vote: retries after uncertain outcomes MUST NOT double-count.
- **FR-006**: Pair preparation MUST continue to respect feature 002's rules:
  both members drawn by weighted selection from current standings, members
  distinct, no exact repeat of the immediately preceding pair (either order).
- **FR-007**: Prepared pairs MUST be drawn using the freshest reasonably
  available scores; refreshed scores influence subsequent preparations, not
  pairs already shown to the user.
- **FR-008**: The system MUST keep working correctly when the prepared
  reserve is exhausted: it MAY show a brief unobtrusive loading indication
  on the pair area with taps disabled until the next pair arrives, but MUST
  never show an invalid pair (identical members, immediate exact repeat) or
  an empty pair area as a "pair".
- **FR-009**: The existing single-user selection (Person A/B), ranking page,
  and winners page MUST be unaffected by this feature.

### Key Entities *(include if feature involves data)*

- **Pair**: two distinct name strings, prepared ahead of display; carries no
  persistent state — purely a transient hand-off between preparation and
  presentation.
- **Vote record**: one user's choice (winner, loser, who); existing stored
  entity, unchanged by this feature — the feature only changes WHEN it is
  sent (async, possibly queued) and how failures surface.
- **Score map**: current win counts per name; read asynchronously and
  refreshed independently of presentation, used at preparation time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From tapping a name to the next pair being fully visible takes
  less than 100 milliseconds under normal conditions (prepared pair
  available) — indistinguishable from instant.
- **SC-002**: In a rapid 20-vote session, zero pair transitions exhibit a
  visible waiting state (spinner, disabled period, blank flash).
- **SC-003**: A vote cast while the app is offline is recorded once the
  connection returns, and is never counted twice.
- **SC-004**: Pair frequency distributions across a session remain consistent
  with the weighted-selection spec (feature 002): favourites appear
  measurably more often, every name remains reachable.
- **SC-005**: Ranking and winners pages show identical data as before this
  feature for the same votes.

## Assumptions

- "Instant" means imperceptible to a human in a casual voting session
  (<100 ms perceived transition); a brief wait is tolerated only when the
  prepared reserve is exhausted, which should be rare.
- Batches are small (a handful of pairs), tuned so a normal voting session
  never exhausts the reserve; exact batch size and threshold are
  implementation details.
- Offline vote persistence is in-memory only (queued while the tab is open);
  this is a toy project with exactly two users — robust offline storage is
  out of scope.
- The existing Upstash free-tier budget is respected: batching must not
  multiply command volume (one vote write stays one vote write; score reads
  may be amortized per batch but MUST NOT scale with pairs shown).
- Vote ordering: if multiple queued votes are retried, they may be recorded
  in any order — the score totals are what matter, not sequence.
- Feature 002's weighting curve (linear, score + 1) and feature 001's
  ranking/winners behaviour are unchanged.
