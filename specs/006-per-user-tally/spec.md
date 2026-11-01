# Feature Specification: Per-User Tallies and Drafting Frequency

**Feature Branch**: `006-per-user-tally`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "votes should be counted per-user, for the ranking, and also for the drafting frequency"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My votes count for the ranking I see (Priority: P1)

A signed-in user opens the ranking view. Instead of one global tally blending
everybody's votes, the ranking is computed **from the signed-in user's own
votes**: a name the user has picked often ranks high for *them*, regardless
of what other users picked. A user with few votes sees their own (short but
honest) ranking; a user who never sees a name has it at the neutral bottom.

**Why this priority**: This is the core of the request — the ranking stops
being a mixture of strangers' preferences and becomes *each user's own
standing on the name list*. Everything else in this feature supports it.

**Independent Test**: Sign in as user X, vote one name up several times and
another down; sign in as user Y on a different account and verify Y's ranking
reflects only Y's votes (X's votes do not alter Y's order).

**Acceptance Scenarios**:

1. **Given** user X has voted "Felix" over "Paul" three times, **When** X
   opens the ranking, **Then** "Felix" is placed above "Paul" **for X**.
2. **Given** user Y has cast no votes for "Felix", **When** Y opens the
   ranking, **Then** Y's placement of "Felix" is unaffected by X's votes.
3. **Given** a user with zero votes, **When** they open the ranking,
   **Then** all names share the neutral bottom rank (a valid, honest state).
4. **Given** two users vote simultaneously, **When** each opens their
   ranking afterwards, **Then** each sees their own tally updated and no
   cross-user interference.

### User Story 2 - Pair drafting respects each user's own frequency (Priority: P2)

The pair generator presents name pairs using **the signed-in user's own
appearance frequency**: names the user has seen (and especially voted for)
less often in *their* history show up more often, so every user gradually
gets a balanced sweep of the 200-name list from their own perspective. One
user's voting history never influences which pairs the *other* user sees.

**Why this priority**: With per-user rankings, drawing pairs from the global
tally would feel wrong (the app could keep offering a name the user has
already ranked decisively while neglecting names the user never saw). The
drafting frequency must follow the same per-user boundary as the ranking.

**Independent Test**: As user X, vote heavily for "Felix"; verify X's pair
stream does not systematically over-offer "Felix" relative to X's own
seen-frequency, and that user Y's pair stream is untouched by X's votes.

**Acceptance Scenarios**:

1. **Given** user X has seen "Felix" far more often than "Emil",
   **When** pairs are drafted for X over a session, **Then** "Emil" appears
   more often per-capita than "Felix" (under-seen names catch up).
2. **Given** user X votes for "Felix" many times, **When** user Y's pair
   stream continues, **Then** Y's frequency distribution is unchanged by
   X's activity.
3. **Given** a brand-new user, **When** their first pairs are drafted,
   **Then** selection starts from a uniform distribution (no history yet).

### User Story 3 - Both views degrade gracefully for legacy and new users (Priority: P3)

Pre-004 vote records (attributed to the manual aliases "A"/"B") and the
first days of 005 (attributed to opaque internal IDs) coexist in storage.
Each user's ranking and drafting frequency is computed only from records
attributable to them: legacy alias-attribute votes are treated as **global
history** — they count toward historical bookkeeping — but must not be
misattributed to a current user's personal tally. New users start clean.

**Why this priority**: Data-hygiene guarantee; invisible when everything
works, protects correctness across the identifier migrations.

**Independent Test**: Inspect a freshly migrated deployment containing
legacy A/B records: no user's per-user ranking includes votes they did not
personally cast; legacy records remain indexable for historical audit.

**Acceptance Scenarios**:

1. **Given** storage contains votes attributed to legacy "A"/"B",
   **When** any current user opens their ranking, **Then** those votes do
   not appear in their personal tally.
2. **Given** a user signs in for the first time (no records yet),
   **When** they open the ranking, **Then** they see the neutral bottom
   rank everywhere, and drafting starts uniform.
3. **Given** the same person signs in with a different Google account
   (different identity), **Then** their new account starts with an empty
   personal tally (no automatic merging).

### Edge Cases

- What happens when a user votes and immediately opens the ranking? → The
  fresh vote is reflected without a stale-window (their own tally is the
  source of truth for their view).
- What happens when a user has voted every pairing possible from their own
  history? → Pairings may repeat freely (per feature 001 clarified decision);
  per-user frequency still balances toward under-seen names.
- What happens when the total vote count of a user is very small (1–5)?
  → Their ranking is short but honest; bottom ranks are shared by all
  unvoted names.
