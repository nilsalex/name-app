# Implementation Plan: Name Nomination Round

**Branch**: `013-name-nomination-round` | **Date**: 2026-11-03 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from
`/specs/013-name-nomination-round/spec.md`

## Summary

Add a **nomination round** that gates the existing pair voting: before a user
can vote, every name of the Cologne 200 list is presented **one at a time**
and the user decides include/exclude for each. Decisions are final and
persistent; each user's **voting pool is independent** (their own included
names — clarified 2026-11-03, no intersection). Pair drafting, ranking, and
all other existing behavior are unchanged except that draft pairs draw only
from the user's pool.

Technical approach (research R1–R8): one new per-user Redis hash
(`namewahl:user:<uid>:nominations`, field = name, value = `in`/`out`) written
once per decision; the existing session gate in `app/page.tsx` grows a third
branch — incomplete nominations → nomination client, complete → existing
`VoteClient` with the derived pool passed as a prop; `pickUnderseenPair` /
`refillReserve` gain an optional pool parameter (defaulting to the full list)
so pair drafting is pool-constrained; two new server actions
(`getNomination`, `setNomination`) in `app/actions.ts`. No new routes except
none are needed — the gate lives in the existing flow. No new dependency.

## Technical Context

**Language/Version**: TypeScript 5.x strict (existing tsconfig); Next.js
16.4.3 pinned (App Router, `cacheComponents: true`), React 19; Node 20+.

**Primary Dependencies**: No NEW dependency. Reuses: `@upstash/redis` REST
client, `next/headers` cookies session (005, unchanged), existing server
action + CSS Modules conventions.

**Storage**: Upstash Redis free tier, unchanged. One new key type:
`<prefix>:user:<uid>:nominations` hash (per user). ~200 HSETs per user once,
one HGETALL per app open. Deeply inside free-tier limits (Free-Plan Budget).

**Testing**: `npm test` (node:test + tsx, unit + integration). Per
constitution III/IV: one red-green unit test per new pure behavior
(next-undecided-name computation, pool-constrained drafting), one
integration test for the nomination store roundtrip against the existing
`_setClientForTests` seam. `npm run build` gate unchanged.

**Target Platform**: Vercel Hobby (existing deployment); mobile web
(existing layout conventions apply).

**Project Type**: Existing single-project Next.js web app; this feature adds
client components + server actions + one store module. No new route segments
required (nomination phase lives inside the existing `/` gate and its
client).

**Performance Goals**: Nomination decision tap → next name swap synchronous
(<100 ms presentation path, mirroring the vote screen's reserve pattern —
the decision HSET travels in background). OAuth gate unchanged.

**Constraints**: Free-plan budget (constitution): +1 Redis key per user,
~400 requests per user lifetime — negligible. No voting before own round
complete (FR-006/SC-003). Pools independent per user (FR-007). Decisions
final (FR-011). Progress counter "X of 200" (FR-012). Returning users land
directly in voting (FR-013). German UI copy consistent with existing
screens.

**Scale/Scope**: 2 users; diff app-side: 1 new store module (~60 lines), 2
new server actions (~50), 1 new client component `app/nominate-client.tsx`
(~120), small edits to `app/page.tsx` (gate third branch), `app/vote-client.tsx`
(pool prop), `lib/pairing.ts` + `lib/pair-queue.ts` (optional pool param).
Plus unit/integration tests. Total well under 400 lines touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Reuses the established App Rowter patterns already validated in 004–012: `"use server"` actions (per bundled `use-server.md` — file-level directive, all exports server functions), a Server-Component gate reading `cookies()` inside one `<Suspense>` boundary under `cacheComponents: true` (same shape as the existing `VoteGate`), client components with props down. No pages-router pattern, no deprecated API. |
| II. TypeScript Strictness | PASS | New module boundaries explicitly typed (`NominationDecision`, action result types). Discriminated `"in" \| "out"` value union, no `any`/`@ts-ignore`. |
| III. Proportionate Test-First | PASS | One focused red-green unit test per new pure behavior: (a) first-undecided-name/resume computation, (b) pool-constrained pair drafting never emits a pool-external name. No scaffolding beyond those (Principle V). |
| IV. Proportionate Integration Testing | PASS | One integration test for the nomination persistence critical path (set → read → pool derivation against the existing test seam), mirroring the 006 store tests. Nomination styling/layout needs NO integration test (constitution IV). |
| V. Simplicity Is Paramount | PASS | No new dependency. Nomination state is ONE Redis hash per user; completeness, progress, and pool are all DERIVED from it — no extra counters, no round-state records, no stored order (R1: canonical list order makes resume trivial). Phase transition is a client-side state swap in the existing page, not a new route. |
| Free-Plan Budget | PASS | +1 hash key per user; writes: 1 HSET per decision (≈400 per user total, once ever), reads: 1 HGETALL per page open. Trivially within Upstash free tier; no new service. |

## Project Structure

### Documentation (this feature)

```text
specs/013-name-nomination-round/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (NominationRecord hash + derived state)
├── quickstart.md        # Phase 1 output (validation scenarios V1–V7)
├── contracts/           # Phase 1 output (server-action + pure-function contracts)
├── checklists/          # Spec-kit quality checklist (already present)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
app/
├── page.tsx                     # MODIFY (gate): VoteGate grows a third
│                                # branch — read nominations alongside the
│                                # session; incomplete → NominateClient,
│                                # complete → VoteClient (with pool prop).
│                                # Still one Suspense boundary, one round trip.
├── nominate-client.tsx          # NEW: one-name-at-a-time UI; per-decision
│                                # fire-and-forget HSET (same sender pattern
│                                # as votes), progress counter "X von 200",
│                                # swaps into the vote phase on completion.
├── vote-client.tsx              # MODIFY (smallest surface): accepts
│                                # `pool: readonly string[]`; passes it into
│                                # refillReserve; locked-message branch when
│                                # pool.length < 2 (FR-008).
└── actions.ts                   # MODIFY (additive): getNomination(),
                                # setNomination() server actions.
lib/
├── nomination-store.ts          # NEW (server-only): hash read/write + pool
│                                # derivation + decided-count helpers over
│                                # `namewahl:user:<uid>:nominations`.
├── nomination-logic.ts          # NEW (pure, no I/O): nextUndecidedName(),
│                                # decidedCount(), isRoundComplete() —
│                                # unit-pinnable per constitution III.
├── pairing.ts                   # MODIFY: pickUnderseenPair/nextPair gain an
│                                # optional `pool` param (defaults to the full
│                                # list — zero behavior change for existing
│                                # callers without it).
└── pair-queue.ts                # MODIFY: refillReserve threads the pool
                                # through to drafting.
tests/
├── unit/nomination-logic.test.ts        # NEW (red-green per III)
├── unit/pairing-pool.test.ts            # NEW (red-green per III)
└── integration/nomination-store.test.ts # NEW (existing fake-client seam)
```

**Structure Decision**: Single existing project; the feature slots into the
established `app/` + `lib/` layout exactly like features 005/006 did. No new
route segments, no new top-level directories.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
