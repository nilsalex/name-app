# Contracts: Multi-User Identity (005)

Date: 2026-11-02. Surfaces: server actions, UI, environment configuration,
module contracts, tests. Storage mechanics live in data-model.md.

## 1. Server Actions (`app/actions.ts`)

### `signIn(idToken: string): Promise<SignInResult>`

```ts
type SignInResult =
  | { ok: true; uid: string; label: string }   // label = "Person N"
  | { ok: false; reason: "invalid-token" | "not-approved" | "server-config" };
```

Behavior changes from 004:
- After token verification and approval, the email is resolved via
  `resolveUser(email)` (user-store read-or-create) instead of
  `aliasForEmail`.
- Success sets the session cookie with `{ uid, iat }` and returns the uid +
  neutral display label. The email is never returned (FR-008).
- `not-approved` fires *before* any user record is created — denial leaves
  no trace.

### `signOut(): Promise<{ ok: true }>` — unchanged (deletes the cookie).

### `submitVote(winner: string, loser: string): Promise<VoteResult>` — unchanged signature from 004; the recorded `user` value is now the session's `uid` instead of an alias. Unauthenticated → error, zero writes (unchanged rule).

### `getRanking` / `getScores` / `getWinners` — unchanged (aggregate by name, not by voter).

## 2. UI Contract

### Entry route `/` (session gate)

- Static shell + `<Suspense>` (unchanged mechanics).
- Valid session → `<VoteClient uid={session.uid} label={...} />`
- No/expired session → `<LoginClient clientId={...} />` (unchanged).

### `VoteClient` (modified props)

- Props change from `alias: "A" | "B"` to `uid: string, label: string`.
- The label appears only in the hint line ("…, Person 3?") and nowhere in
  storage; the `uid` is only used for the `VoteInput` shape (ignored
  server-side) — attribution is session-derived as in 004.

### `LoginClient` — unchanged (still posts the GIS credential to `signIn`).

## 3. Environment Configuration Contract (secrets, never committed)

| Variable             | Used by            | Rule                                              |
|----------------------|--------------------|---------------------------------------------------|
| `GOOGLE_CLIENT_ID`   | GIS button + aud   | unchanged from 004                                 |
| `APPROVED_EMAILS`    | allowlist          | comma-separated approved addresses; ≥ 1 address; parsed trim/lowercase/dedupe; **replaces** `APPROVED_USER_A_EMAIL`/`APPROVED_USER_B_EMAIL` |
| `SESSION_SECRET`     | session HMAC       | ≥ 32 random bytes (unchanged)                      |
| `UPSTASH_*`          | existing           | unchanged                                          |

Fail-fast on missing/empty list; `server-config` sign-in result covers it.
Operators: switching from 004's two vars to `APPROVED_EMAILS` is part of
deploy (quickstart.md).

## 4. Module Contracts

```ts
// lib/user-ids.ts  (NEW, pure)
generateUserId(): string;             // 22-char base64url from 16 random bytes
isUserIdShape(value: unknown): value is string;  // 1–64 base64url chars

// lib/users.ts  (REWRITTEN, pure)
parseApprovedEmails(raw: string | undefined): string[];  // normalized, deduped, ≥1 else throw
isApprovedEmail(email: string, approved: string[]): boolean;
assertAuthConfigured(): void;         // fail-fast: env parses to ≥1 address

// lib/user-store.ts  (NEW; Upstash-backed with injectable store interface)
interface UserRecord { id: string; num: number; createdAt: string }
interface UserStoreBackend {            // minimal surface for tests
  get(email: string): Promise<UserRecord | null>;
  put(email: string, record: UserRecord): Promise<void>;
  nextNumber(): Promise<number>;        // INCR counter
}
createUserStore(backend?: UserStoreBackend): {
  resolveUser(email: string): Promise<UserRecord>;  // read-or-create (research R3)
};
displayLabel(record: UserRecord): string;  // `Person ${num}`; "Person" if num missing

// lib/session.ts  (CHANGED payload)
type SessionPayload = { uid: string; iat: number };
sealSession / verifySession / getCurrentUid(): Promise<string | null>;
// constants SESSION_COOKIE_NAME / SESSION_MAX_AGE_SECONDS unchanged

// lib/store.ts  (CHANGED type only)
interface VoteRecord { winner: string; loser: string; user: string; at: string }
```

## 5. Test Requirements

- **Unit** — user-ids: format (22 base64url chars), uniqueness over N
  generations, independence from any input (no email derivation possible).
- **Unit** — users parsing: trim/case/dedupe; single address; empty/missing
  → throws; whitespace-only segments dropped.
- **Unit** — user-store (in-memory backend): first resolve creates with
  sequential `num`; second resolve returns the *same* id and number;
  different emails → different ids; label formatting; unapproved email
  never reaches the store (guard tested at the `signIn` level, research R7).
- **Unit** — session: `{ uid, iat }` round-trip; tamper/expiry rejection;
  legacy `{ alias }` payload rejected.
- **Integration** — unauthenticated `submitVote` still errors with zero
  store writes (re-validated against the new session shape).
- Build gate: `next build` passes with cacheComponents (unchanged).
- Live validation: quickstart.md V1–V5 (credentials required; deferred to
  the user's environment).
