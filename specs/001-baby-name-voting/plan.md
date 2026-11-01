# Implementation Plan: Baby Name Voting

**Branch**: `001-baby-name-voting` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-baby-name-voting/spec.md`

## Summary

Two users vote on German boy names from the Cologne 200 list by repeatedly
picking a favourite between a presented pair of names. Every vote is persisted
and attributed to a user; a ranking view orders all 200 names by win count
(ties share a rank), and a winners view highlights the top-ranked name(s).
The technical approach is a minimal Next.js App Router application (server
components, two routes) with votes stored in Upstash Redis (free tier) and the
Cologne 200 name list embedded as static data — the smallest possible build
that satisfies the constitution's free-plan and simplicity mandates.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Next.js 16.4.3 (App Router),
React 19.3 — as pinned in `package.json`

**Primary Dependencies**: Next.js 16.4.3, React 19.3, Upstash Redis client
(`@upstash/redis`); test runner: Node's built-in test runner (zero extra
dependencies, per Principle V)

**Storage**: Upstash Redis (free tier) — a single sorted set for scores plus a
stream/list for vote audit records; per-constitution Free-Plan Budget

**Testing**: `node:test` (built-in) with TypeScript execution via `tsx`;
unit tests for ranking/pairing logic, one integration test for the vote
persistence path (Proportionate Test-First, Principle III/IV)

**Target Platform**: Vercel Hobby plan (serverless functions), mobile web
browsers (primary), desktop browsers (bonus)

**Project Type**: web-app (single Next.js app; frontend + serverless backend
in one project — no separate packages)

**Performance Goals**: First vote within 10s of opening (SC-001); vote → next
pair round-trip under 2s (SC-002)

**Constraints**: MUST run entirely on Vercel Hobby + Upstash free tier
(Free-Plan Budget); traffic from exactly 2 users over a couple of months
(well within free quotas); no paid services of any kind

**Scale/Scope**: 2 users, 200 names, a few thousand votes over ~2 months,
3 screens (vote, ranking, winners)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Uses current App Router conventions; bundled Next.js docs consulted for API surface |
| II. TypeScript Strictness | PASS | Strict mode per `tsconfig.json`; explicit types on module boundaries |
| III. Proportionate Test-First | PASS | Test-first for voting/ranking logic; one focused test per behavior; no test scaffolding beyond `node:test` |
| IV. Proportionate Integration Testing | PASS | Integration tests only for vote persistence (critical path); UI styling untested |
| V. Simplicity Is Paramount | PASS | 2 routes, 1 data store, 1 dependency for storage; no auth beyond picking a user; no extra abstractions |
| Free-Plan Budget | PASS | Vercel Hobby + Upstash free tier only; name list embedded as static data; usage trivially within quotas |

No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-baby-name-voting/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── page.tsx                    # Vote screen (P1): pair display + selection
├── ranking/
│   └── page.tsx                # Ranking screen (P2): ordered names with shared-rank ties
├── winners/
│   └── page.tsx                # Winners screen (P3): top-ranked name(s)
├── layout.tsx                  # Root layout: nav between the three screens
└── globals.css                 # (existing) + CSS modules per page

lib/
├── names.ts                    # Cologne 200 list as typed static data
├── pairing.ts                  # Pair selection logic (pure, testable)
├── ranking.ts                  # Score/ranking computation with shared-rank ties (pure, testable)
└── store.ts                    # Upstash Redis access: recordVote(), scores(), votes()

tests/
├── unit/
│   ├── pairing.test.ts         # Pair validity, distinctness, no-seen-tracking
│   └── ranking.test.ts         # Win counts, tie sharing, empty state
└── integration/
    └── store.test.ts           # Vote persistence against Upstash (critical path)
```

**Structure Decision**: Single Next.js project (existing `app/` router
directory stays canonical). Domain logic lives in `lib/` as pure modules so
the test-first and integration-scope principles can be satisfied with minimal
test surface. The existing `app/page.tsx` is repurposed as the vote screen.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Not applicable — no violations.
