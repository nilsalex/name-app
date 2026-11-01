# Implementation Plan: Weighted Pair Selection

**Branch**: `002-weighted-pairing` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-weighted-pairing/spec.md`

## Summary

Replace uniform random pair selection with score-weighted selection: each
name's chance of appearing in a pair is proportional to `score + 1` (linear
weighting with a +1 base, per clarification session 2026-11-01). Both pair
members are drawn independently from the same weighted pool; no bracketing,
no variety floor, no new stored state. Pair validity rules (distinct
members, no immediate exact repeat) are unchanged. The change is confined to
`lib/pairing.ts` (pure function) plus its tests — no UI, store, or API
changes.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 24, Next.js 16.4.3 App Router (pinned in package.json)

**Primary Dependencies**: React 19, `@upstash/redis` (unchanged by this feature); no new dependencies

**Storage**: Upstash Redis (existing `scores` sorted set — read at draw time; no schema change)

**Testing**: `node:test` via `tsx` (`npm test`); unit tests for the weighting math and pair validity

**Target Platform**: Web (mobile-first), Vercel Hobby plan

**Project Type**: Web application (existing Next.js app; this feature modifies one library module)

**Performance Goals**: Pair draw is pure client-side math over ≤200 names — instantaneous (<1ms); no network round-trip added

**Constraints**: Free-plan budget: weighted selection reads scores once per page load (1 Redis read, same as the ranking view); no polling, no extra commands per vote

**Scale/Scope**: Exactly 2 users, 200 names, a couple of months of voting; single module change + tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Framework Fidelity | PASS | No new framework usage; change is in a pure TS module. Next.js rendering behavior untouched. |
| II. TypeScript Strictness | PASS | `lib/pairing.ts` already fully typed; new signature keeps explicit types, no `any`. |
| III. Proportionate Test-First | PASS | Tests written first for the new weighting behavior (red → green). One focused test per behavior; no new test tooling. |
| IV. Proportionate Integration Testing | PASS | Pair selection is a pure function — verifiable at unit level only. No new integration test; existing store integration test unaffected. |
| V. Simplicity Is Paramount | PASS | Simplest viable design: weighted random draw in one existing function. No new dependencies, abstractions, or persistence. |
| Free-Plan Budget | PASS | Zero added Redis commands per vote; one existing scores read reused at draw time. |

**Post-design re-check (after Phase 1)**: still PASS — the design adds no
module, no dependency, and no stored state; the weighted draw is ~40 lines
in `lib/pairing.ts`.

## Project Structure

### Documentation (this feature)

```text
specs/002-weighted-pairing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
lib/
├── names.ts             # unchanged — fixed 200-name list
├── pairing.ts           # MODIFIED — weighted nextPair(scores)
├── ranking.ts           # unchanged
├── store.ts             # unchanged — scores() reused at draw time
├── user.ts              # unchanged
app/
├── vote-client.tsx      # MODIFIED — fetch scores once, pass to nextPair
├── actions.ts           # unchanged
tests/
├── unit/
│   ├── pairing.test.ts  # MODIFIED — weighting + validity tests (written first)
│   └── ranking.test.ts  # unchanged
└── integration/
    └── store.test.ts    # unchanged
```

**Structure Decision**: Existing single Next.js app structure is retained.
The feature touches exactly one library module (`lib/pairing.ts`) and one
client component (`app/vote-client.tsx`, to pass the score map into the
draw). No new files except updated tests and this feature's spec artifacts.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
