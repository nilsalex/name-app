# Contracts: Show the User's First Name (007)

Date: 2026-11-01. All contracts are internal TypeScript interfaces (server
actions + pure functions) — the app exposes no HTTP API beyond its own
routes and server actions. Existing 004/005/006 contracts are unchanged
except where noted. Reference: [data-model.md](../data-model.md),
[research.md](../research.md).

## Server Actions (`app/actions.ts`)

### `signIn(idToken): Promise<SignInResult>`

**CHANGED semantics (same return shape)**: the success branch gains a real
first name where the verified token provides one.

```ts
export type SignInResult =
  | { ok: true; uid: string; label: string }   // shape unchanged
  | { ok: false; reason: ...; detail?: string; stage?: string };  // unchanged
```

- `label` on success is the record's display label **including the newly
  captured `firstName`**: first sign-in of an approved address with a
  verified `given_name` (or `name` first word) returns that name.
- Signed-in-but-existing-record path: unchanged behavior — the existing
  record's stored fields win; no update happens (research R5 immutability).
- Failure branches (`invalid-token`, `not-approved`, `server-config`):
  byte-for-byte unchanged; no name data is included in any failure
  diagnostic (FR-008 lineage: name, like email, never enters logs or
  diagnostics).
- Cookie: unchanged (payload stays `{ uid, iat }`).

## Pure functions (`lib/user-store.ts`)

### `displayLabel(record: UserRecord): string`

**CHANGED precedence** (was `Person N`/`Person` only):

| Condition | Returns |
|---|---|
| `typeof record.firstName === "string" && record.firstName !== ""` | `record.firstName` |
| `typeof record.num === "number"` | `Person ${record.num}` |
| otherwise | `Person` |

Pure, synchronous, total — no side effects; safe to unit-test without a
store.

### `UserRecord` (exported interface)

**CHANGED**: gains optional `firstName?: string`. Presence ⇒ a verified,
trimmed, non-empty name captured at record creation. Absence ⇒ fall back
per the table above. Never `""`; never written after creation.

## Server identity resolution (`lib/user-store.ts`)

### `resolveUser` / `UserStore`

**CHANGED signature** (only the sign-in path calls it):

```ts
resolveUser(email: string, firstName?: string): Promise<UserRecord>;
```

- `firstName` is forwarded by `signIn` from the verified token claims.
- Creation branch: persists the passed name (when non-empty) into the
  new record. Existing-record branch: returns the stored record unchanged
  (the passed name is ignored — immutability, research R5).
- Return shape unchanged (`UserRecord`).

## Token verification (`lib/google-verify.ts`)

### `verifyGoogleIdToken(idToken, deps?): Promise<GoogleVerifyResult>`

**CHANGED success branch only**:

```ts
export type GoogleVerifyResult =
  | { ok: true; email: string; firstName?: string }   // firstName NEW
  | { ok: false; reason: "invalid-token" | "server-config"; stage?: ... };  // unchanged
```

- `firstName` derivation (research R3): tokeninfo `given_name` (trimmed,
  non-empty) → else first whitespace-separated word of tokeninfo `name`
  → else the property is absent from the success result.
- Failure branches untouched: no name data reaches failures.
- The extra fields consumed (`given_name`, `name`) are *hints* from the
  already-verified response; they never influence the ok/decision logic —
  a token with no name fields still verifies exactly as before (and the
  sign-in then persists a name-less record).

## Route/UI contract (`app/page.tsx` → `VoteClient`)

**Unchanged shape, changed value**: the server gate passes the same single
`label: string` prop it passes today. The rendered text position remains
the hint line ("Welcher Name gefällt dir besser, {label}?"); the string is
now the user's first name when their record carries one, else "Person N",
else "Person". `VoteClient`'s props interface needs no change.

## Explicitly unchanged contracts

- `submitVote`, `getRanking`, `getScores`, `getWinners`, `signOut`
  (no name interaction).
- Session payload, cookie name/max-age/signing.
- Storage keys and command budget (no new keys; `HSET` only as before).
- Environment variables (none added; no `GOOGLE_*` scope changes — the
  GIS flow already yields profile claims in `tokeninfo`).
