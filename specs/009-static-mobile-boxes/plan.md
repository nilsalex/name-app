# Implementation Plan: Static Mobile Pair Boxes

**Branch**: `009-static-mobile-boxes` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-static-mobile-boxes/spec.md`

## Summary

Feature 008 made the pair row never wrap, but let the cards size themselves
around their text (`flex: 1 1 auto`): between two votes the card widths
change with the name lengths of the next pair, so the boxes visibly "move"
(right card position = left card width + separator). This feature freezes
the geometry: each of the two name boxes gets an **equal, content-
independent share of the row** (`flex: 1 1 0` on `.nameButton`), so box
positions and sizes are pixel-identical across consecutive pairs at any
given viewport; only the text inside changes, fitted per 008's shrink-then-
ellipsis rules. This is a **CSS-only change** in `app/page.module.css`
(one flex value swap, plus worst-case re-tuning of the clamp/padding
floors measured against the static card width at 320 px). No markup,
logic, data, or dependency changes; voting behavior (003 instant swap,
per-user tallies, error notice) is untouched by construction.

**Design risk resolved in research (R2)**: static equal halves make the
longest real names ("Maximilian"/"Konstantin", 10 chars) slightly tighter
than 008's content-fitted flex did. The floors set by 008 (horizontal
padding floor 16 px, font floor 15 px) must be re-validated against the
static card width (~105 px at 320 px) and lowered if the worst case would
trigger the ellipsis; the mechanism itself is unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (pinned), React 19; CSS via CSS Modules (`*.module.css` per constitution Technology Constraints)

**Primary Dependencies**: next, react (existing) — **NO new dependencies, no new runtime code**

**Storage**: Upstash Redis free tier (existing keys) — completely untouched by this feature

**Testing**: `node:test` via `tsx` (`npm test`) — existing suite must stay green; per Constitution Principle IV, styling/layout MUST NOT require integration tests, and this change contains no new pure logic to unit-test

**Target Platform**: Modern phone browsers (portrait ≥320 px, landscape), tablets, desktop; Vercel Hobby deployment

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: No change — static geometry is computed by the same flex layout pass; instant pair swap (<100 ms, feature 003) unaffected

**Constraints**: Box positions and sizes fixed across consecutive pairs (FR-001/002); static per viewport via `flex: 1 1 0` (FR-002/FR-004, research R2); text fitted into boxes, never boxes resized around text (FR-002); 44 × 44 px touch floor preserved (FR-008); ellipsis must remain unreachable for the real 200-name set at ≥320 px (008 C1.3-data carried over — this is the main tuning constraint, R2); no behavior change (FR-007)

**Scale/Scope**: Exactly two users; one CSS module (`app/page.module.css`): the `.nameButton` flex basis swap plus floor re-tuning; zero TypeScript, zero lib/ changes, markup untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Pure CSS Modules — the constitution's own styling convention; flex/grid layout mechanics are stable web-platform primitives, no Next.js APIs involved |
| II. TypeScript Strictness | PASS | No TypeScript changes planned; existing types untouched |
| III. Proportionate Test-First | PASS | No new logic ⇒ no new unit tests; existing suite must keep passing. Principle IV explicitly exempts styling/layout from integration tests — proportionate verification is the build gate plus the manual quickstart checklist (documented in quickstart.md), same precedent as feature 008 |
| IV. Proportionate Integration Testing | PASS | No critical server paths touched (store/actions/route handlers unchanged); UI layout is explicitly excluded from integration-test requirements |
| V. Simplicity Is Paramount | PASS | Simplest possible realization: one flex declaration change (`1 1 auto` → `1 1 0`) making the existing flex row static by construction; no JS measurement, no grid rewrite, no new deps |
| Free-Plan Budget | PASS | Zero new runtime requests, zero data, zero new bundle-worthy logic; CSS declarations only |

**Post-Phase-1 re-check** (after research.md / data-model.md / contracts):
PASS — design confirms a CSS-only surface; S-clauses in the contract map
1:1 to spec FRs; no added logic or deps. Complexity Tracking stays empty.
(Recorded 2026-11-03.)

## Project Structure

### Documentation (this feature)

```text
specs/009-static-mobile-boxes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (presentational-only note)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (static layout contract, amends 008)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── page.module.css      # MODIFY: static pair geometry (vote & login share
│                        #   this module)
│                        #   - .nameButton: flex: 1 1 auto → 1 1 0 — equal,
│                        #     content-independent, per-viewport-static
│                        #     halves; left/right positions become fixed
│                        #   - re-tune floors against the static width at
│                        #     320 px so 008 C1.3-data (ellipsis unreachable
│                        #     for real names) still holds:
│                        #     font clamp floor and/or horizontal padding
│                        #     floor (exact values per R2 worst-case math)
│                        #   - .pairButtons / .vs: unchanged (row already
│                        #     non-wrapping; separator already fixed-width)
├── ranking/page.module.css  # UNCHANGED (008 pass stands)
├── winners/page.module.css  # UNCHANGED (008 pass stands)
└── globals.css          # UNCHANGED

lib/                     # UNCHANGED
tests/                   # UNCHANGED (existing suite must stay green)
```

**Structure Decision**: Existing single-project layout retained. The
change's identity is two-to-four CSS declarations in one module; no new
modules, components, or files beyond the spec documents themselves.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(empty — no violations)*
