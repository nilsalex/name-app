# Tasks: Reset Votes and Nominations

**Input**: Design documents from `/specs/014-reset-votes-nominations/`

**Prerequisites**: plan.md (required), spec.md (required for user
stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included — the constitution (plan.md
Constitution Check) requires test-first per new behavior (Principle
III): one focused red-green test for the reset-target derivation, one
integration test for the reset critical path (Principle IV). No
styling/UI integration tests (Principle IV explicitly forbids them).

**Organization**: Tasks are grouped by user story so each story can be
implemented and tested independently. Coupling note: the shared
`app/reset-controls.tsx` component is introduced in US1 (votes variant)
and extended by US2 (nominations variant) and US3 (all variant) — each
extension is additive and each story's checkpoint validates its variant
end-to-end. All reset actions share the Phase 2 foundation
(`lib/reset-store.ts` + server actions).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2,
  US3)
- Include exact file paths in descriptions

## Path Conventions

Single Next.js project: `app/`, `lib/` (production), `tests/unit/`,
`tests/integration/` (existing suites, node:test + tsx via `npm test`),
`specs/014-reset-votes-nominations/` (this feature's docs). Per plan.md
Project Structure: no new route segments, no new top-level directories,
no new dependencies.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the untouched baseline before any change

- [X] T001 Baseline gate: run `npm test` (record the passing test count) and `npm run build` on the unmodified tree; both must be green with zero type/lint errors before T002 — this is the "red" reference for Constitution III and the regression floor for every checkpoint

**Checkpoint**: baseline recorded ✅

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reset data layer and the votes-reset server action —
blocking for every user story (all three variants delete per-user keys
derived by the same pure function)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Write failing unit tests for the reset-target derivation in `tests/unit/reset-store.test.ts` FIRST (Constitution III, contracts.md "lib/reset-store.ts"): `resetTargets(uid, "votes")` returns exactly `[userScoresKey(uid), userSeenKey(uid)]` (personal win tally + seen-frequency — research R1), `resetTargets(uid, "nominations")` returns exactly `[nominationKey(uid)]`, `resetTargets(uid, "all")` returns all three in the deterministic order scores → seen → nominations (data-model.md ResetTargets); the key strings must be composed from the EXISTING exported builders `userScoresKey`/`userSeenKey` (lib/store.ts) and `nominationKey` (lib/nomination-store.ts) — assert equality against those builders' outputs, never literal strings; `resetTargets("not a uid!", "votes")` throws (key-safety guard, data-model.md validation rule 1). Tests must fail (module does not exist) before T003
- [X] T003 [P] Implement the pure key-derivation function `resetTargets(uid, variant)` in `lib/reset-store.ts` per contracts.md: module opens with `import "server-only"`; variant is the union `"votes" | "nominations" | "all"`; compose keys ONLY via the existing `userScoresKey(uid)`, `userSeenKey(uid)`, `nominationKey(uid)` builders (no duplicated key formats, no new key shapes — data-model.md); deterministic order scores, seen, nominations; strict TS, no `any`; make T002 green
- [X] T004 [P] Write failing integration tests for the votes-reset critical path in `tests/integration/reset-store.test.ts` FIRST (Constitution IV — persistence critical path; same `_setClientForTests` fake-client seam pattern as the existing `tests/integration/nomination-store.test.ts`): seed `userScoresKey(uid1)` and `userSeenKey(uid1)` via the existing store writers (`recordVote`/`bumpUserSeen` or direct client writes), call `deleteUserVotes(uid1)`, then `userScores(uid1)` and `userSeen(uid1)` return empty maps (FR-003: no residue); the shared `<prefix>:scores` global zset and `<prefix>:votes` stream are untouched (research R1); uid2's keys are untouched (per-user scope, FR-001); a `deleteUserVotes` on a uid with no keys succeeds without error (FR-009 edge case — DEL is a no-op on missing keys). Tests must fail before T005
- [X] T005 [P] Implement `deleteUserVotes(uid): Promise<void>` in `lib/reset-store.ts` per contracts.md: ONE pipeline `DEL` of `resetTargets(uid, "votes")` (data-model.md validation rule 5 — batching contract as in `recordVote`); throws on Upstash failure (the action maps it to an ActionResult error); reuse the redis() client accessor pattern of `lib/store.ts`/`lib/nomination-store.ts` (mirror the minimal accessor + `_setClientForTests` seam — do not duplicate client construction); make T004 green (depends on T003)
- [X] T006 Add the `resetVotes(): Promise<ActionResult>` server action to `app/actions.ts` per contracts.md: session check identical to `submitVote` via the existing `getCurrentUid()` — signed out → `{ ok: false, error: "Abgelaufen — bitte neu anmelden." }` (same copy); call `deleteUserVotes(uid)`; Upstash failure → `{ ok: false, error: "Zurücksetzen fehlgeschlagen — bitte nochmal versuchen." }`; success → `{ ok: true }`; never touches global/audit/other-user keys (FR-005) (depends on T005)
- [X] T007 Gate check: `npm test` (baseline + T002 + T004 suites all green), `npx tsc --noEmit`, `npm run build` — zero type/lint errors; app behavior unchanged so far (no `app/` component edits yet)

**Checkpoint**: reset state layer complete and tested; user story
implementation can begin ✅

---

## Phase 3: User Story 1 — Reset my votes (Priority: P1) 🎯 MVP

**Goal**: A signed-in user can delete ALL of their own votes (personal
win tally + seen-frequency) with one confirmed action; other users' data
and the user's own nomination decisions are untouched; the refreshed
view shows the clean state (neutral bottom rank, uniform drafting).

**Independent Test**: Cast a few votes, tap "Stimmen zurücksetzen",
confirm, and verify the ranking shows all names at the neutral bottom
rank in under 5 s while another user's votes and the user's own
nomination round are unchanged. (Nominations reset and combined reset
come in US2/US3.)

### Implementation for User Story 1

- [X] T008 [P] [US1] Create `app/reset-controls.tsx` per contracts.md "app/reset-controls.tsx": client component with props `{ variant: "votes" | "nominations" | "all" }`; for this story implement the `"votes"` (and `"all"`, rendered but unused until US3) button label "Stimmen zurücksetzen"; two-step inline confirmation per research R3 (FR-007): first tap swaps to the confirm state "Wirklich löschen? Endgültig, ohne Widerruf." with "Ja, löschen" / "Abbrechen" buttons, cancel returns to neutral, ONLY confirm dispatches the action (`resetVotes` for the votes variant); confirm button disabled while in flight (double-tap safe); NO retry loop — a failure surfaces the action's error copy inline and returns the control to neutral (research R3); on `{ ok: true }` reset local confirm state and call `router.refresh()` (research R4 — the same mechanism as the existing sign-out button in `app/vote-client.tsx`); German copy throughout; no `window.confirm`, no new dependency
- [X] T009 [US1] Add the reset-controls styles to `app/page.module.css`: neutral secondary button styling consistent with the existing `styles.signOut` conventions, a visually distinct confirm state (destructive emphasis) for "Ja, löschen", small-screen tap targets per the 008–010 mobile conventions; no shared-CSS refactor (Principle V) (consumed by T008 — sequence after or together)
- [X] T010 [US1] Mount the votes reset in `app/vote-client.tsx`: render `<ResetControls variant="all" />` below the pair area (the `"all"` button appears there but dispatches nothing until US3 wires `resetAll` — for this story only the "Stimmen zurücksetzen" path is functional); the reset must NOT touch the pair reserve or sender queue (research R5 — `router.refresh()` re-derives everything server-side); leave `submitVote` dispatch path untouched (depends on T006, T008)
- [X] T011 [US1] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green; manual `npm run dev` walk-through of quickstart V1 (reset votes → neutral bottom ranking <5 s), V2 (per-user: other user's ranking unchanged), V6 (cancel deletes nothing; reset with zero votes → no error, control returns to neutral)

**Checkpoint**: User Story 1 fully functional and testable
independently — votes reset works end-to-end ✅

---

## Phase 4: User Story 2 — Reset my nominations (Priority: P2)

**Goal**: A signed-in user can delete ALL of their own nomination
decisions with one confirmed action, returning them to a fresh
nomination round over all 200 names; the other user's decisions, pool,
and votes are untouched; the user's own vote tally is untouched.

**Independent Test**: Complete a nomination round, tap
"Nominierungen zurücksetzen", confirm, and verify the nomination screen
shows the first canonical-list name with counter "0 von 200" while the
user's votes and the other user's round are unchanged.

### Implementation for User Story 2

- [ ] T012 [P] [US2] Extend `tests/integration/reset-store.test.ts` with the nominations-reset critical path (Constitution III/IV — one focused test for the new behavior, red FIRST): seed `nominationKey(uid1)` via `writeNomination`, call `deleteUserNominations(uid1)`, then `readNominations(uid1)` returns an empty map (FR-004: fresh-round state is pure derivation — no restart marker); uid1's `userScoresKey`/`userSeenKey` are untouched (a nominations reset NEVER deletes votes — FR-005); uid2's nominations key is untouched (per-user scope, FR-002)
- [ ] T013 [US2] Implement `deleteUserNominations(uid): Promise<void>` (single `DEL` of `nominationKey(uid)`) and the `resetNominations(): Promise<ActionResult>` server action in `lib/reset-store.ts` + `app/actions.ts` per contracts.md: identical session/failure/success shapes to `resetVotes` (T006); failure copy "Zurücksetzen fehlgeschlagen — bitte nochmal versuchen." (depends on T003, T012)
- [ ] T014 [US2] Extend `app/reset-controls.tsx` with the `"nominations"` variant and mount it in `app/nominate-client.tsx`: button label "Nominierungen zurücksetzen", dispatching `resetNominations`; the nomination screen offers ONLY this variant (a fresh round has no votes to reset — FR-005; research R6); on success `router.refresh()` re-derives the gate → `NominateClient` renders the fresh round ("0 von 200"); add the variant's confirm-state styles to `app/nominate.module.css` (mirroring T009's patterns, no shared-CSS refactor) (depends on T013, T008)
- [ ] T015 [US2] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green; manual quickstart V3 walk-through (fresh round, tally intact, re-completed round resumes voting with prior votes) and V4 (per-user: other user's round/pool/votes unaffected)

**Checkpoint**: User Stories 1 AND 2 both work independently ✅

---

## Phase 5: User Story 3 — Reset everything at once (Priority: P3)

**Goal**: A signed-in user can wipe their own votes AND their own
nomination decisions in ONE confirmed action (one confirmation, one
round trip), landing in a fresh nomination round with empty tallies.

**Independent Test**: With both votes and a completed round, tap "Alles
zurücksetzen", confirm once, and verify a fresh "0 von 200" round AND an
empty personal ranking — no second confirmation.

### Implementation for User Story 3

- [ ] T016 [P] [US3] Extend `tests/integration/reset-store.test.ts` with the combined-reset critical path (Constitution III/IV — red FIRST): seed all three keys for uid1, call `deleteUserEverything(uid1)`, then all three reads (`userScores`, `userSeen`, `readNominations`) return empty and uid2's keys are untouched; assert it was ONE pipeline (single client round trip — the fake client records command batches, data-model.md validation rule 5)
- [ ] T017 [US3] Implement `deleteUserEverything(uid): Promise<void>` (ONE pipeline `DEL` of `resetTargets(uid, "all")`) and the `resetAll(): Promise<ActionResult>` server action in `lib/reset-store.ts` + `app/actions.ts` per contracts.md (identical shapes to T006) (depends on T003, T016)
- [ ] T018 [US3] Wire the `"all"` variant in `app/reset-controls.tsx` (button label "Alles zurücksetzen", dispatching `resetAll` — already mounted on the vote screen from T010): the vote screen now offers BOTH "Stimmen zurücksetzen" and "Alles zurücksetzen", each with its own two-step confirm (FR-001 + FR-006); the nomination screen keeps only the nominations variant (research R6) (depends on T017, T008)
- [ ] T019 [US3] Checkpoint: `npm test` + `npx tsc --noEmit` + `npm run build` green; manual quickstart V5 walk-through (single confirmed action → fresh round + empty tally, no second confirmation)

**Checkpoint**: All user stories independently functional ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and final quality gates

- [ ] T020 Run the full quickstart.md validation suite V1–V6 in order on `npm run dev` (and on the deployed branch if credentials allow); record pass/fail per scenario in the PR description
- [ ] T021 Final constitution gates: `npm test` all green, `npx tsc --noEmit` zero errors, `npm run build` zero type/lint errors (Development Workflow rule); confirm no new dependency entered `package.json` (Principle V) and PR lists exercised principles + test-first evidence per constitution Governance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — baseline must be green before anything changes
- **Foundational (Phase 2)**: T002→T003 (red-green), T004→T005 (red-green, T005 also needs T003) can proceed in parallel; T006 needs T005; T007 gates the phase — BLOCKS all user stories
- **User Stories (Phase 3–5)**: all depend on Phase 2; US2/US3 additionally extend the `reset-controls.tsx` component introduced in US1 (T008), so their wiring tasks (T014, T018) follow US1's component — but their store/action cores (T012/T013, T016/T017) can start right after Phase 2 in parallel with US1
- **Polish (Phase 6)**: depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Phase 2 only — introduces the shared controls component; testable with nominations/all variants not yet dispatched
- **User Story 2 (P2)**: store/action core (T012/T013) after Phase 2 in parallel with US1; UI wiring (T014) after T008 (shared component exists)
- **User Story 3 (P3)**: store/action core (T016/T017) after Phase 2 in parallel with US1/US2; wiring (T018) after T008 — smallest story, the mount point already exists

### Within Each User Story

- Tests written FIRST and failing (Constitution III/IV) before their implementation task
- Pure derivation before store functions, store before actions, actions before UI wiring, checkpoint last

### Parallel Opportunities

- T002/T003 alongside T004/T005 (different files, independent red-green cycles)
- T008 (US1 component) in parallel with T012/T013 (US2 core) and T016/T017 (US3 core)
- T012 (US2 tests) and T016 (US3 tests) extend the same file as T004 — sequence them or run when the other is merged
- T008 and T009 are the same story's separate files but T009's classes are consumed by T008's component — sequence them

---

## Parallel Example: Foundational Phase

```bash
# Launch the two independent red-green cycles together:
Task: "Write failing reset-store unit tests in tests/unit/reset-store.test.ts"
Task: "Write failing reset-store integration tests in tests/integration/reset-store.test.ts"
# then their implementations:
Task: "Implement resetTargets in lib/reset-store.ts"
Task: "Implement deleteUserVotes in lib/reset-store.ts"
```

## Parallel Example: User Stories after Phase 2

```bash
# Developer A (US1): reset-controls.tsx → page.module.css → vote-client mount
# Developer B (US2): integration tests → deleteUserNominations + resetNominations
# Developer C (US3): integration tests → deleteUserEverything + resetAll
# Converge: T014 (US2 wiring) and T018 (US3 wiring) need T008's component.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 baseline → Phase 2 foundation (T002–T007)
2. Phase 3 (T008–T011): the votes reset works end-to-end on the vote
   screen
3. **STOP and VALIDATE**: quickstart V1/V2/V6 pass; nominations/all
   buttons visible but inert (correct — US2/US3 not yet wired)

### Incremental Delivery

1. MVP (US1) → validate → users can reset their votes
2. Add US2 → validate → users can also redo their nomination round
3. Add US3 → validate → one-action fresh start
4. Each story adds value without breaking previous stories

### Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that
  break independence
