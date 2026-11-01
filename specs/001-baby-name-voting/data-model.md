# Data Model: Baby Name Voting

Entities from `specs/001-baby-name-voting/spec.md` (Key Entities section),
mapped to concrete storage and types.

## Entities

### Name

A German boy name from the Cologne 200 list.

| Field | Type | Rules |
|---|---|---|
| `name` | `string` | Non-empty; unique within the list; exactly 200 entries exist |

- Loaded from static data (`lib/names.ts`); never modified at runtime.
- Source-list position is implicit in array order (display tie-break order
  uses alphabetical order, so position is informational only).

### Vote

A single preference cast by one user for one name over another.

| Field | Type | Rules |
|---|---|---|
| `winner` | `string` | Must be a Name in the list; must differ from `loser` |
| `loser` | `string` | Must be a Name in the list; must differ from `winner` |
| `user` | `"A" \| "B"` | One of the two participants (FR-006, FR-010) |
| `at` | ISO timestamp | Set at vote time; ordering only, never edited |

- Immutable once recorded (FR-005). Failed submissions are never written
  (FR-012).
- Stored as one entry in the `votes` audit stream; the winner's score is
  also incremented in the `scores` sorted set (atomic `ZINCRBY`).

### User

One of exactly two participants.

| Field | Type | Rules |
|---|---|---|
| `id` | `"A" \| "B"` | Fixed set of two; chosen via pick-your-user prompt on first visit; persisted in browser local storage |

- No profile, credentials, or server-side user records exist.

### Ranking

A computed view over votes — **not** separately maintained state.

| Derived value | Rule |
|---|---|
| `score(name)` | Count of votes where `name` is the winner |
| `rank(name)` | 1 + number of distinct scores strictly greater than `name`'s score (shared ranks for ties; no tie-break rule — FR-014) |
| `order` | Score descending; within an equal score, alphabetical by name for stable display only |

## Storage Layout (Upstash Redis, single database)

| Key | Type | Contents |
|---|---|---|
| `scores` | sorted set | member = name, score = win count. 200 members, initially 0. |
| `votes` | stream | one entry per vote: `{ winner, loser, user, at }` |

**Concurrency**: score increments use `ZINCRBY` (atomic) and stream entries
are appended atomically — simultaneous votes from both users are both
recorded (SC-004).

**Volume**: 200 sorted-set members + a few thousand stream entries over
~2 months — negligible against Upstash free-tier limits (Free-Plan Budget).

## State Transitions

No entity has a lifecycle beyond creation:

- `Vote`: created on successful submission; never updated or deleted in v1.
- `scores` / `votes` keys: created lazily on first vote; only grow.
