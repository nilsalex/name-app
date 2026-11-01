# Quickstart: Per-User Tallies and Drafting Frequency (006)

Date: 2026-11-02. Validation scenarios for the deployed feature. All live
steps run in the user's environment (Vercel + real Google/Upstash creds);
automated gates (`npm test`, `tsc`, `next build`) run locally.

**Prerequisites**: `APPROVED_EMAILS` with ≥2 addresses, both users have
signed in at least once before testing (005 flow), Vercel deployment of
this branch.

## V1 — Rankings are personal (spec US1, SC-001/002)

1. User X signs in, votes "Felix" over "Paul" 3×.
2. X opens `/ranking` → heading "Deine Rangliste"; Felix sits above Paul
   with score 3 vs 0/absent.
3. User Y signs in (different account), opens `/ranking` → Y's ordering is
   NOT influenced by X's votes: Paul's position for Y is unaffected by
   X's Felix-votes.
4. **Pass**: each user's rank order matches their own vote history;
   nothing in Y's view moved because of X's activity.

## V2 — Fresh vote reflected immediately (spec US1, SC-004)

1. X votes a pair, then taps the ranking link immediately.
2. **Pass**: the vote just cast is included in X's displayed tally (no
   stale window, no manual refresh).

## V3 — Zero-vote and logged-out states (spec US1 AC3, US3 AC2, R6)

1. New approved user Z signs in first time, opens `/ranking`.
2. **Pass**: all 200 names share the neutral bottom rank; heading still
   "Deine Rangliste".
3. Z signs out, opens `/ranking` again.
4. **Pass**: login prompt ("Melde dich an …"), NOT an empty-looking
   200-name list.
5. `/winners` while signed out → same prompt pattern; `/winners` with
   zero personal votes → "Noch keine Stimmen — alle Namen führen!".

## V4 — Drafting balances per-user exposure (spec US2, SC-003)

1. X (fresh or existing) votes through ≥ 200 pairs in one session.
2. Optionally export/inspect `namewahl:user:<uid>:seen` (Upstash console).
3. **Pass**: over the session, X's pair stream visibly favors names X has
   seen less (a name seen 10× is offered much less often than one seen
   0×); no name exceeds the ±10% mean-exposure tolerance asymptotically
   (statistically verified in unit tests; live check is a spot check).
4. Y drafts pairs meanwhile → Y's stream is unaffected by X's votes
   (spot check: Y does not suddenly see X's winners more often).

## V5 — Legacy data exclusion (spec US3, FR-008, SC-005)

1. Deployment has pre-004 votes (attributed "A"/"B") in `namewahl:votes`
   (this is true for the production deployment).
2. X opens `/ranking` after casting ≥1 personal vote.
3. **Pass**: X's ranking reflects only X's votes — legacy-era tallies are
   not blended into any personal view. (Global zset `namewahl:scores`
   still contains the historical aggregate — untouched, unread.)

## V6 — Identity hygiene (spec US3 AC3, edge cases)

1. X votes, signs out, signs in with the *other* approved account Y.
2. **Pass**: Y sees Y's own tally (empty if Y never voted) — no blending
   across sequential sign-ins on the same device.
3. Session expiry mid-voting: next action → re-login prompt; no vote is
   recorded under the wrong identity (unchanged 004/005 behavior).

## Automated gates (local, no creds)

```
npm test          # all red→green pairs pass (pairing statistics, key
                  # derivation, action scoping, pipeline composition)
npx tsc --noEmit  # clean
npm run build     # PPR build OK, ranking/winners still stream in Suspense
```
