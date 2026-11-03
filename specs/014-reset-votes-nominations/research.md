# Research: Reset Votes and Nominations (014)

Date: 2026-11-03. Resolves every design question the spec left open at the
implementation level. Format per existing feature research files.

## R1 — What does "reset votes" delete, concretely?

**Decision**: Resetting votes deletes the signed-in user's TWO per-user
tally keys in one pipeline:

- `<prefix>:user:<uid>:scores` (personal win tally — the ranking source, 006)
- `<prefix>:user:<uid>:seen` (personal seen-frequency — drafting input, 006)

The global `<prefix>:scores` zset and the `<prefix>:votes` audit stream are
NEVER touched (they are shared and/or historical; the spec's per-user scope
clarification and FR-005 forbid touching anything but the user's own
entries, and the global zset is read by no user-facing view since 006).

Seen-frequency is included in "votes" because it exists only as a function
of the user's own vote history (single writer: the batch/refill path,
006 R4); leaving it would keep a residue of the deleted votes — violating
FR-003's "no residue" intent and silently biasing future pair drafting.

**Rationale**: Ranking (from `:scores`) and drafting frequency (from
`:seen`) are the two user-visible consequences of votes (spec 006). Both
are per-user keys; deleting both makes "my votes" fully gone in one
request-batched pipeline, after which `rankNames` yields the neutral
bottom rank everywhere and drafting restarts uniform — exactly the spec's
clean state. No new storage shape, no scanning, no per-vote work.

**Alternatives considered**:
- *Also delete the global zset / audit stream*: shared + historical data;
  would break the other user's nothing (they don't read it) but destroys
  history irrecoverably and exceeds per-user scope. Rejected (FR-005,
  spec Assumptions).
- *Only delete `:scores`, keep `:seen`*: leaves drafting biased by deleted
  history — a residue (FR-003). Rejected.
- *Per-vote XDEL on the audit stream*: granular, O(votes), pointless — the
  stream is audit-only and shared. Rejected (Principle V).

## R2 — What does "reset nominations" delete, and what happens after?

**Decision**: Resetting nominations deletes the signed-in user's ONE
per-user key:

- `<prefix>:user:<uid>:nominations` (the 013 decisions hash)

Consequence (zero extra code): on the next render the existing 013 gate
reads the hash, finds zero decisions → `!complete` → renders
`NominateClient` at the first canonical-list name — a fresh nomination
round over all 200 names. The user's votes (win tally / seen zsets) are
NOT deleted by a nominations reset (FR-005 analog): they are separate keys.
The other user's decisions, pool, and votes are different keys entirely —
untouched by construction.

**Rationale**: The 013 design derives round state entirely from the hash
(research 013 R1), so deletion alone produces the fresh-round state — no
state machine to reset, no cursor to rewind. This is the payoff of
derived state.

**Alternatives considered**:
- *Also cascade-delete the user's votes*: the spec (clarified) says
  resetting nominations only resets nomination decisions; votes live in
  independent keys and vote tallies remain meaningful even if the user
  re-nominates differently. Rejected (over-deletion).
- *Write an explicit "round reset" marker instead of deleting*: extra
  state that duplicates what derived state already gives. Rejected
  (Principle V).

## R3 — How is the destructive action guarded (FR-007)?

**Decision**: Two-step inline confirmation in the new
`app/reset-controls.tsx` client component: the control renders a neutral
button ("Stimmen zurücksetzen" / "Nominierungen zurücksetzen" / "Alles
zurücksetzen" depending on variant); on first tap it swaps to an explicit
confirm state ("Wirklich löschen? …" with confirm/cancel), with a visible
hint that the deletion is permanent. Only the confirm tap dispatches the
reset. No browser `confirm()` dialog (jarring on mobile, inconsistent
with the app's inline notice patterns) and no extra route/screen.

**Rationale**: FR-007 requires confirmation "or otherwise clearly signal
irreversibility" — the two-step inline pattern does both, is the simplest
client-only mechanism (a boolean state), and matches the toy app's
existing CSS-Modules + button styling. A modal library would be a new
dependency (constitution V violation for zero gain).

**Alternatives considered**:
- *Window.confirm()*: one line, but ugly/inconsistent and hard to test in
  the visual harness. Rejected.
- *No confirmation, only label warning*: fails the spirit of FR-007 for a
  permanent, whole-tally deletion. Rejected.

## R4 — How does the UI reflect the post-reset state (FR-008)?

**Decision**: After the reset action resolves `{ ok: true }`, the reset
controls call `router.refresh()` — the identical mechanism the existing
sign-out button uses (`vote-client.tsx`). The server gate re-reads the
session, nomination hash, and (on the ranking/winners pages, on next
visit) the tally keys, so every view — for BOTH users — shows post-reset
state on their next view/refresh with no extra invalidation code.

Client-side, the component resets its own local state (confirmation
collapsed back to neutral). In the nominations variant the parent
`NominateClient` re-renders from the refreshed server state.

**Rationale**: FR-008's "all users on their next view" is already
guaranteed by the 013 architecture: every page is a server component
reading storage per request under `cacheComponents`. `router.refresh()`
covers the *acting* user immediately; the other user's next view is
server-derived by construction. No polling, no broadcast channel, no
cache-busting keys (Principle V).

**Alternatives considered**:
- *Client-side optimistic wipe of local tallies/pools*: duplicates what
  the refresh gives, risks desync with the sender queue's in-flight
  writes. Rejected.
- *Realtime invalidation (SSE/polling) so the other user updates without
  interaction*: over-engineering for 2 users; FR-008 explicitly scopes to
  "next view". Rejected.

## R5 — Interaction with in-flight vote/decision senders

**Decision**: No sender changes. The fire-and-forget senders
(`lib/vote-sender.ts`) keep retrying whatever was dispatched before the
reset; a late-retrying vote re-recorded after a votes-reset simply counts
again (it is a new tally entry, not a resurrection of a deleted one). The
spec's edge case ("one user resets while the other is actively voting")
already accepts this posture, and the acting user's refreshed view shows
whatever is then stored — server state is the source of truth (006
research posture).

**Rationale**: The senders are at-most-once per *dispatch record*; a
post-reset successful retry is indistinguishable from a fresh vote and
keeps the audit stream honest. Adding reset-awareness to the queue would
couple two independent modules for a two-user toy app (Principle V).

**Alternatives considered**:
- *Flush/cancel pending queue items on reset*: extra coupling, edge-case
  semantics (which items? already-in-flight?), no user-visible benefit.
  Rejected.

## R6 — Where do the reset controls live?

**Decision**: One shared client component `app/reset-controls.tsx` with a
`variant` prop: `"votes"` (mounted in `VoteClient` footer area), `"nominations"` (mounted in `NominateClient`), and `"all"` (offered alongside
`"votes"` on the vote screen — FR-006's single combined action). The
nomination screen mounts the `"nominations"` variant only (votes there are
empty by definition — a fresh round — and FR-005 forbids a nominations
reset from touching votes anyway).

**Rationale**: Three actions, one confirmation mechanism, one styling
block. Splitting per screen would duplicate the confirm logic; a single
component with variants is the smallest shared surface.

**Alternatives considered**:
- *Separate pages (`/reset`)*: extra route + navigation for a rare
  destructive action. Rejected.
- *Only an "everything" button*: fails FR-001/FR-002's individually
  available resets. Rejected.
