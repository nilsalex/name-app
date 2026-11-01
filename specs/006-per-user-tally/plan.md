# Implementation Plan: Per-User Tallies and Drafting Frequency

**Branch**: `006-per-user-tally` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-per-user-tally/spec.md`

## Summary

Ranking, winners, and pair drafting become **per-user**: each user's views
are computed exclusively from votes recorded under their internal user ID
(005), and the pair generator balances each user's own *seen-frequency*
(how often the user has been offered each name) instead of the global win
tally. Concretely: two new per-user zsets in Upstash (`namewahl:user:<uid>:scores`
for personal win counts, `namewahl:user:<uid>:seen` for per-user name
exposure), maintained transactionally with the existing global stream/zset
in one pipeline; `getRanking`/`getWinners` switch to `getCurrentUid()`-scoped
reads; the pair generator gains an under-seen-first weighted mode built on a
pure `pickUnderseenPair()` function. Legacy "A"/"B" records are excluded from
per-user views by construction (they never match a user-ID key). The global
zset `namewahl:scores` is still written (historical integrity, possible
future global view) but is no longer read by any user-facing view. Vote
latency is unchanged: one pipeline of five commands (was two), plus one
HINCRBY pair for seen-frequency — still a single round trip.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (App Router, `cacheComponents: true`), React 19, Node 24 (dev/test)

**Primary Dependencies**: next, react, @upstash/redis (existing); `node:crypto` via existing modules; NO new npm dependencies.

**Storage**: Upstash Redis free tier. NEW keys per user:
`namewahl:user:<uid>:scores` (zset, member=name, score=personal wins) and
`namewahl:user:<uid>:seen` (zset, member=name, score=times offered).
Both are **written per vote/draft** and read only for the signed-in uid.
Existing `namewahl:votes` (stream) and `namewahl:scores` (global zset) keep
being written for audit/history, but `namewahl:scores` is no longer *read*
by ranking/winners/drafting. `getRanking()`/`getWinners()` become
uid-scoped server actions (session read inside `<Suspense>` — unchanged
mechanics). Legacy "A"/"B" data is untouched and never matches per-user keys
(FR-008 by construction).

**Testing**: `node:test` via `tsx` (`npm test`); red→green pairs per
constitution: unit tests for the new pure `pickUnderseenPair` (weighted
under-seen selection, no-repeat rule, uniform degeneration), unit tests for
the per-user scores/seen pipeline composition (mocked `@upstash/redis`
pipeline shape), updated session-scoped integration test for
`getRanking`/`getWinners` (zero writes for unauthenticated reads, uid-scoped
results), plus feature 002-style statistical verification of the ±10%
balancing tolerance in `pickUnderseenPair` tests.

**Target Platform**: Modern desktop/mobile browsers (Vercel Hobby deployment)

**Performance Goals**: Vote persistence unchanged in feel (< 5 s end-to-end,
SC-004); one pipeline round trip per vote (5 commands vs 2 — same single
round trip, Upstash free-tier budget: ~1.7× commands per vote but well
within 10k/day at this scale); ranking/winners read one zset each per view
(no change vs today's global read).

**Constraints**: Free-plan budget — per-user zsets add 2 writes per vote
and 1 write per drafted pair batch (seen-frequency HINCRBY is batched with
the pair generation, not per-pair); ranking pages read exactly one zset.
Global `namewahl:scores` writes stay (cheap, one ZINCRBY inside the same
pipeline) for future re-enablement of a global view.

**Scale/Scope**: Bounded by the approved-address list; touches `lib/store.ts`
(per-user accessors), `lib/pairing.ts` (new pure function), `lib/pair-queue.ts`
(seen-aware refill), `app/actions.ts` (uid-scoped reads + seen recording),
`app/ranking/page.tsx` + `app/winners/page.tsx` (heading/labels per FR-009),
`app/vote-client.tsx` (passes seen data for refill, unchanged presentation).
`lib/session.ts`, `lib/user-store.ts`, login flows: untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Ranking/winners already stream inside `<Suspense>`; per-user read stays a server action in the same pattern. No new routes, no deprecated APIs. |
| II. TypeScript Strictness | PASS | `pickUnderseenPair` fully typed; per-user store accessors use discriminated result types like the existing ones. |
| III. Proportionate Test-First | PASS | Red→green: pure pair-picker unit tests (incl. statistical ±10% verification per feature 002's precedent), pipeline-shape unit test, session-scoped integration test. |
| IV. Proportionate Integration Testing | PASS | One updated integration test covers the per-user read path (unauthenticated → empty/personal-empty view; uid-scoped results). Legacy-exclusion is pinned by a unit test on the key derivation (`userKeyPrefix(uid)` never produces alias keys). |
| V. Simplicity Is Paramount | PASS | Two zsets per user — the minimal structure that answers both "how often did the user pick X" and "how often did the user see X" in O(log n) per name. No Lua, no Lua-equivalent orchestration; the pipeline is the existing idiom. No new dependencies. |
| Free-Plan Budget | PASS | ~5 commands per vote (pipeline), 1 pipeline per pair batch for seen updates. At toy scale (2 users, thousands of votes) far below 10k/day. |

**Post-Phase-1 re-check**: PASS — Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-per-user-tally/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
lib/
├── pairing.ts           # ADD pickUnderseenPair(previous, scores, seen):
│                        #   weighted pick with weight = 1/(1+seen[name]),
│                        #   same redraw rules as nextPair
├── pair-queue.ts        # refillReserve takes seen map; batch chains both
│                        #   previous pair AND accumulated seen counts
├── store.ts             # ADD: userScoresKey(uid)/userSeenKey(uid),
│                        #   userScores(uid), recordUserVote (pipeline:
│                        #   xadd + zincrby global + zincrby user + hset? no —
│                        #   zincrby seen is at draft time, see R3),
│                        #   userSeen(uid), bumpUserSeen(uid, names)
├── actions.ts           # getRanking/getWinners read userScores(uid);
│                        #   getScores → getUserScores+getUserSeen for refill
├── vote-client.tsx      # refillReserve call passes seen map; unchanged UI
├── ranking/page.tsx     # heading "Deine Rangliste" (FR-009)
└── winners/page.tsx     # heading "Deine Gewinner" (FR-009)

tests/
├── unit/
│   ├── pairing.test.ts        # EXTEND: pickUnderseenPair statistics,
│   │                          #   no-repeat, uniform degeneration
│   ├── pair-queue.test.ts     # EXTEND: seen-aware refill chaining
│   └── store-keys.test.ts     # NEW: key derivation never collides with
│                              #   legacy alias data; parse shapes
└── integration/
    └── store.test.ts          # EXTEND: per-user pipeline (with creds)
```

**Structure Decision**: Existing single-project layout retained; the
identity of the change is *which keys are read/written*, not new modules.
One new pure function (`pickUnderseenPair`), one store-module extension,
small plumbing. Ranking/winners UIs change only their headings and the
action they call.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