- What happens when two users share one household and both vote on the same
  physical device back-to-back (different accounts)? → Each session carries
  its own identity; tallies never blend across sequential sign-ins.
- What happens when the voting screen sees a session expiry mid-drafting? →
  The next action leads back to re-login (unchanged from 004/005); no vote
  is cast into another user's tally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The ranking view MUST compute each name's score exclusively
  from the votes cast under the signed-in user's identity.
- **FR-002**: The ranking view MUST attribute zero votes (neutral bottom
  rank) to names the user has never voted on, and MUST NOT import other
  users' votes into a user's ranking.
- **FR-003**: The winners view (top names, shared rank for ties) MUST be
  derived from the same per-user tally as the ranking view.
- **FR-004**: The pair drafting MUST use the signed-in user's own
  appearance frequency (how often the user has seen each name in *their*
  pair history) as its balancing signal, instead of the global tally.
- **FR-005**: Pair drafting MUST progressively balance each user's exposure:
  names seen (or marked) less often by that user appear with higher
  relative frequency than names the user has seen often.
- **FR-006**: Pair drafting MUST remain pair-based (two distinct names,
  never an identical repeat of the immediately previous pair) and MUST
  preserve feature 003's instant-swap presentation contract.
- **FR-007**: Votes cast under a signed-in session MUST be recorded with
  that user's identity, and the identity recorded MUST be the only
  attribution path into per-user tallies and drafting frequency.
- **FR-008**: Votes recorded before 004 (legacy "A"/"B"), as well as votes
  whose identity does not belong to the viewing user, MUST NOT be merged
  into a user's personal tally. They remain retrievable for historical
  purposes but are invisible to per-user views.
- **FR-009**: A user MUST be able to see whose votes shape their ranking —
  i.e., the UI must make it evident that the ranking is personal (e.g., the
  label "Deine Rangliste") rather than an app-wide consensus.
- **FR-010**: The per-user tally MUST update in-place as the user votes;
  no action beyond casting votes is required to refresh it.

### Key Entities *(include if feature involves data)*

- **Per-user vote record**: one entry per cast vote, carrying the voting
  user's identity, the winner, the loser, and the timestamp (existing vote
  record shape; identity semantics from 005). This is the single source for
  both per-user tallies and per-user seen-frequency.
- **Per-user tally**: per user, a map of name → win count derived from
  that user's own vote records; empty/tied names share the neutral bottom
  rank.
- **Per-user seen-frequency**: per user, a count of how often each name has
  appeared in any pair drafted to that user; drives progressive balancing
  of future pairs. Distinct from the win tally (a name the user keeps
  voting *down* remains high in seen-frequency but low in the tally).
- **Legacy alias votes**: pre-004 records attributed to "A"/"B"; treated as
  historical, never attached to a current user's identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For two different users with disjoint voting histories,
  their rankings differ accordingly — each user's rank order matches their
  own vote history in 100% of spot checks.
- **SC-002**: A name voted up n times by user X occupies (within the tie
  rule) the position that n wins determines for X, regardless of how many
  votes other users cast for or against that name.
- **SC-003**: Across a drafting session of at least 200 pairs, each user's
  seen-frequency distribution converges toward uniform: no name exceeds the
  mean per-name exposure by more than the statistical tolerance previously
  agreed for uniform selection (±10% of the mean over a large sample,
  feature 002 reference).
- **SC-004**: votes cast by one user change that user's views within one
  page interaction (open ranking after voting → own result is current).
- **SC-005**: 100% of legacy alias records remain excluded from every
  user's personal tally after deployment.

## Assumptions

- "Drafting frequency" refers to how often each name is *offered* in pair
  drafting, not a separate "draft day" workflow ("drafting" = the act of
  serving pairs for the user to pick from).
- The per-user ranking replaces the global ranking as the primary view;
  the previous global ("all users blended") ranking is out of scope for
  this feature and may become a separate opt-in view later.
- Existing identity infrastructure (Gmail sign-in, internal user IDs from
  005) is reused unchanged; this feature adds *views and computations* over
  per-user data, not a new identity system.
- The win count semantics (one vote = one win for the picked name, no
  points for the loser) carry over unchanged, per user.
- Legacy "A"/"B" records cannot be attributed to a current identity
  without manual mapping (005 already decided no merging); this spec keeps
  that stance — they count only for historical audit, not for personal
  views.
- Freshly drafted pairs remain visible-only client-side; per-user
  seen-frequency is maintained from drafted pairs so it survives page
  reloads.
