# Feature Specification: Weighted Pair Selection

**Feature Branch**: `002-weighted-pairing`

**Created**: 2026-11-01

**Status**: Clarified

**Input**: User description: "currently favoured names should appear more often in the pairs, such that it helps to really drill down the most liked name"

## Clarifications

### Session 2026-11-01

- Q: How strongly should a name's score boost how often it appears in pairs (weighting curve)? → A: Linear weighting with +1 base: weight = score + 1, so a name with score 10 appears ~11× as often as one with score 0; uniform when all scores are 0.
- Q: How should the two members of a pair be drawn? → A: Both names drawn independently from the same weighted pool, then retried on collision/repeat — no bracket or score-matching split.
- Q: Should weight be based on raw wins only or on win rate (wins vs. appearances)? → A: Raw win counts only (weight = score + 1); appearance history is not tracked or factored in.
- Q: How large must the statistical tolerance be for uniform selection in the equal-scores test? → A: ±10% of the mean appearance frequency over 10,000 draws.
- Q: Should there be a guaranteed variety floor when scores are heavily skewed, or is pure weighting acceptable? → A: Pure weighting with no variety floor — favourites may dominate the screen when far ahead; nonzero base (score + 1) already keeps every name reachable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vote on meaningful matchups (Priority: P1)

As a user voting on name pairs, I want the names that are doing well (many
wins so far) to show up more often in the pairs I'm shown, so that my votes
increasingly compare the strongest contenders against each other instead of
spending time on names that have already been repeatedly rejected.

Today every pair is equally likely, so a name the users clearly dislike
reappears just as often as a favourite. With weighted selection, the app
progressively concentrates the voting on the top of the field and helps the
users drill down to the single most liked name.

**Why this priority**: This IS the feature. Without it, pair selection stays
uniform and voting time is wasted on clearly unpopular names.

**Independent Test**: Can be tested by seeding scores (some names with many
wins, some with none) and verifying over many drawn pairs that high-score
names appear more often than low-score names, while every name can still
appear.

**Acceptance Scenarios**:

1. **Given** the score table is empty (no votes yet), **When** pairs are
   drawn, **Then** selection is effectively uniform — every name is equally
   likely to appear (identical behaviour to today).
2. **Given** name A has many more wins than name B, **When** many pairs are
   drawn, **Then** A appears in pairs noticeably more often than B.
3. **Given** any score state, **When** a pair is drawn, **Then** both
   members are distinct names from the name list (unchanged from the
   existing validity rule).
4. **Given** any score state, **When** a pair is drawn immediately after
   another, **Then** the exact previous pair (either order) is never shown
   again (unchanged from the existing rule).

---

### User Story 2 - Favourites always remain reachable (Priority: P2)

As a user, I want even low-scored names to keep a nonzero chance of
appearing, so that the weighting never permanently hides a name — a name
that started poorly can still recover if the users keep picking it, and the
final "most liked name" outcome stays trustworthy.

**Why this priority**: Protects the fairness/integrity of the drill-down;
without it, an early run of losses could freeze a name out of the contest
entirely.

**Independent Test**: Can be tested by giving one name a very large score
and all others zero, then verifying that zero-score names still appear in
drawn pairs over a reasonable number of draws.

**Acceptance Scenarios**:

1. **Given** one name has a very high score and the rest have zero,
   **When** many pairs are drawn, **Then** zero-score names still appear.
2. **Given** a name has lost many times in a row, **When** pairs continue
   to be drawn over a session, **Then** that name's appearance rate
   decreases gradually but never reaches zero.

---

### User Story 3 - New votes reshape selection immediately (Priority: P3)

As a user, I want the weighting to follow the current scores, so that after
each vote the very next pair already reflects the latest standings —
recently favoured names get more exposure right away, without any manual
refresh or restart.

**Why this priority**: Keeps the drill-down responsive; a stale weighting
would waste votes on names the users have just decided against.

**Independent Test**: Can be tested by drawing a pair, changing one name's
score, drawing many pairs again, and verifying the changed name's appearance
frequency moves in the direction of its new score.

**Acceptance Scenarios**:

1. **Given** a name receives a new win, **When** the next pairs are drawn,
   **Then** that name appears more often than it did before the win (all
   else equal).
