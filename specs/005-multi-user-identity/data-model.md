# Data Model: Multi-User Identity (005)

Date: 2026-11-02. Only entities this feature creates or changes are listed.
Source of truth for behavior: [spec.md](./spec.md).

## Entities

### UserRecord (NEW, persisted)

Stored in the Redis hash `namewahl:users`, field = normalized email
(lowercased, trimmed). The email is the *lookup key at sign-in only* — it
never appears in vote records, sessions, or the UI (FR-008/FR-012).

| Field       | Type     | Description                                              |
|-------------|----------|----------------------------------------------------------|
| `id`        | `string` | Internal user ID: 22-char base64url from 16 random bytes (research R1). Opaque, app-generated, never email-derived (FR-004, FR-012). |
| `num`       | `number` | Sequential display number (1, 2, …) from counter `namewahl:users:nextnum`; powers the neutral "Person N" label (FR-008). |
| `createdAt` | `string` | ISO timestamp of first sign-in; operator info only, never displayed. |

Validation rules:
- `id` matches `^[A-Za-z0-9_-]{22}$` on creation; `verifySession` accepts 1–64 base64url chars for forward compatibility.
- `num` ≥ 1, assigned once at creation, immutable afterwards.
- One record per normalized email (hash-field uniqueness).

State transitions:
- *absent* → *created*: first approved sign-in (read-or-create, research R3).
- No updates after creation (id and num are immutable); no deletion flow.

### Session (CHANGED)

Payload changes from `{ alias: "A" | "B", iat }` (004) to:

| Field | Type     | Description                                  |
|-------|----------|----------------------------------------------|
| `uid` | `string` | The signed-in user's internal ID (UserRecord.id) |
| `iat` | `number` | Issue time, epoch ms                         |

Validation rules (unchanged mechanics from 004):
- Cookie format, HMAC integrity, `timingSafeEqual`, 30-day expiry, cookie attributes — all identical to 004 (data-model 004 "Session").
- `verify` now additionally rejects payloads whose `uid` is missing/not a base64url string — including legacy `{ alias }`-shaped payloads, which invalidate all 004 sessions (documented one-time re-login).

State transitions: unchanged (absent ↔ valid via signIn/signOut/expiry).

### ApprovedAddress (CHANGED, configuration only)

| Field   | Type     | Description                                   |
|---------|----------|-----------------------------------------------|
| `email` | `string` | Element of `APPROVED_EMAILS` (comma-separated secret env var), compared normalized |

Validation rules:
- `APPROVED_EMAILS` must parse to ≥ 1 non-empty address (fail fast otherwise).
- Duplicates collapse silently; case/whitespace-insensitive.
- Extendable by editing the env var only — no code change, no data migration (FR-011, SC-006).

### VoteRecord (CHANGED value domain, unchanged shape)

`{ winner: string, loser: string, user: string, at: ISO string }`

- `user` widens from `"A" | "B"` to `string` (internal user IDs going forward).
- Legacy stream entries with `user: "A"` / `"B"` remain verbatim; no migration (spec edge case + research R5: historical identities are not merged).
- Stream key `namewahl:votes`, zset `namewahl:scores` unchanged.

## Relationships

- `Session.uid` → `UserRecord.id` (1:1; the session is only issued for a resolved record).
- `UserRecord` → vote records: implicit by `id` equality in `VoteRecord.user`; no FK enforcement (Redis).
- `VoteRecord.user` (legacy) → old alias identities "A"/"B" — no UserRecord exists or will be created for them.

## New Redis Keys

| Key                       | Type    | Content                                |
|---------------------------|---------|----------------------------------------|
| `namewahl:users`          | hash    | normalized email → UserRecord JSON     |
| `namewahl:users:nextnum`  | string  | INCR counter for display numbers       |

## Deletions

- Env vars `APPROVED_USER_A_EMAIL` / `APPROVED_USER_B_EMAIL` and the
  `aliasForEmail` mapping (replaced by `APPROVED_EMAILS` parsing).
- `Alias` type in `lib/session.ts` (superseded by opaque `uid`).
