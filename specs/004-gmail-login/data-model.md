# Data Model: Gmail Login (004)

Date: 2026-11-02. Existing entities from 003 are listed only where this
feature touches them. Source of truth for behavior: [spec.md](./spec.md).

## Entities

### Session (NEW)

Stateless signed cookie; no server-side record exists.

| Field  | Type           | Description                                              |
|--------|----------------|----------------------------------------------------------|
| `alias`| `"A" \| "B"`   | Existing identity the signed-in address maps to (R6)     |
| `iat`  | `number`       | Issue time, epoch ms                                     |

Validation rules:
- Cookie value format: `base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson, SESSION_SECRET))`
- `verify` rejects: malformed value, HMAC mismatch (compared with `timingSafeEqual`), unknown JSON shape, `alias` not in {A,B}, age > 30 days.
- Cookie attributes: `httpOnly`, `secure` (production), `sameSite=lax`, `maxAge=30d`, `path=/`, name `namewahl_session`.

State transitions:
- *absent* → *valid*: successful `signIn` (token verified + address approved) sets cookie.
- *valid* → *absent*: `signOut` deletes cookie; expired/tampered cookies are treated as absent.
- No refresh/renewal: a 30-day-old session simply expires (re-login). Two users, toy app.

### ApprovedAddress (NEW, configuration only — not stored)

| Field    | Type                 | Description                                     |
|----------|----------------------|-------------------------------------------------|
| `email`  | `string`             | Gmail address, compared case-insensitively, trimmed |
| `alias`  | `"A" \| "B"`         | Fixed mapping, derived from variable suffix     |

Validation rules (fail fast at first access, mirroring `lib/env.ts`):
- `GOOGLE_CLIENT_ID`, `APPROVED_USER_A_EMAIL`, `APPROVED_USER_B_EMAIL`, `SESSION_SECRET` (≥ 32 bytes) must all be non-empty.
- The two approved emails must differ from each other.
- Values are read from environment only; never committed; never logged; never persisted anywhere (FR-008).

### GoogleIdToken (NEW, transient — verified then discarded)

| Field            | Type      | Checked against                     |
|------------------|-----------|-------------------------------------|
| `aud`            | `string`  | `GOOGLE_CLIENT_ID`                  |
| `email`          | `string`  | approved-address set (case-insensitive) |
| `email_verified` | `"true"`  | must be `"true"`                    |
| `exp`            | `number`  | must be in the future at verify time |

Not stored in any form after sign-in completes.

### VoteRecord (EXISTING, unchanged)

`{ winner: string, loser: string, user: "A" | "B", at: ISO string }` —
`user` now originates exclusively from the session alias instead of client
input. Shape, stream key `namewahl:votes`, and score key `namewahl:scores`
are byte-identical (FR-005, SC-006).

## Relationships

- `Session.alias` → references the *conceptual* User identity ("A"/"B") that `VoteRecord.user` and alias-based scoring already use. No foreign keys exist (Redis); the invariant is that alias values come only from the fixed set {A, B}.
- `ApprovedAddress.email` —1:1→ `alias` (enforced by the two-variable config shape).

## Deletions

- `lib/user.ts` (`getCurrentUser`, `setCurrentUser`, `USER_IDS`,
  `UserId` local-storage picker) is removed. `UserId` type equivalent
  (`"A" | "B"`) lives on as `Alias` in the new session module; every
  former consumer reads identity from the session instead.
