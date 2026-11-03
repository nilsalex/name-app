# Implementation Plan: Reset Votes and Nominations

**Branch**: `014-reset-votes-nominations` | **Date**: 2026-11-03 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from
`/specs/014-reset-votes-nominations/spec.md`

## Summary

Add **per-user reset** actions (clarified 2026-11-03): a signed-in user can
delete **their own** votes (personal win tally + seen-frequency), **their
own** nomination decisions (returning them to a fresh nomination round), or
**both in one action**. Reset deletes whole entries — never granular. Other
users' data is never touched; the shared name list is never touched. The
gate re-derives everything from storage on the next render, so no phase
state needs invalidation beyond the existing `router.refresh()` pattern.

Technical approach (research R1–R5): one new server-only module
`lib/reset-store.ts` that deletes the existing per-user keys
(`…:scores`, `…:seen`, `…:nominations`) — no new storage shape, purely
DELs on keys that already exist; three new server actions
(`resetVotes`, `resetNominations`, `resetAll`) in `app/actions.ts`; one new
client component `app/reset-controls.tsx` with a two-step inline
confirmation (FR-007 destructive guard) mounted on the vote screen and the
nomination screen; post-reset the client calls `router.refresh()` so the
gate re-derives the phase (vote screen with empty tallies, or a fresh
nomination round). No new dependency, no new route.

## Technical Context

**Language/Version**: TypeScript 5.x strict (existing tsconfig); Next.js
16.4.3 pinned (App Router, `cacheComponents: true`), React 19; Node 20+.

**Primary Dependencies**: No NEW dependency. Reuses: `@upstash/redis` REST
client, `next/headers` cookies session (005, unchanged), existing server
action + CSS Modules conventions, `useRouter().refresh()` (already used by
sign-out in `vote-client.tsx`).

**Storage**: Upstash Redis free tier, unchanged. Zero new key shapes: reset
DELETES existing per-user keys (`<prefix>:user:<uid>:scores`,
`<prefix>:user:<uid>:seen`, `<prefix>:user:<uid>:nominations`). Worst case
is 1 pipeline with 2–3 DELs per reset — trivially within free-tier limits
(Free-Plan Budget).

**Testing**: `npm test` (node:test + tsx, unit + integration). Per
constitution III/IV: one red-green unit test for the reset target
computation (pure key-derivation function), one integration test for the
reset critical path (write → delete → reads return empty) against the
existing `_setClientForTests` seam. `npm run build` gate unchanged.

**Target Platform**: Vercel Hobby (existing deployment); mobile web
(existing layout conventions apply).

**Project Type**: Existing single-project Next.js web app; this feature
adds one store module, three server actions, one client component, and
small mount-point edits. No new route segments.

**Performance Goals**: Reset tap → storage deletion → refreshed view well
under 2 s (SC-001/SC-002: under 5 s end-to-end). Presentation path is one
action round trip plus the existing gate render; no polling, no new reads.

**Constraints**: Per-user scope only (FR-001/FR-002 — never touches the
other user's keys or the shared name list). Whole-entry deletion, no
granular selection (spec Assumptions). Destructive action MUST be
confirmed before deleting (FR-007). Post-reset state visible to all users
on next view (FR-008) — automatic, since every view is server-derived.
German UI copy consistent with existing screens.

**Scale/Scope**: 2 users; diff app-side: 1 new store module (~50 lines), 3
new server actions (~60), 1 new client component `app/reset-controls.tsx`
(~90 incl. two-step confirm), small edits to `app/vote-client.tsx` and
`app/nominate-client.tsx` (mount the controls), `app/page.module.css` /
`app/nominate.module.css` (minor styles). Plus unit + integration tests.
Total well under 350 lines touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Framework Fidelity | PASS | Reuses the established patterns validated in 004–013: `"use server"` file-level actions, a Server-Component gate reading storage per request, client components with `useRouter().refresh()` (identical to the existing sign-out flow in `vote-client.tsx`). No pages-router pattern, no deprecated API. |
| II. TypeScript Strictness | PASS | New module boundaries explicitly typed (`ResetTargets`, `ActionResult` reuse). No `any`/`@ts-ignore`. |
| III. Proportionate Test-First | PASS | One focused red-green unit test for the reset-target derivation (which keys a reset deletes). No scaffolding beyond it (Principle V). |
| IV. Proportionate Integration Testing | PASS | One integration test for the reset critical path (persist data → delete → per-user reads return empty, other user untouched) against the existing fake-client seam — route-handler/page-level integration is unnecessary because the reset path is one action + existing gate rendering. Styling needs NO integration test (constitution IV). |
| V. Simplicity Is Paramount | PASS | No new dependency, no new storage shape: reset = DEL of keys that already exist. Phase state (nomination round vs voting) is already fully derived from storage by the 013 gate, so a reset needs no invalidation logic — `router.refresh()` re-derives. No undo/history (spec Assumptions) means no tombstones or soft-delete machinery. |
| Free-Plan Budget | PASS | 1 pipeline of 2–3 DELs per reset action, by 2 users, rarely — orders of magnitude below free-tier limits. No new service. |

## Project Structure

### Documentation (this feature)

```text
specs/014-reset-votes-nominations/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (reset targets over existing keys)
├── quickstart.md        # Phase 1 output (validation scenarios V1–V6)
├── contracts/           # Phase 1 output (server-action + store contracts)
├── checklists/          # Spec-kit quality checklist (already present)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
app/
├── actions.ts                   # MODIFY (additive): resetVotes(),
│                                # resetNominations(), resetAll() — each a
│                                # session-checked DELETE of the signed-in
│                                # user's own keys.
├── reset-controls.tsx           # NEW: footer controls with two-step inline
│                                # confirm ("Zurücksetzen" → "Wirklich
│                                # löschen?"); dispatches the chosen reset,
│                                # then router.refresh().
├── vote-client.tsx              # MODIFY (smallest surface): mount
│                                # <ResetControls /> below the pair area.
├── nominate-client.tsx          # MODIFY (smallest surface): mount
│                                # <ResetControls /> (nominations variant).
├── page.module.css              # MODIFY: minor styles for the controls.
└── nominate.module.css          # MODIFY: minor styles for the controls.
lib/
└── reset-store.ts               # NEW (server-only): resetTargets(uid) pure
                                # key derivation + deleteUserVotes(uid),
                                # deleteUserNominations(uid),
                                # deleteUserEverything(uid) — pipelines of
                                # DELs over the EXISTING per-user keys.
tests/
├── unit/reset-store.test.ts             # NEW (red-green per III)
└── integration/reset-store.test.ts      # NEW (existing fake-client seam)
```

**Structure Decision**: Single existing project; the feature slots into the
established `app/` + `lib/` layout exactly like features 005/006/013 did.
No new route segments, no new top-level directories.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
