# Contracts: Reset Votes and Nominations (014)

Date: 2026-11-03. All contracts are internal TypeScript interfaces (server
actions + pure functions + one client component) — the app exposes no HTTP
API beyond its own routes and server actions, per 006/013. Unmarked
existing contracts unchanged.

## Server Actions (`app/actions.ts`)

### `resetVotes(): Promise<ActionResult>` — NEW

Deletes the signed-in user's own vote-derived keys (data-model.md R1):
one pipeline `DEL <prefix>:user:<uid>:scores`,
`DEL <prefix>:user:<uid>:seen`.

- Session check identical to `submitVote`; signed-out/expired →
  `{ ok: false, error: "Abgelaufen — bitte neu anmelden." }` (same copy).
- Upstash/pipeline failure → `{ ok: false, error: "Zurücksetzen
  fehlgeschlagen — bitte nochmal versuchen." }`.
- Success → `{ ok: true }`. Never touches the global tally, audit stream,
  other users' keys, or nominations (FR-005).

### `resetNominations(): Promise<ActionResult>` — NEW

Deletes the signed-in user's own decisions hash (data-model.md R2): one
`DEL <prefix>:user:<uid>:nominations`. The next gate render derives a
fresh nomination round (0 contracts beyond the delete — no restart
marker, no cursor).

- Session/failure/success shapes identical to `resetVotes`.
- Never touches the user's vote tallies, the other user's decisions/pool,
  or the shared name list (FR-005).

### `resetAll(): Promise<ActionResult>` — NEW

One pipeline `DEL` of all three per-user keys above (FR-006's single
combined action). Session/failure/success shapes identical to
`resetVotes`. Semantically equivalent to the two individual resets, issued
as one action (one confirmation, one round trip).

## Store (`lib/reset-store.ts`) — NEW (server-only)

```ts
import "server-only";

/** The exact keys the given reset variant deletes, in pipeline order. */
export function resetTargets(
  uid: string,
  variant: "votes" | "nominations" | "all"
): string[];
// Pure: throws on invalid uid shape (assertUid/isUserIdShape — same guard
// as userScoresKey/nominationKey). Deterministic order: scores, seen,
// nominations (tests pin this).

export async function deleteUserVotes(uid: string): Promise<void>;
// Pipeline DEL of resetTargets(uid, "votes"). Throws on Upstash failure
// (the action maps it to ActionResult).

export async function deleteUserNominations(uid: string): Promise<void>;
// DEL of nominationKey(uid). Throws on Upstash failure.

export async function deleteUserEverything(uid: string): Promise<void>;
// One pipeline DEL of resetTargets(uid, "all"). Throws on Upstash failure.
```

- Key strings are composed from the EXISTING exported key builders
  (`userScoresKey`, `userSeenKey`, `nominationKey`) — no duplicated key
  formats, no new key shapes.
- Storage mock seam: the existing `_setClientForTests`/fake-client pattern
  applies unchanged (integration tests inject the fake Redis the same way
  006/013 do).

## Client Component (`app/reset-controls.tsx`) — NEW

```ts
interface ResetControlsProps {
  /** Which reset(s) to offer: vote screen → "votes" | "all";
   *  nomination screen → "nominations". */
  variant: "votes" | "nominations" | "all";
}
```

Behavior contract:
- Renders one neutral button per offered action ("Stimmen zurücksetzen",
  "Nominierungen zurücksetzen", "Alles zurücksetzen").
- First tap on any of them swaps that control into a two-step inline
  confirm state: "Wirklich löschen? Endgültig, ohne Widerruf." with
  confirm ("Ja, löschen") and cancel ("Abbrechen") — research R3 (FR-007).
  Cancel returns to neutral; confirm dispatches the corresponding action.
- Only the confirm tap dispatches; the action is NOT retry-looped (a
  reset is idempotent — a failed attempt surfaces the action's error copy
  inline and the control returns to neutral for an explicit retry).
- On `{ ok: true }`: reset local confirm state and call
  `router.refresh()` (research R4) — the gate re-derives the phase from
  storage. In the nomination screen this re-renders into the fresh round;
  in the vote screen the pair area re-renders with empty tallies.
- While a reset is in flight: confirm button disabled (double-tap safe;
  FR-009's repeated-reset edge case is a no-op server-side anyway).

## Mount Points (MODIFIED, additive only)

- `app/vote-client.tsx`: renders `<ResetControls variant="all" />` (which
  offers both "votes" and "all") below the pair area — "votes" and "all"
  are both available where votes exist (FR-001, FR-006).
- `app/nominate-client.tsx`: renders `<ResetControls variant="nominations" />`
  — on the nomination screen only the nominations reset is offered (a
  fresh round has no votes to reset; FR-005 keeps it that way).