2. **Given** scores change between two draw sequences, **When** pairs are
   drawn, **Then** selection always reflects the scores as of the draw, not
   some earlier state.

### Edge Cases

- What happens when fewer than two names exist in the list? Pair drawing is
  impossible; the app keeps whatever guard exists today (name list is fixed
  at 200, so this cannot occur in practice).
- What happens when all names have identical scores (fresh start, or perfect
  tie)? Weighting must degenerate to uniform selection — no name is
  advantaged or disadvantaged.
- What happens with extreme score differences (one name has hundreds of
  wins, another zero)? The low-score name must still have a nonzero chance
  of appearing (see User Story 2).
- What happens when a draw cannot satisfy the "distinct members, not the
  previous pair" constraints on the first attempts? The draw retries; with
  a 200-name list this always succeeds quickly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Pair selection MUST weight each name's chance of appearing by
  its current score, such that names with higher scores appear more often.
- **FR-002**: Weighting MUST be score-proportional with a linear curve: each
  name's selection weight equals its current score plus 1 (weight = score +
  1), so relative appearance frequency between two names is exactly the
  ratio of their weights.
- **FR-008**: Both members of a pair MUST be drawn independently from the
  same single weighted pool of all names — no bracketing, seeding, or
  score-based opponent matching.
- **FR-003**: Every name in the name list MUST always retain a nonzero
  chance of appearing in a pair, regardless of score.
- **FR-004**: With an empty score table (no votes recorded), or when all
  scores are equal, selection MUST be uniform (no bias).
- **FR-005**: Pair validity rules are unchanged: both members MUST be
  distinct, and the immediately previous pair MUST NOT be repeated (in
  either order).
- **FR-006**: The weighting MUST be based on the score state at draw time;
  no historical weighting state may be accumulated or maintained. Weights
  use raw win counts only — appearance counts, win rates, and recency are
  NOT tracked or factored in.
- **FR-007**: Selection randomness MUST remain non-deterministic: the same
  score state must still produce varied pairs across draws (no fixed
  rotation).
- **FR-009**: There MUST be no variety floor or anti-repetition mechanism
  beyond FR-005: when scores are heavily skewed, high-score names may
  dominate the shown pairs, provided every name remains reachable per
  FR-003.

### Key Entities *(include if feature involves data)*

- **Score**: the existing win count per name (produced by voting). Used
  read-only as the weight input for selection. No new stored state is
  introduced by this feature.
- **Pair**: two distinct names from the name list, ordered as displayed;
  validity rules unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When one name's score is at least twice another's, its
  appearance frequency across a large sample of drawn pairs is measurably
  higher (statistically verifiable, e.g., over 10,000 draws); with the
  linear weight = score + 1 curve, expected frequencies follow the weight
  ratio exactly.
- **SC-002**: With an empty score table, appearance frequencies across
  10,000 drawn pairs do not deviate from uniform by more than ±10% of the
  mean frequency.
- **SC-003**: No name's appearance probability ever drops to zero, verified
  by every name appearing at least once in a large sample of draws from an
  extreme (heavily skewed) score state.
- **SC-004**: A user voting through a session perceives that the pairs
  increasingly feature the names they have been favouring (qualitative,
  confirmed by both users during real use).
- **SC-005**: Existing behaviour is preserved: no identical-name pairs, no
  immediate exact pair repeats, and vote recording/ranking are unaffected.

## Assumptions

- The existing fixed name list (200 names) and the existing vote/ranking
  mechanism stay unchanged; this feature only alters how pairs are chosen.
- Weights derive solely from the current scores; the feature adds no new
  persistence (no per-user history, no decay timers).
- "More often" means a statistically observable increase in frequency, not
  a guarantee for any single pair.
- Per-user weighting (each of the two users seeing their own personalised
  weighting) is out of scope; both users share the same score-based
  weighting.
- A drawn pair may include the previous pair's winner or loser individually;
  only the exact previous combination is excluded (existing rule).
- No variety floor or anti-repetition mechanism beyond the previous-pair
  rule: when scores are heavily skewed, the leading name(s) may legitimately
  dominate the shown pairs; only the score + 1 base guarantees reachability
  (FR-003).
