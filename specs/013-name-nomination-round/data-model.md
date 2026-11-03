# Data Model: Name Nomination Round (013)

Date: 2026-11-03. Extends the 005/006 data model; all existing keys/records
keep their shape. Everything here is Upstash Redis via the REST client.

## New Entities

### NominationDecisions (hash `namewahl:user:<uid>:nominations`)

One hash per internal user ID. The **source of truth** for that user's
nomination round, its progress, and their voting pool.

| Field | Type | Notes |
|---|---|---|
| field | string (name) | one entry per name the user has decided on; exactly the members of `COLOGNE_200_BOY_NAMES` (canonical list, no invented names — HSET only ever with a name from `names.ts`) |
| value | string `"in" \| "out"` | the user's final decision: `in` = include in voting, `out` = exclude |

- **Written**: `HSET` one field per decision, fire-and-forget from the
  nomination client via `setNomination` (R2). Idempotent: a retried write
  of the same (name, decision) is the same write (FR-011-safe). Fields are
  NEVER overwritten with a different value at runtime (decisions are
  final); the only writer is `setNomination`.
- **Read**: `HGETALL` by `getNomination`, once per `/` open (gate).
- **Validation**: uid must be session-derived (`getCurrentUid()`); the
  existing `assertUid` guard in `store.ts` applies unchanged to the new key
  builder `nominationKey(uid)`. `name` must be a canonical list member
  (same `isName` guard as `submitVote`).
- **Lifecycle**: created implicitly on the user's first decision; never
  deleted (toy app); orphans bounded by the approved-user list (same
  posture as the 006 per-user zsets).

### VotingPool (derived, not stored)

Per user, `pool = names of COLOGNE_200_BOY_NAMES whose hash value == "in"`,
in canonical list order. Derived by `getNomination` at gate time and
re-derived client-side after each decision. **Independent per user**
(FR-007) — the other user's hash is never read for it, no intersection is
computed anywhere.

- **Passed** to the vote screen as a prop (server → client, one shape:
  `readonly string[]`).
- **Constraints**: `complete = (decidedCount == 200)`; voting allowed only
  when `complete && pool.length >= 2` (FR-006/FR-008). Pool is NOT
  persisted as its own key (Principle V — trivially derivable, R1).

## Modified Entities

### VoteClient props (in-process, not persisted)

| Prop | Type | Notes |
|---|---|---|
| uid | string | unchanged (005) |
| label | string | unchanged (007) |
| pool | `readonly string[]` | NEW: the user's included names (R4). Passed into `refillReserve`/`pickUnderseenPair`. |

No change to vote records, score/seen zsets, sessions, or user records —
votes cast during the vote phase are exactly as before, they merely happen
to be drafted from a constrained pool.

## State Transitions

### Nomination Round (per user)

```text
(invisible) ──first decision──► in-progress ──decidedCount == 200──► complete
                                  │                                    │
                                  │ resume at canonical position       │ gate renders VoteClient
                                  ▼ (FR-005, derived per R1)           ▼ with pool
                             (persisted fields accumulate,             pool.length >= 2 → voting
                              HGETALL re-derives everything)           pool.length < 2 → locked
                                                                       message (FR-008), no voting
```

- Progress within `in-progress` is purely field count against 200
  (FR-012): no cursor, no stored position.
- The transition `in-progress → complete` needs no explicit write: it is
  the derived moment `decidedCount == 200`. The client swaps to the vote
  phase immediately (FR-009); subsequent `/` loads render the vote screen
  via the gate (FR-013).
- There is no "reset": fields are immutable once written (FR-011);
  re-nomination is out of scope per the spec's Assumptions.

## Validation Rules (from requirements)

1. HSET only with names from the canonical list (rejects `isName`-floor
   failures — same guard as `submitVote`).
2. Decision values restricted to `"in" | "out"` (discriminated union at
   the type level; runtime guard mirrors it).
3. uid from session only — `nominationKey` throws on non-user-id shapes
   (same pattern as `userScoresKey`).
4. Voting gated: `gate` renders `VoteClient` only when the round is
   complete; drafting constrained to the pool; <2 pool names → locked
   message (never a polling error, FR-008).
