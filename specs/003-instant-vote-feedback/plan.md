# Implementation Plan: Instant Vote Feedback

**Branch**: `003-instant-vote-feedback` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-instant-vote-feedback/spec.md`

## Summary

Voting currently waits on a server round trip per tap (submit vote → refetch
scores → draw next pair). This feature makes the pair transition appear
instant (<100 ms) by preparing upcoming pairs in advance in small batches
(just-in-time refilled when the reserve drops below a threshold) and fully
decoupling the presentation from vote recording and score fetching. Votes are
dispatched asynchronously; failures are retried for a bounded time and then
surfaced via a persistent "N votes didn't count" notice. All existing
behaviours (weighted selection, no-immediate-repeat, FR-012 error honesty,
ranking/winners) are preserved.

Technical approach (from research): a client-side presentation/state split in
`app/vote-client.tsx` backed by two new pure modules — `lib/pair-queue.ts`
(pair reserve with validity filtering) and `lib/vote-sender.ts` (async vote
dispatch with retry and at-most-once semantics). Batch preparation uses the
existing pure `nextPair()`; no new dependencies, no schema changes.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js (pinned in `package.json`), React 19, Node 24 (dev/test)

**Primary Dependencies**: next, react (existing); `@upstash/redis` (existing, server-side only); NO new dependencies

**Storage**: Upstash Redis free tier (existing keys `namewahl:votes`, `namewahl:scores`) — unchanged by this feature; all new state is client-side, in-memory

**Testing**: `node:test` via `tsx` (`npm test`), unit tests for pure modules; existing integration test for store unchanged

**Target Platform**: Modern desktop/mobile browsers (Vercel Hobby deployment)

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: Tap → next pair fully visible <100 ms (SC-001); zero visible wait states across a rapid 20-vote session (SC-002)

**Constraints**: Upstash free-tier command volume MUST NOT multiply (one vote = one pipeline write; score reads amortized per batch, not per pair); in-memory offline queue only (tab-scoped); no paid services (constitution)

**Scale/Scope**: Exactly two users; single page (`/`) changes, `lib/` gains two small pure modules; ranking/winners pages untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Uses documented React/Next client patterns (`useOptimistic`/`useTransition` per bundled `interactive-apps.md` guide); no deprecated APIs; no pages-router patterns |
| II. TypeScript Strictness | PASS | All new modules fully typed, explicit exports; no `any`, no suppressions planned |
| III. Proportionate Test-First | PASS | One focused unit test file per new pure module (`pair-queue`, `vote-sender`), written before implementation; vote-client wiring verified by build + quickstart (UI-only, per Principle IV styling/UI exemption) |
| IV. Proportionate Integration Testing | PASS | No new critical server paths: store/actions unchanged; client wiring is UI behaviour, not a critical path requiring integration tests |
| V. Simplicity Is Paramount | PASS | Two small pure modules + client rewiring; no new deps, no state libraries, no workers, no persistent offline storage; retry is a simple timer loop |
| Free-Plan Budget | PASS | Command volume per vote unchanged (1 pipeline write); score reads amortized per batch (~1 read per 5 pairs instead of 1 per pair — strictly *fewer* reads than feature 002); no Vercel paid features |

**Post-Phase-1 re-check**: PASS — see Complexity Tracking (no violations; the
module split is the simplest form that keeps `vote-client.tsx` testable).

## Project Structure

### Documentation (this feature)

```text
specs/003-instant-vote-feedback/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lib/
├── pairing.ts           # existing pure weighted draw (unchanged)
├── pair-queue.ts        # NEW: pure pair reserve — batch prep, just-in-time refill, validity filter
├── vote-sender.ts       # NEW: pure-ish vote dispatch queue — async send, bounded retry, at-most-once
├── store.ts             # existing Upstash persistence (unchanged)
├── names.ts             # existing name list (unchanged)
├── user.ts              # existing user identity (unchanged)
└── ranking.ts           # existing ranking (unchanged)

app/
├── actions.ts           # existing server actions (unchanged)
├── vote-client.tsx      # MODIFIED: decoupled presentation, reserve consumption, notice UI
├── page.tsx             # unchanged
└── page.module.css      # MINOR: styles for the "N votes didn't count" notice + reserve-empty loading state

tests/unit/
├── pairing.test.ts      # existing (unchanged)
├── pair-queue.test.ts   # NEW
└── vote-sender.test.ts  # NEW
```

**Structure Decision**: Existing single-project Next.js layout is retained. The
two new modules live in `lib/` alongside `pairing.ts` so all selection/
queueing logic stays pure (unit-testable without React), and the client
component only orchestrates.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
