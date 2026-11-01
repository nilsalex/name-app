# Quickstart: Baby Name Voting — End-to-End Validation

Prerequisites and setup, then the scenarios that prove the feature works.
Implementation details live in `tasks.md`; data rules in `data-model.md`;
interfaces in `contracts/contracts.md`.

## Prerequisites

- Node.js (version matching the repo tooling) and npm
- A free Upstash Redis database (REST API credentials: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- The Cologne 200 boy names list available to paste into `lib/names.ts` (static data, see research.md R1)

## Setup

```bash
npm install
# place Upstash credentials in .env.local (see prerequisites)
npm run dev        # start locally
npm test           # unit + integration tests (node:test via tsx)
npm run build      # must pass with zero type errors (Constitution: workflow gate)
```

## Validation Scenarios

### S1: First vote (US1, SC-001, SC-002)

1. Open `http://localhost:3000` on a phone-width viewport.
2. **Expect**: pick-your-user prompt (User A / User B) — no accounts.
3. Pick a user, then tap one of the two displayed names.
4. **Expect**: a new pair of names appears immediately; total time from
   open to first vote under 10 seconds; vote → next pair under 2 seconds.

### S2: Vote persistence (US1, FR-005, SC-003)

1. Note the winning name in S1, then open `/ranking`.
2. **Expect**: that name has score ≥ 1; all 200 names are listed; tied
   scores share a rank number (1-2-2-4 pattern).

### S3: Ranking ties and empty state (US2, FR-014)

1. With zero votes (fresh database), open `/ranking`.
2. **Expect**: all names visible, score 0, shared bottom rank — no error.
3. Cast exactly one vote; reopen `/ranking`.
4. **Expect**: winner at rank 1; the other 199 names share rank 2.

### S4: Winners view (US3, FR-009)

1. After S3, open `/winners`.
2. **Expect**: the single winner highlighted.
3. Cast a vote making another name reach the same top score; reopen.
4. **Expect**: both names shown as winners (ties displayed).

### S5: Concurrent voting (edge case, SC-004)

1. Open the vote screen in two browser profiles as User A and User B.
2. Submit votes in both at the same moment.
3. **Expect**: both votes recorded — `/ranking` score totals increase by 2;
   the `votes` audit stream in Upstash contains both entries.

### S6: Failed submission (edge case, FR-012)

1. Temporarily invalidate the Upstash token in `.env.local`; restart dev.
2. Cast a vote.
3. **Expect**: an error message is shown, no next pair loads as "success",
   the vote is not in Upstash; restore the token and retry — vote counts.

### S7: Pair validity (US1, FR-002, acceptance scenario 3)

1. Vote rapidly through 20 pairs.
2. **Expect**: never two identical names in one pair; never the exact same
   pair twice in a row.

## Exit Criteria

All scenarios pass and `npm run build` + `npm test` are clean. The app then
meets the spec's success criteria SC-001 through SC-006 (SC-006 confirmed by
both users after real use).
