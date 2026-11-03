# Feature Specification: Name Nomination Round

**Feature Branch**: `[013-name-nomination-round]`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "In a first round, every name should be presented (one by one) and the user has to decide whether to include the name in voting or not. Only then the real voting starts."

## Clarifications

### Session 2026-11-03

- Q: Should the voting pool be the intersection of both users' inclusions, or
  independent per user? → A: Voting pools stay independent for now — each
  user votes only on the names they personally included; no intersection is
  computed.
- Q: Can a user change an include/exclude decision later, or are decisions
  final? → A: Decisions are final — no editing after the round is completed.
- Q: What should the progress indication during nomination show? → A: A
  concrete counter: current position and total (e.g., "137 of 200").
- Q: What does a user see when they finish their round but the other user has
  not finished theirs? → A: They go straight into their own voting; no waiting
  screen.
- Q: Where does a user with a completed nomination round land when re-opening
  the app? → A: Directly in their voting screen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nominate names one by one (Priority: P1)

A user starts a new voting session and is shown a single name from the Cologne
200 boy names list, one at a time. For each name, the user decides whether to
include it in the upcoming voting or exclude it. After the decision, the next
name is presented. The user continues until every name on the list has been
presented once.

**Why this priority**: The nomination round is a strict gate before any voting
can happen. Without it, the new flow does not exist at all — voting must not
start until nominations are complete.

**Independent Test**: Can be fully tested by starting a session, going through
the presented names making include/exclude choices, and confirming every choice
is remembered and each name is shown exactly once.

**Acceptance Scenarios**:

1. **Given** a user opens the app with no completed nomination round, **When**
   the nomination screen loads, **Then** exactly one name from the list is
   displayed (not a pair).
2. **Given** a name is displayed, **When** the user chooses to include it,
   **Then** the name is marked for inclusion in voting and the next
   not-yet-presented name appears.
3. **Given** a name is displayed, **When** the user chooses to exclude it,
   **Then** the name is marked for exclusion from voting and the next
   not-yet-presented name appears.
4. **Given** the user has made decisions for some names, **When** they return
   to the nomination round, **Then** the already-decided names are not
   presented again and the round resumes at the first undecided name.
5. **Given** every name on the list has been presented and decided, **When**
   the last decision is made, **Then** the nomination round is complete and
   the user moves directly into their own voting — regardless of the other
   user's nomination progress.

### User Story 2 - Voting starts only after nomination completes (Priority: P2)

Once a user's nomination round is finished, that user is taken into the real
voting (flow as it exists today: name pairs, rankings, etc.). Voting on pairs
is restricted to the names that user included during nomination; names they
excluded never appear in any of their pairs. Voting pools are independent per
user — one user's exclusions do not affect the other user's pairs.

**Why this priority**: This is the payoff of the nomination round — it
guarantees each user only votes on names they want to consider. It depends on
Story 1 being complete first.

**Independent Test**: Can be fully tested by completing one user's nomination
round with a known set of included names and confirming every subsequently
offered pair for that user consists only of names they included.

**Acceptance Scenarios**:

1. **Given** a user's nomination round is complete, **When** that user enters
   the voting screen, **Then** every presented pair consists exclusively of
   names that user included during nomination.
2. **Given** a user excluded at least one name, **When** that user votes
   repeatedly, **Then** none of their excluded names ever appears in a pair
   shown to them.
3. **Given** the nomination round is not complete, **When** the user attempts
   to reach the voting screen, **Then** the app directs them back to the
   unfinished nomination round instead of showing pairs.

### User Story 3 - Independent voting pools (Priority: P3)

Each of the two users completes their own nomination round and gets their own
voting pool: exactly the names they personally included. The pools are fully
independent — a name excluded by one user can still appear in the other
user's pairs, and one user's choices never gate the other's voting.

**Why this priority**: The app has exactly two users voting together, and
independent pools mean neither user can block the other from voting on names
they care about. It builds directly on Stories 1 and 2 but keeps the pools
decoupled, which is simpler than computing a joint pool.

**Independent Test**: Can be fully tested by having two users complete
separate nomination rounds with different include choices and confirming each
user's pairs draw only from their own inclusion set.

**Acceptance Scenarios**:

1. **Given** both users completed nomination rounds with different choices,
   **When** each user votes, **Then** each user's pairs draw exclusively from
   that user's own included names.
