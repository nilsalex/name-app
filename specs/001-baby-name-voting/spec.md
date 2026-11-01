# Feature Specification: Baby Name Voting

**Feature Branch**: `[001-baby-name-voting]`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Basic idea of the app: have two users vote for german baby names chosen from the cologne 200 boy names list. Rank the names and show the winners. Users will vote over a couple of months with a nice system like presenting two options and having the user pick the favourite between these, and repeating."

## Clarifications

### Session 2026-11-01

- Q: Should each name pairing be offered to a user only once (no repeats until
  all pairings are exhausted), or may pairings repeat freely? → A: B —
  pairings may repeat freely; the app does not track which pairings a user
  has already seen.
- Q: When two names are tied on wins in the ranking, how should the tie be
  broken for display? → A: A — tied names share the same rank position,
  listed in any stable order; no deterministic tie-break rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vote on Name Pairs (Priority: P1)

A user opens the app, is shown two German boy names from the Cologne 200 list
side by side, and taps the one they prefer. The app then immediately presents
the next pair, and the user can keep voting for as long as they like. Every
vote is recorded so it can be counted later.

**Why this priority**: This is the core activity of the app. Without pair
voting there is nothing else — no data, no ranking, no winners.

**Independent Test**: Can be fully tested by opening the app, casting several
votes between pairs of names, and confirming each vote is saved and a fresh
pair appears each time.

**Acceptance Scenarios**:

1. **Given** a user opens the app, **When** the voting screen loads, **Then**
   two distinct names from the Cologne 200 boy names list are displayed.
2. **Given** two names are displayed, **When** the user selects one, **Then**
   the vote is recorded and a new pair of names is shown without extra steps.
3. **Given** the user has just voted, **When** the next pair appears, **Then**
   the pair is not identical to the pair just voted on.
4. **Given** a user votes repeatedly in one session, **When** each vote is
   cast, **Then** every vote is persisted — no votes are lost on refresh or
   session end.

### User Story 2 - View Name Rankings (Priority: P2)

A user opens the ranking view and sees all names from the list ordered by
their score, computed from the votes cast so far. The ranking updates as new
votes come in.

**Why this priority**: The ranking is the payoff of voting, but it depends on
votes existing first; it delivers value even with partial vote data.

**Independent Test**: Can be fully tested by casting a known set of votes and
verifying the ranking view orders names according to those votes.

**Acceptance Scenarios**:

1. **Given** at least one vote has been cast, **When** a user opens the
   ranking view, **Then** names are displayed ordered from highest to lowest
   score.
2. **Given** a name has never won a vote, **When** the ranking is shown,
   **Then** that name still appears in the ranking (at the bottom tier).
3. **Given** new votes have been cast since the ranking was last viewed,
   **When** the user reopens the ranking view, **Then** the ranking reflects
   the latest votes.
4. **Given** two or more names have the same score, **When** the ranking is
   shown, **Then** those names share the same rank position.

### User Story 3 - See the Winners (Priority: P3)

A user opens the winners view and sees the top-ranked names highlighted as
the current favourites — the names leading the ranking.

**Why this priority**: A presentation-layer delight on top of the ranking;
valuable but dependent on Story 2.

**Independent Test**: Can be fully tested by casting votes that produce a
clear leader and verifying the winners view highlights that name.

**Acceptance Scenarios**:

1. **Given** the ranking has at least one name, **When** a user opens the
   winners view, **Then** the top-ranked name(s) are shown prominently as
   the winners.
2. **Given** two names are tied at the top, **When** the winners view is
   shown, **Then** both names are displayed as winners.

### Edge Cases

- What happens when the user has seen (or voted on) every possible pairing?
  The app must keep presenting pairs — repeats are acceptable — rather than
  showing an empty state or stalling.
- What happens when a vote submission fails (e.g. connection drop)? The vote
  must not be counted, and the user must be told to try again; no silent
  data loss.
- What happens when both users vote at the same time? Both votes must be
  recorded; neither may overwrite the other.
- What happens when a name pair accidentally shows the same name twice? This
  must never occur; each pair consists of two distinct names.
- What happens when fewer than two votes exist yet? The ranking and winners
  views must render gracefully (e.g. show the unranked list or an
  explanatory empty state) instead of failing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present voting pairs drawn from the Cologne 200
  German boy names list.
- **FR-002**: System MUST always present two distinct names in a pair.
- **FR-003**: Users MUST be able to record a preference for one name in a
  pair with a single selection action.
- **FR-004**: System MUST immediately present a new pair after each vote.
- **FR-013**: System MUST NOT track which pairings a user has already voted
  on; pairings MAY repeat freely for the same user.
- **FR-014**: System MUST display names with equal scores at the same rank
  position (shared rank, any stable order); no tie-break rule applies.
- **FR-005**: System MUST persist every recorded vote.
- **FR-006**: System MUST record which user cast each vote.
- **FR-007**: System MUST compute a ranking of names from the recorded
  votes, ordered by score, where score is derived from how often a name won
  its pairings.
- **FR-008**: System MUST display the ranking to both users at any time.
- **FR-009**: System MUST display the current winner(s) — the highest-ranked
  name(s), including ties — to both users at any time.
- **FR-010**: System MUST distinguish the two users so votes are attributed
  per user.
- **FR-011**: System MUST continue presenting pairs indefinitely, repeating
  pairings if necessary, for as long as users wish to vote (the voting
  period spans a couple of months).
- **FR-012**: System MUST notify the user and NOT count the vote when a vote
  submission fails.

### Key Entities *(include if feature involves data)*

- **Name**: A German boy name from the Cologne 200 list; has the name text
  and a position in the fixed source list.
- **Vote**: A single preference cast by one user for one name over another
  in a pair; records the winner, the loser, who voted, and when.
- **User**: One of exactly two participants; identified so votes can be
  attributed per person.
- **Ranking**: The computed ordering of all names by score, derived from
  votes; exists as a view over the votes, not as separately maintained
  state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the app to casting their first vote
  in under 10 seconds.
- **SC-002**: Casting a vote and seeing the next pair takes under 2 seconds.
- **SC-003**: 100% of successfully submitted votes are reflected in the
  ranking the next time it is viewed.
- **SC-004**: Both users can vote at the same time without any vote being
  lost or duplicated.
- **SC-005**: The two users can each cast at least 20 votes per session on
  modest mobile hardware without frustration (measured by both users
  completing a 20-vote session).
- **SC-006**: After the voting period, both users agree the winners view
  clearly shows their current favourite name(s) (qualitative: both users
  confirm).

## Assumptions

- The "Cologne 200 boy names list" is a fixed, publicly available list of
  200 German boy names; it will be embedded in the app as static data
  (this satisfies the free-plan budget in the project constitution).
- "Two users" means exactly two known people; a lightweight identification
  mechanism (e.g. picking who you are on first visit) is sufficient — no
  accounts, passwords, or email flows are needed (simplicity is paramount).
- The ranking "score" can be a simple win count per name; a full statistical
  rating algorithm is NOT required unless the users find the simple ranking
  unsatisfying.
- Voting happens opportunistically over a couple of months; there is no
  deadline, schedule, or per-day quota in v1.
- Mobile phones are the primary devices; desktop support is a bonus, not a
  requirement.
- German and English UI labels: the app content (names) is German, but UI
  chrome language is not specified; assume minimal English UI is acceptable
  for the two users (both are the product owners).
- Deployment and hosting follow the constitution's Free-Plan Budget
  (Vercel Hobby + Upstash free tier); this spec intentionally does not name
  technologies.
