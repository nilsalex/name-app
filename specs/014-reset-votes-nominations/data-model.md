# Data Model: Reset Votes and Nominations (014)

Date: 2026-11-03. Extends the 005/006/013 data model; **zero new keys,
zero modified key shapes**. Everything here is Upstash Redis via the REST
client. This feature's entire storage surface is DELETION of existing
per-user keys.

## Storage Layout (existing keys, unchanged shapes)

| Key | Type | Written by | Reset action |
|---|---|---|---|
| `<prefix>:user:<uid>:scores` | sorted set (member = name, score = personal wins) | `recordVote` pipeline (006) | votes reset, all reset |
| `<prefix>:user:<uid>:seen` | sorted set (member = name, score = seen count) | `bumpUserSeen` (006, refill path only) | votes reset, all reset |
| `<prefix>:user:<uid>:nominations` | hash (field = name, value = `"in" \| "out"`) | `setNomination` (013) | nominations reset, all reset |

**Never touched by any reset** (shared/historical/other-user data):

- `<prefix>:scores` (global tally), `<prefix>:votes` (audit stream)
- `<prefix>:user:<other-uid>:*` (the other user's keys)
- The shared name list (`COLOGNE_200_BOY_NAMES`, static code — not stored)

## New Entities

### ResetTargets (derived, pure)

Per user, which keys a reset action deletes. Pure function of the variant
(`"votes" | "nominations" | "all"`); no stored state anywhere.

```text
resetTargets("votes")        → [userScoresKey(uid), userSeenKey(uid)]
resetTargets("nominations")  → [nominationKey(uid)]
resetTargets("all")          → [userScoresKey(uid), userSeenKey(uid),
                                nominationKey(uid)]
```

- **Validation**: uid must be session-derived (`getCurrentUid()`); the
  existing `assertUid`/`isUserIdShape` guard applies to every key
  derivation (same rule as 006/013 key builders).
- DEL on a non-existent key is a no-op in Redis — resets with "nothing to
  reset" (FR-009) need no existence checks.

## State Transitions

### Per-user phase machine (unchanged mechanics; reset is just deletion)

```text
                        ┌── reset votes (DEL scores+seen) ──► vote phase,
  vote phase ───────────┤        tally = empty → neutral bottom rank,
                        │        drafting uniform again (013 gate: round
                        │        still complete → VoteClient)
                        │
                        ├── reset nominations (DEL nominations hash) ──►
                        │        gate reads 0 decisions → !complete →
                        │        NominateClient, fresh round, "0 von 200"
                        │        (votes tally untouched — separate keys)
                        │
                        └── reset all (DEL all three) ──► fresh nomination
                                 round with empty tallies
```

- Every transition is DERIVED by the existing gate on the next render —
  no phase state is stored or invalidated (research R4).
- In-flight sender items (R5): a vote/decision dispatched before a reset
  may commit after it; it then simply exists as new data. Accepted posture.

## Derived User-Visible Consequences (no code beyond deletion)

| After reset | Ranking | Pair drafting | Nomination gate |
|---|---|---|---|
| votes | neutral bottom rank for all 200 names (empty personal tally) | uniform (empty seen map) | unchanged (round still complete) |
| nominations | unchanged (tally intact) | unchanged | fresh round, all 200 undecided |
| all | neutral bottom rank | uniform | fresh round, all 200 undecided |

## Validation Rules (from requirements)

1. Every reset key derivation validates the uid (`isUserIdShape`) — throws
   on non-user-id shapes (same rule as `userScoresKey`/`nominationKey`).
2. Only the three per-user keys above are ever deleted; the deletion list
   is a pure function of the variant — no dynamic key discovery, no SCAN.
3. Session check identical to `submitVote`/`setNomination`: uid from
   `getCurrentUid()` only; signed-out → `{ ok: false, error: "Abgelaufen —
   bitte neu anmelden." }`.
4. Destructive confirmation happens client-side BEFORE the action is
   dispatched (FR-007); the server action itself performs no further
   confirmation (server cannot distinguish taps).
5. Upstash failure → `{ ok: false, error: "Zurücksetzen fehlgeschlagen —
   bitte nochmal versuchen." }`; partial pipeline failure leaves the
   pipeline's atomicity semantics (all commands commit together or
   neither — same batching contract as `recordVote`).
