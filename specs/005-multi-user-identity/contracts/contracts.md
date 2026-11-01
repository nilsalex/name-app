# Contracts: Gmail Login (004)

Date: 2026-11-02. The app exposes three surfaces: server actions (the trust
boundary), the login UI contract, and environment configuration. Upstash
storage keys and the vote-record shape are deliberately NOT part of this
contract — they are unchanged (see data-model.md).

## 1. Server Actions (`app/actions.ts`)

### `signIn(idToken: string): Promise<SignInResult>`

Verifies a Google ID token and, on success, sets the session cookie.

```ts
type SignInResult =
  | { ok: true; alias: "A" | "B" }
  | { ok: false; reason: "invalid-token" | "not-approved" | "server-config" };
```

Behavior:
- `invalid-token`: missing/malformed token, failed tokeninfo verification
  (wrong `aud`, unverified email, expired) — no cookie is set.
- `not-approved`: token verifies but the email is not one of the two
  approved secret addresses — no cookie is set (friendly denial in UI).
- `server-config`: auth env vars missing/malformed — no cookie is set.
- Success: cookie `namewahl_session` set with the attributes from
  data-model.md; returns the alias so the UI can confirm who is signed in
  (alias only — never the email, FR-008).

### `signOut(): Promise<{ ok: true }>`

Deletes the session cookie. Idempotent: succeeds even without a session.

### `submitVote(winner: string, loser: string): Promise<VoteResult>`  *(signature changes)*

- BEFORE (003): `submitVote(winner, loser, user)` — client-supplied alias.
- AFTER (004): the `user` argument is **removed**. The action derives the
  alias from the session cookie.
- Unauthenticated/expired session → `{ ok: false; reason: "unauthenticated" }`
  and **no write of any kind** (integration-tested).
- Authenticated → identical behavior to 003 (reserve-aware dedupe of the
  current pair, atomic pipeline write) with `user = session.alias`.
- `winner === loser` remains rejected (existing rule, unchanged).

### `nextPair(current?: { winner: string; loser: string } | null)` (unchanged)

Reads scores and draws the next pair. Public page data; no session
required for ranking/winners pages.

## 2. UI Contract

### Entry route `/` (session gate)

- Static shell + `<Suspense>` boundary. Inside the boundary:
  - **Valid session** → `<VoteClient alias={session.alias} />`
  - **No/expired session** → `<LoginClient />`
- Ranking (`/ranking`) and winners (`/winners`) stay public and untouched.

### `LoginClient` (new client component)

- Renders the Google sign-in button (GIS, `data-client_id = GOOGLE_CLIENT_ID`).
- On Google credential callback: calls `signIn(idToken)`.
  - `ok` → `router.refresh()` swaps in the vote screen.
  - `not-approved` → friendly German denial message, stays on login.
  - `invalid-token` / `server-config` → generic "Anmeldung fehlgeschlagen"
    message, stays on login.
- The client receives only `GOOGLE_CLIENT_ID` (public by design, passed as
  a prop from the server); approved emails and `SESSION_SECRET` are never
  sent to the browser.

### `VoteClient` (modified)

- New required prop `alias: "A" | "B"` (replaces the localStorage picker).
- Adds a sign-out control calling `signOut()` then `router.refresh()`.
- Everything else (pair reserve, instant swap, failure notice) unchanged.

## 3. Environment Configuration Contract (secrets, never committed)

| Variable                  | Used by           | Rule                                            |
|---------------------------|-------------------|-------------------------------------------------|
| `GOOGLE_CLIENT_ID`        | GIS button + aud  | OAuth client ID for the deployed origin          |
| `APPROVED_USER_A_EMAIL`   | allowlist + map   | Gmail address mapped to alias "A"                |
| `APPROVED_USER_B_EMAIL`   | allowlist + map   | Gmail address mapped to alias "B"; must differ from A |
| `SESSION_SECRET`          | session HMAC      | ≥ 32 random bytes                                |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | existing | unchanged |

Fail-fast: first access to any missing/malformed variable throws a clear
error (same pattern as `lib/env.ts`); `server-config` sign-in result maps
to this case. Locally: `.env.local`; production: Vercel project env vars.

## 4. Module Contracts (new `lib/` modules, all server-only)

```ts
// lib/session.ts
type Alias = "A" | "B";
type SessionPayload = { alias: Alias; iat: number };
interface SessionDeps { secret?: string; now?: () => number }
sealSession(payload: SessionPayload, deps?: SessionDeps): string;
verifySession(cookieValue: string | undefined, deps?: SessionDeps): SessionPayload | null;
SESSION_COOKIE_NAME: "namewahl_session";
SESSION_MAX_AGE_SECONDS: 30 * 24 * 60 * 60;
getCurrentAlias(): Promise<Alias | null>;   // reads cookies() via next/headers

// lib/google-verify.ts
interface GoogleTokenClaims { aud: string; email?: string; email_verified?: string; exp: number }
interface VerifyDeps {
  clientId?: string;                 // default: env
  fetchTokenInfo?: typeof fetch;     // injected for tests
  now?: () => number;
}
verifyGoogleIdToken(idToken: string, deps?: VerifyDeps):
  Promise<{ ok: true; email: string } | { ok: false; reason: "invalid-token" | "server-config" }>;

// lib/users.ts  (replaces lib/user.ts)
interface UsersEnv { APPROVED_USER_A_EMAIL?: string; APPROVED_USER_B_EMAIL?: string }
aliasForEmail(email: string, env?: UsersEnv): "A" | "B" | null;  // null = not approved
assertAuthConfigured(): void;  // fail-fast on missing/malformed secret config
```

## 5. Test Requirements (from spec SCs; see quickstart.md for live scenarios)

- **Unit** — session: seal/verify round-trip; tampered payload rejected;
  expired (>30d) rejected; malformed value rejected.
- **Unit** — google-verify (injected fake fetch): happy path; wrong `aud`;
  `email_verified !== "true"`; expired; tokeninfo error/malformed response.
- **Unit** — users: mapping A and B; case-insensitive/trimmed match;
  unknown email → null; missing config → throws.
- **Integration** — `submitVote` with no session returns
  `{ ok: false, reason: "unauthenticated" }` and issues **zero** Upstash
  writes (fake-Upstash harness, same pattern as store.test.ts).
- Build gate: `next build` must pass with `cacheComponents: true`
  (session read behind Suspense; no `cookies()` in prerender paths).
