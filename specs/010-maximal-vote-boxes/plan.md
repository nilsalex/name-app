# Implementation Plan: Maximal Vote Boxes

**Branch**: `010-maximal-vote-boxes` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-maximal-vote-boxes/spec.md`

## Summary

Feature 009 made the pair boxes static equal halves (`flex: 1 1 0`); this
feature makes those halves **as large as the mobile viewport allows**, in
three coordinated CSS moves in `app/page.module.css`:
1. **Fill the width**: remove `.nameButton`'s `max-width: 44vw` cap (the
   last limit on the static halves' growth), so the equal halves stretch
   to the full pair row made available by `.voteArea`'s 24 px page
   padding (SC-001's ≥95% row-fill).
2. **Grow the height**: raise `.nameButton`'s vertical padding from
   22 px → **30 px**, growing each box to ≈86 px tall at mobile sizes —
   a dominant, thumb-friendly target (FR-001) that keeps the whole vote
   column (nav + sign-out + hint + pair + notice) scroll-free at the
   smallest supported portrait heights (~568 px).
3. **Grow the type**: raise the name font clamp from
   `clamp(15px, 4.6vw, 26px)` → **`clamp(16px, 8vw, 40px)`** — the name
   becomes the visually dominant text on the screen (FR-004/SC-002).

The staticity/equality machinery (basis-0 flex halves, separator, gap
14 px) is untouched. Fitting rules are re-validated for the new
worst-case (40 px cap): the horizontal padding floor drops 8 px →
**6 px** so "Maximilian"/"Konstantin" (~10 chars) keep ≥2 px of margin
inside their box at 320 px at font 16 px without triggering the
ellipsis; the ellipsis last resort remains in force as future
proofing. No markup, logic, data, or dependency changes; behavior
(003 swap, tallies, notices) is untouched by construction.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 16.4.3 (pinned), React 19; CSS via CSS Modules (`*.module.css` per constitution Technology Constraints); body font is Geist Sans (`next/font/google`) with Arial/Helvetica fallback

**Primary Dependencies**: next, react (existing) — **NO new dependencies, no new runtime code**

**Storage**: Upstash Redis free tier (existing keys) — completely untouched by this feature

**Testing**: `node:test` via `tsx` (`npm test`) — existing suite must stay green; per Constitution Principle IV, styling/layout MUST NOT require integration tests: no new automated tests; verification = existing gates + manual quickstart checks

**Target Platform**: Modern phone browsers (portrait ≥320 px, landscape), tablets, desktop; Vercel Hobby deployment

**Project Type**: Next.js App Router web app (existing single-project layout)

**Performance Goals**: No change — static flex layout; instant pair swap (<100 ms, feature 003) unaffected

**Constraints**: Pair row fills available width (SC-001); boxes dominate the viewport (FR-001, SC-002); names stay dominant & fitted (FR-003/FR-004: shrink-first clamp 16–40 px, ellipsis last resort, no-scroll chain); surrounding UI (nav, sign-out, hint, notices) stays on-screen and tappable (FR-007); static equal halves & pair-to-pair immobility carried forward unchanged from feature 009 (FR-002); behavior unchanged (FR-009); no horizontal scroll at any supported width (FR-006)

**Scale/Scope**: Exactly two users; one CSS module (`app/page.module.css`): `.nameButton` (max-width removal, vertical padding 22→30 px, font clamp retune, horizontal padding floor 8→6 px) + `.vs` (15→17 px for the enlarged composition); zero TypeScript changes, zero lib/ changes, markup untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Pure CSS Modules — the constitution's own styling convention; only standard flexbox/viewport-unit declarations, no Next.js APIs involved |
| II. TypeScript Strictness | PASS | No TypeScript changes planned; existing types untouched |
| III. Proportionate Test-First | PASS | No new logic ⇒ no new unit tests; existing suite must keep passing. Principle IV explicitly exempts styling/layout from integration tests — proportionate verification is the build gate plus the manual quickstart checklist (precedent: features 008/009) |
| IV. Proportionate Integration Testing | PASS | No critical server paths touched (store/actions/route handlers unchanged); UI layout is explicitly excluded from integration-test requirements |
| V. Simplicity Is Paramount | PASS | ~4 declarations in one CSS module realize maximal static boxes; no JS measurement, no container queries, no new deps; every change reuses the mechanisms already inherited from 008/009 |
| Free-Plan Budget | PASS | Zero new runtime requests, zero data, zero new bundle-worthy logic; CSS declarations only |

**Post-Phase-1 re-check** (after research.md / data-model.md / contracts):
PASS — design remains CSS-only; M-clauses in the contract map 1:1 to
spec FRs and preserve the inherited S/C-clauses; no added logic or
deps; Complexity Tracking stays empty. (Recorded 2026-11-01.)

## Project Structure

### Documentation (this feature)

```text
specs/010-maximal-vote-boxes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (presentational-only note)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (maximality contract, amends 009)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── page.module.css      # MODIFY: maximal pair-box presentation
│                        #   - .nameButton: remove max-width: 44vw (halves
│                        #     now stretch to the full available row);
│                        #     vertical padding 22→30px; font clamp
│                        #     15/4.6vw/26 → 16/8vw/40; horizontal padding
│                        #     floor 8→6px (restores ≥0px margin for the
│                        #     40px-cap worst case at 320px)
│                        #   - .vs: font-size 15→17px (separator keeps its
│                        #     visual weight in the enlarged composition;
│                        #     still flex 0 0 auto, no wrap)
├── ranking/page.module.css  # UNCHANGED (008/009 guarantees stand)
├── winners/page.module.css  # UNCHANGED
└── globals.css          # UNCHANGED (24px page padding is the width
                         #   baseline the pair row now fills)

lib/                     # UNCHANGED
tests/                   # UNCHANGED (existing suite must stay green)
```

**Structure Decision**: Existing single-project layout retained. The
change's identity is four declarations + two comment blocks in one CSS
module; no new modules, components, or files beyond the spec documents
themselves.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(empty — no violations)*