2. **Given** one user excluded a name that the other included, **When** both
   vote, **Then** the excluding user never sees that name while the including
   user can still vote on it.
3. **Given** a user who has not yet completed their nomination round, **When**
   they open the app, **Then** they are placed in their own nomination round
   and cannot vote on pairs yet — regardless of the other user's progress.

### Edge Cases

- What happens when a user excludes names such that fewer than two names
  remain in their own voting pool? The app must not start pair voting for that
  user with fewer than two included names; it must instead show a clear
  message that voting cannot start and which names (if any) remain eligible —
  while the other user's voting is unaffected.
- What happens when a user abandons the nomination round midway? Their
  progress must be preserved and the round must resume where they left off;
  partially completed nominations must not enable pair voting.
- What happens when the nomination round is in progress and the underlying
  name list is unchanged? Every name must be presented exactly once — no name
  may be skipped or shown twice.
- What happens on page refresh during nomination? All previous include/exclude
  decisions must persist and the current name must remain available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present each name from the name list to each
  user individually, one at a time, before any pair voting is possible for
  that user.
- **FR-002**: For each presented name, the user MUST be able to choose exactly
  one of two options: include the name in voting, or exclude it.
- **FR-003**: The system MUST record each include/exclude decision
  persistently so that decisions survive page reloads and session ends.
- **FR-004**: The system MUST present each name to a user exactly once per
  nomination round; already-decided names MUST NOT be offered again.
- **FR-011**: Once a user's nomination round is complete, their decisions MUST
  be final: the system MUST NOT offer any way to change an include/exclude
  decision afterwards.
- **FR-005**: The system MUST let a user resume an interrupted nomination
  round at the first name without a decision.
- **FR-013**: A user with a completed nomination round MUST land directly in
  their voting screen when they re-open the app, with no nomination content
  shown again (decisions being final per FR-011).
- **FR-006**: The system MUST block pair voting for a user until that user has
  made a decision on every name in the list.
- **FR-007**: The system MUST restrict each user's pair voting to the names
  that user included in their own nomination round; voting pools are
  independent per user and no intersection between users is computed.
- **FR-008**: The system MUST prevent pair voting from starting for a user
  when fewer than two names remain in that user's voting pool after
  nomination, and MUST communicate this clearly to that user.
- **FR-009**: When a user's nomination round completes, the system MUST
  transition that user directly into their own voting experience without
  requiring any additional setup steps and without waiting for the other
  user's nomination progress.
- **FR-010**: The system MUST clearly indicate to the user how many names
  remain in their nomination round (progress indication).
- **FR-012**: The nomination progress indication MUST show a concrete counter
  of the user's current position and the total number of names (e.g., "137 of
  200").

### Key Entities *(include if feature involves data)*

- **Nomination Decision**: A single user's choice for a single name — which
  name, which user, and whether it is included or excluded. One decision per
  user per name; recorded persistently.
- **Nomination Round**: One user's complete pass over the full name list,
  consisting of their set of nomination decisions and its state (in progress
  or complete).
- **Voting Pool**: Per user, the set of names eligible for that user's pair
  voting — exactly the names they included in their own nomination round.
  Pools of the two users are independent of each other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a full nomination round over the 200-name
  list in a single sitting, with each decision taking under 5 seconds.
- **SC-002**: 100% of include/exclude decisions persist across page reloads —
  no decision is ever lost or asked twice.
- **SC-003**: Zero pair votes can be cast by a user before that user has
  completed their nomination round.
- **SC-004**: Zero names excluded by a user appear in any pair shown to that
  user after their nomination round is complete.
- **SC-005**: 90% of first-time users can complete the nomination round
  without assistance on their first attempt.

## Assumptions

- The nomination round uses the same underlying name source as the existing
  voting feature (Cologne 200 boy names list); the list content itself is not
  changed by this feature.
- Each user's nomination decisions are independent, and so are the resulting
  voting pools: each user votes only on names they personally included
  (clarified 2026-11-03 — pools stay independent, no intersection).
- The existing pair-voting, ranking, and weighting behavior remains unchanged;
  this feature only gates and filters which names enter that flow.
- A user's nomination decisions apply once (a single nomination campaign for
  the two users) and are final once the round is completed (clarified
  2026-11-03): an accidental exclusion permanently removes the name from that
  user's voting pool for this campaign.
- If fewer than two names survive a user's nomination, pair voting stays
  locked for that user with an explanatory message; no fallback list is
  offered, and the other user's voting is unaffected.
