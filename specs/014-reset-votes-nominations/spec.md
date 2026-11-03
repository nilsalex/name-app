# Feature Specification: Reset Votes and Nominations

**Feature Branch**: `014-reset-votes-nominations`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "users should be able to reset votes and nominations (reset = deleting the entry entirely, not on a granular level)"

## Clarifications

### Session 2026-11-03

- Q: When a user resets votes (or nominations), should that delete only that signed-in user's own votes and nominations, or everyone's entries across both users? → A: Per-user — reset deletes only the signed-in user's own votes and own nomination decisions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reset my votes (Priority: P1)

A user wants to start the name-voting process over — for example, after a test
run or when the current tally no longer reflects the group's intent. The user
triggers a reset of the votes, and **all of that user's own votes** are removed
entirely; other users' votes are untouched. The app then shows a clean state
with none of the user's votes recorded, while the user's nomination decisions
and the other user's data remain untouched.

**Why this priority**: Voting is the core activity of the app; being able to
wipe the tally wholesale is the most frequently needed reset and unblocks
re-running the vote without manual per-vote cleanup.

**Independent Test**: Can be fully tested by casting one or more votes,
triggering the vote reset, and verifying that the tally displays zero votes
while nominations are still present.

**Acceptance Scenarios**:

1. **Given** the signed-in user has one or more recorded votes, **When** the user resets votes, **Then** all of that user's own votes are deleted entirely and the user's tally shows no votes.
2. **Given** another user has recorded votes, **When** the signed-in user resets votes, **Then** the other user's votes remain unchanged.
3. **Given** the signed-in user has votes recorded and nomination decisions present, **When** the user resets votes, **Then** that user's nomination decisions remain unchanged.
4. **Given** the signed-in user has no recorded votes, **When** the user resets votes, **Then** the app shows the same clean state without errors.

---

### User Story 2 - Reset my nominations (Priority: P2)

A user wants to redo their nomination round — for example, because they
changed their mind about which names to include in their voting pool. The user
triggers a reset of the nominations, and **all of that user's own nomination
decisions** are removed entirely. The user returns to the start of a fresh
nomination round over the full name list; the other user's nomination
decisions and voting are untouched.

**Why this priority**: Clearing one's nominations is the only way to redo the
forced include/exclude round, which is otherwise final; it is naturally paired
with, but secondary to, the vote reset.

**Independent Test**: Can be fully tested by completing a nomination round,
triggering the nomination reset, and verifying the user starts a fresh round
over all names while the other user's round and votes are unchanged.

**Acceptance Scenarios**:

1. **Given** the signed-in user has one or more nomination decisions, **When** the user resets nominations, **Then** all of that user's own nomination decisions are deleted entirely and the user starts a fresh nomination round over the full name list.
2. **Given** another user has nomination decisions, **When** the signed-in user resets nominations, **Then** the other user's decisions, voting pool, and votes remain unchanged.
3. **Given** the signed-in user has no nomination decisions, **When** the user resets nominations, **Then** the app shows the same fresh nomination round without errors.

---

### User Story 3 - Reset my everything at once (Priority: P3)

A user wants a completely fresh start: **that user's own** vote tally and
nominations are wiped in a single action, without having to perform two
separate resets. Other users' entries are untouched.

**Why this priority**: A convenience action; the same outcome can be achieved
with the two individual resets, so it carries the lowest priority.

**Independent Test**: Can be fully tested by populating votes and
nominations, triggering a full reset, and verifying that neither votes nor
nominations remain.

**Acceptance Scenarios**:

1. **Given** the signed-in user has both own votes and own nominations, **When** the user resets everything, **Then** both are deleted entirely for that user and the app shows the user's initial empty state, while other users' entries remain unchanged.

---

### Edge Cases

- What happens when one user resets while the other user is actively voting? The reset deletes only the resetting user's own entries; the other user's in-flight or newly submitted votes and nomination decisions are unaffected.
- What happens when the reset action is triggered repeatedly or triggered when there is nothing to reset? The system must remain in a valid, empty state with no errors.
- What happens when only one of the two data types exists for a user (their votes but no nomination decisions, or vice versa)? Resetting the absent type must succeed without error and leave the other type untouched.
- Accidental reset: since reset deletes a user's own entries entirely (not granular undo), the interface must make the destructive nature clear so a user does not lose their votes/nominations unintentionally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a way for signed-in users to reset (completely delete) all of their own recorded votes; the reset MUST NOT affect other users' votes.
- **FR-002**: System MUST provide a way for signed-in users to reset (completely delete) all of their own nomination decisions; the reset MUST NOT affect other users' nomination decisions or votes.
- **FR-003**: Resetting votes MUST delete every one of the signed-in user's vote entries entirely; it MUST NOT leave partial or per-vote residue for that user.
- **FR-004**: Resetting nominations MUST delete every one of the signed-in user's nomination decisions entirely; it MUST NOT leave partial or per-decision residue for that user.
- **FR-005**: Resetting a user's votes MUST NOT delete or alter that user's nomination decisions or any other user's data.
- **FR-006**: System MUST provide a single action for a user to reset both their own votes and their own nomination decisions together.
- **FR-007**: System MUST confirm a reset action before deleting (destructive action), or otherwise clearly signal its irreversibility before it happens.
- **FR-008**: After a reset, System MUST reflect the post-reset state immediately to all users on their next view of the app.
- **FR-009**: System MUST support reset actions when there is nothing to reset, without errors.

### Key Entities *(include if feature involves data)*

- **Vote**: A signed-in user's recorded preference for a nominated name, owned by that user. A user's whole collection of votes is deleted at once by that user's vote reset; no individual vote of theirs survives it.
- **Nomination Decision**: A signed-in user's include/exclude choice for one name from the name list (as defined by feature 013). A user's whole collection of nomination decisions is deleted at once by that user's nomination reset; afterwards that user starts a fresh nomination round. The reset never affects the shared name list or the other user's decisions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can reset all of their own votes in under 5 seconds, with their tally immediately showing zero of their votes.
- **SC-002**: A user can reset all of their own nomination decisions in under 5 seconds, immediately returning to a fresh nomination round.
- **SC-003**: After any reset, 100% of the user's deleted entry type is gone (no leftover own votes or own nomination decisions) and the app displays a valid state for every user with no errors.
- **SC-004**: A full reset (votes + nominations) can be completed in a single action, without performing two separate resets.
- **SC-005**: Users report confidence that reset behavior is predictable and clearly destructive (no accidental data loss without an explicit confirmation).

## Assumptions

- "Reset" means deleting the entries entirely in one action — there is no granular selection (e.g., deleting a single vote or a single nomination is out of scope for this feature).
- Reset is scoped per user: a user can only reset their own votes and nominations; there is no separate admin role and no global reset in this two-user toy app.
- Deleted votes and nominations are permanently removed; no undo/history is provided.
- Resetting a user's nominations deletes their nomination decisions and returns them to a fresh nomination round; the shared name list and the other user's data are never touched.
- The reset controls live within the existing app interface and reuse the existing persistence mechanisms; no new infrastructure is introduced (consistent with the free-plan budget).
