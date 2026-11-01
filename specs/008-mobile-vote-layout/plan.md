# Implementation Plan: Mobile-Friendly Voting Layout

**Branch**: `008-mobile-vote-layout` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-mobile-vote-layout/spec.md`

## Summary

The vote screen's button row currently uses `flex-wrap: wrap` with fixed
min/max card widths (`min-width: 150px; max-width: 44vw`), so on narrow
phones the two candidate cards can wrap onto separate rows and the layout
abandons the "left and right" arrangement. This feature makes the layout
mobile-first through a **CSS-only change** in `app/page.module.css` (plus
possibly a few class additions): the pair row becomes non-wrapping with
flex-shrinkable cards, names render on a single line (shrink font first —
`clamp()` — then CSS `text-overflow: ellipsis` as the last resort), touch
targets keep the clarified 44 × 44 px minimum, and login/ranking/winners
are verified (and minimally adjusted) against phone widths. No markup,
logic, data, or dependency changes; voting behavior (003 instant swap,
per-user tallies, error notice) is untouched by construction.

A key research finding anchors the effort: the app's candidate set is the
Cologne-200 **single-token first names** (longest: "Maximilian",
"Konstantin" — 10 characters, no spaces or hyphens). The spec's hyphenated
"Constanze-Viktoria Brandenstein" scenario is a future-proofing guard, and
with real data even the longest names fit side by side at 320 px once the
fixed 150 px card floor is replaced by flexible sizing.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (pinned), React 19; CSS via CSS Modules (`*.module.css` per constitution Technology Constraints)

**Primary Dependencies**: next, react (existing) — **NO new dependencies, no new runtime code**

**Storage**: Upstash Redis free tier (existing keys) — completely untouched by this feature

**Testing**: `node:test` via `tsx` (`npm test`) — existing suite must stay green; per Constitution Principle IV, styling/layout MUST NOT require integration tests, and this change contains no new pure logic to unit-test

**Target Platform**: Modern phone browsers (portrait ≥320 px, landscape), tablets, desktop; Vercel Hobby deployment

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: No change — text/layout reflow only; instant pair swap (<100 ms, feature 003) unaffected

**Constraints**: No wrap, side-by-side at ≥320 px (FR-001/002); shrink-then-ellipsize (FR-003, clarification Q1); 44 × 44 px touch targets (FR-005, clarification Q2); long-pair fallback = squeeze to fit, never scroll (FR-002, clarification Q3); no behavior change (FR-008)

**Scale/Scope**: Exactly two users; one CSS module (vote screen) plus small CSS checks/adjustments in ranking/winners/login styles; zero TypeScript, zero lib/ changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Pure CSS Modules — the constitution's own styling convention (`*.module.css`); no unfamiliar or deprecated Next.js APIs involved; no manual viewport meta needed (Next.js injects `width=device-width, initial-scale=1` by default per bundled `generate-viewport.md`) |
| II. TypeScript Strictness | PASS | No TypeScript changes planned; existing types untouched |
| III. Proportionate Test-First | PASS | No new logic ⇒ no new unit tests; existing suite must keep passing. Constitution Principle IV explicitly exempts styling/layout from integration tests — the proportionate verification is the build gate plus the manual quickstart checklist (documented in quickstart.md) |
| IV. Proportionate Integration Testing | PASS | No critical server paths touched (store/actions/route handlers unchanged); UI layout is explicitly excluded from integration-test requirements |
| V. Simplicity Is Paramount | PASS | The simplest possible realization: CSS declarations only, no JS measurement, no abstractions, no new deps. "Shrink" lives in one `clamp()`; "ellipsis last resort" is native `text-overflow` |
| Free-Plan Budget | PASS | Zero new runtime requests, zero data, zero new bundle-worthy logic; CSS additions only |

**Post-Phase-1 re-check** (after research.md / data-model.md / contracts):
PASS — design confirms a CSS-only surface; contract C-clauses map 1:1 to
spec FRs; no added logic or deps. Complexity Tracking stays empty.
(Recorded 2026-11-02 after Phase 1 artifacts; supersedes the earlier
inline re-check note written pre-research.)

## Project Structure

### Documentation (this feature)

```text
specs/008-mobile-vote-layout/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (UI layout contract)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── page.module.css      # MODIFY: pair row + name cards + notice (vote &
│                        #   login screen share this module)
│                        #   - .pairButtons: wrap→nowrap, flexible children
│                        #   - .nameButton: min-width floor→flex sizing,
│                        #     min-width:0, single-line ellipsis,
│                        #     font-size clamp (shrink-first, Q1)
│                        #   - tap-target floors ≥44×44 (Q2) for cards and
│                        #     the notice dismiss button
├── ranking/page.module.css  # CHECK/ADJUST: rows never overflow at 320 px
├── winners/page.module.css  # CHECK/ADJUST: same as ranking
└── globals.css          # CHECK ONLY: nav links usable on phone (existing
                         #   overflow-x:hidden already guards the page)

lib/                     # UNCHANGED
tests/                   # UNCHANGED (existing suite must stay green)
```

**Structure Decision**: Existing single-project layout retained. The
change's identity is declarative styling on the vote pair row; no new
modules, components, or files beyond the spec documents themselves.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(empty — no violations)*
