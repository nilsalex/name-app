# Quickstart: Weighted Pair Selection — End-to-End Validation

Feature: 002-weighted-pairing

Prerequisites and setup are identical to feature 001 (`specs/001-baby-name-voting/quickstart.md`): Node + npm, Upstash REST credentials in `.env.local`.

## Setup

```bash
npm install
npm run dev        # start locally
npm test           # unit tests (pairing weighting tests run here)
npm run build      # must pass with zero type errors (constitution gate)
```

## Validation Scenarios

### W1: Uniform start (SC-002, FR-004)

1. Use a fresh database (or one with zero votes) and open `/`.
2. **Expect**: pairs look unremarkable — no name is favoured; behaviour is
   indistinguishable from feature 001 (weight = score + 1 = 1 for all).
3. Automated check: `npm test` includes the uniform-distribution test over
   10,000 draws (±10% of mean).

### W2: Favourites appear more often (SC-001, FR-001/FR-002)

1. Cast a handful of votes favoring one name (e.g., vote "Noah" as winner
   several times).
2. Reload `/` so the score map refreshes.
3. **Expect**: the favoured name now shows up noticeably more often in
   subsequent pairs than zero-score names. With weight = score + 1, a name
   with 5 wins appears ~6× as often as a name with 0 wins.
4. Automated check: unit test asserting observed frequencies track the
   weight ratio (±10%) over 10,000 draws.

### W3: No name disappears (SC-003, FR-003)

1. With one heavily-favoured name (many wins) keep voting through pairs.
2. **Expect**: zero-score names still turn up from time to time (expected
   share is small but nonzero: weight 1 vs the leader's weight).
3. Automated check: unit test with one name at a very high score — every
   name appears at least once in 10,000 draws.

### W4: Weighting follows fresh votes (US3, FR-006)

1. Vote for a previously ignored name; observe the next pairs without a
   manual reload beyond the normal post-vote pair change.
2. **Expect**: the just-voted name appears more often than before the vote
   (the client refetches scores after each successful vote and passes them
   to the next draw).

### W5: Pair validity preserved (SC-005, FR-005)

1. Vote rapidly through 20 pairs with skewed scores (vote the same leader
   repeatedly first).
2. **Expect**: never two identical names in a pair; never the exact same
   pair twice in a row (either order).
3. Automated check: unit tests covering distinctness and no-immediate-
   repeat under both empty and skewed score maps.

### W6: Ranking and winners unaffected (SC-005)

1. Open `/ranking` and `/winners` after several votes.
2. **Expect**: scores, shared ranks (1-2-2-4), and winner display behave
   exactly as in feature 001 — this feature changes selection only, never
   scoring.

## Exit Criteria

All scenarios pass and `npm run build` + `npm test` are clean. The
perceived drill-down ("strong names dominate the screen over time") is
confirmed qualitatively by both users during real use (SC-004).
