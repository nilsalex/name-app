# Research: Gmail Login (004)

Date: 2026-11-02. Resolves every NEEDS CLARIFICATION from Technical Context
and every technology choice flagged in the plan workflow. Constraints per
constitution: toy app, exactly two users, simplicity paramount, free-plan
only, no new dependencies without PR justification.

## R1: How does the browser sign in with Google — OAuth redirect flow or Google Identity Services (GIS) button?

**Decision**: Google Identity Services (GIS) one-tap/button flow: load
`https://accounts.google.com/gsi/client` via `<Script>`, render
`<div class="g_id_signin">`; Google returns a **Google ID token (JWT)** to a
JS callback; the token is POSTed to a `signIn` server action.

**Rationale**: No redirect round-trip, no callback route, no server-side
session store for the flow, and no state/PKCE bookkeeping — the smallest
possible surface for two users. The client never sees anything but the
token; all verification and allowlisting happens server-side. Config is one
`GOOGLE_CLIENT_ID` env var + one authorized JavaScript origin in Google
Cloud Console.

**Alternatives considered**:
- *Full OAuth 2.0 code flow with Auth.js (next-auth)* — robust and standard,
  but adds 2+ npm dependencies, a catch-all route handler, secret-rotation
  and session-store concerns, and concepts (adapters, providers config) that
  exist for apps with many users/providers. Rejected per Principle V.
- *Hand-rolled OAuth redirect flow* — more moving parts (state parameter,
  code exchange) than GIS for the same result. Rejected.
- *Email magic link* — requires an email-sending service (paid tiers, spam
  risk, delay). Rejected on free-plan and UX grounds.

## R2: How is the Google ID token verified server-side?

**Decision**: `POST`/`GET https://oauth2.googleapis.com/tokeninfo?id_token=...`
from a server action. Verify all of: `aud === GOOGLE_CLIENT_ID`,
`email` is one of the two approved secrets (case-insensitive, trimmed),
`email_verified === "true"`, `exp` in the future. On any failure the sign-in
is rejected and no session is created.

**Rationale**: This is Google's documented lightweight verification path;
no JWT/signature library needed because Google itself confirms the token's
validity. One HTTPS call happens only at sign-in (rare), so latency and free-
plan budget are irrelevant. `aud` + `email_verified` checks follow Google's
["Sign in with Google" backend auth](https://developers.google.com/identity/gsi/web/guides/verify-the-id-token)
guidance. The tokeninfo call is injected as a `fetch`-taking function so the
accept/reject logic is unit-testable without network.

**Alternatives considered**:
- *Local JWT signature verification with `jose`* — avoids the network call
  but adds a dependency and JWKS-fetch/caching logic; strictly more
  complexity for one call per login. Rejected.
- *Trusting the token client-side* — violates FR-003/FR-004 (server must
  verify) and the bundled Next.js auth guide's rule that security checks
  happen as close to the data source as possible. Rejected outright.

## R3: How is the session represented?

**Decision**: Stateless signed cookie, built with `node:crypto`
(`createHmac("sha256", SESSION_SECRET)` over `base64url(JSON payload)` +
`.` + signature). Payload: `{ alias: "A" | "B", iat: number }`. Cookie:
name `namewahl_session`, `httpOnly: true`, `secure: production`,
`sameSite: "lax"`, `maxAge` = 30 days, `path: "/"`. Sign-out deletes the
cookie (`cookies().delete`).

**Rationale**: This is exactly the "stateless sessions" pattern from the
pinned Next.js auth guide (env secret, sign/verify, `cookies()` API, the
recommended cookie flags) minus the recommended seal library — justified
because iron-session/jose would be the feature's only new dependencies and
our payload is two fixed fields with no encryption requirement (the alias
is not sensitive; FR-008 forbids storing emails anywhere, so there is no
PII in the session to protect beyond integrity). HMAC integrity is what
matters: the browser cannot mint or alter a session. Constant-time
signature comparison (`timingSafeEqual`). Session read goes behind a
`<Suspense>` boundary per the bundled Cache Components auth guide.

**Alternatives considered**:
- *iron-session / jose (seal + JWT)* — the guide's default, but 1–2 new npm
  packages for an identical security outcome at this scale. Rejected
  (Principle V); revisit if requirements grow (e.g., >2 users, DB sessions).
- *Redis-backed opaque session id* — a Upstash read on every request
  (free-tier request budget) and invalidation logic we don't need; sign-out
  simply deletes the cookie. Rejected.
- *localStorage session* — not readable server-side; server actions could
  not derive the alias; fails FR-007 sign-out semantics. Rejected.
- *JWT without a library, hand-rolled header/payload/signature* — same
  crypto work as our seal but with base64 claims; HMAC seal is simpler and
  typed in ~30 lines.

## R4: Where do the two approved addresses and the alias mapping live?

**Decision**: Four server-side environment variables (per clarified spec:
secret env config, never committed):
`GOOGLE_CLIENT_ID` (audience check + GIS button),
`APPROVED_USER_A_EMAIL`, `APPROVED_USER_B_EMAIL` (allowlist **and** alias
mapping in one place), `SESSION_SECRET` (HMAC key, ≥32 bytes). Missing or
malformed config fails fast at first access with a clear error, like the
existing `lib/env.ts` pattern. Locally in `.env.local`; in production via
Vercel project environment variables.

**Rationale**: The user confirmed the addresses are environment secrets.
One variable per alias *is* the explicit editable mapping — no parsing
format, no ambiguity about which address maps to which alias, and changing
a mapping is a one-line secret edit. Non-`NEXT_PUBLIC_` vars never reach the
browser bundle (pinned Next.js env-vars guide).

**Alternatives considered**:
- *Committed config file with the addresses* — violates the clarified FR-004
  (secrets never committed). Rejected.
- *Single `APPROVED_EMAILS=a@x: A, b@y: B` string* — needs a parse format
  and error states for nothing. Rejected.
- *Database lookup* — no accounts table exists; overkill. Rejected.

## R5: How does the session interact with Cache Components (`cacheComponents: true`)?

**Decision**: Follow the bundled `authentication-with-cache-components.md`
guide. `app/page.tsx` remains a static shell; the session-dependent content
is a small server component wrapped in `<Suspense>` that calls
`getCurrentUser()` (which reads the cookie at request time). Logged-in →
render `<VoteClient alias={...}/>`; not logged-in → render
`<LoginClient/>`. No `use cache: private` needed — the session read is one
cheap HMAC verify; we do not cache session-derived data (ranking/winners
pages don't read the session at all and stay untouched/cached).

**Rationale**: With Cache Components, a `cookies()` read outside a Suspense
boundary is a build error; the guide's Step 1/2 pattern is the documented
way to stream authenticated UI without blocking the static shell. Vote
content is inherently per-session, so there is nothing to cache behind the
boundary.

**Alternatives considered**:
- *`use cache: private` around the session read* — buys prefetchability for
  the vote screen, but the vote screen already fetches live data on mount;
  the added directive complexity has no UX payoff here. Rejected (documented
  as a follow-up optimization if vote-screen navigation ever feels slow).
- *Proxy/middleware route gate* — with a single protected route, a
  page-level Suspense gate is simpler; the server action remains the real
  authorization boundary. Rejected.

## R6: What replaces `lib/user.ts` and how does voting attribution work?

**Decision**: Delete `lib/user.ts` (localStorage identity picker) and its
usage. Identity source of truth = session cookie → alias. `VoteClient`
receives `alias: "A" | "B"` as a prop from the server component.
`submitVote` server action signature changes from
`submitVote(winner, loser, user)` to `submitVote(winner, loser)` and
derives `user` from the session; an unauthenticated call returns an error
result instead of writing. `store.recordVote` / `VoteRecord` and all
Upstash keys are untouched — attribution bytes ("A"/"B") are identical, so
FR-005/SC-006 hold by construction.

**Rationale**: Centralizes the trust boundary in one place (DAL pattern);
the client literally cannot attribute votes to the other person. Keeps the
audit stream and ranking math byte-compatible.

**Alternatives considered**:
- *Keep client-sent `user` but validate against session* — defends in
  depth but keeps an attack surface that must be remembered at every call
  site. Rejected in favor of removing the parameter entirely.
- *Store email in vote records* — explicitly forbidden (FR-008). Rejected.

## R7: What happens on sign-out and for non-approved accounts?

**Decision**: Sign-out = server action deleting the session cookie; the
vote screen then shows the login screen on next render (client redirects to
`/` or the component swap happens via router refresh). A Google account
whose verified address is not on the allowlist gets no session and a
friendly denial message ("Diese Adresse ist nicht freigeschaltet.") from the
`LoginClient`. No lockout counter, no logging (toy app).

**Rationale**: Directly implements FR-007 and the clarified spec's
allowlist story with the least code.

**Alternatives considered**: None with materially different outcomes.

## R8: Testing strategy for auth code without Google or Vercel?

**Decision**: Pure modules take injected dependencies:
- `lib/session.ts`: `seal/verify` accept `now` and `secret` params
  (defaults from env) → unit tests cover round-trip, tamper, expiry
  (fake timers not needed; explicit timestamps).
- `lib/google-verify.ts`: accepts a `fetchTokenInfo` function → unit tests
  cover happy path, wrong `aud`, unverified email, unknown email, expired
  token, malformed tokeninfo response.
- `lib/users.ts`: accepts an `env` record → unit tests cover mapping,
  case-insensitivity, fail-fast errors.
- Integration: one test proving an unauthenticated `submitVote` writes
  nothing (session absent → error result), using the same fake-Upstash
  harness pattern as `tests/integration/store.test.ts`.

Google's live button and real cookie flow are validated via `quickstart.md`
V1/V2 in the user's environment (credentials present there); no live E2E
here, same as feature 003.

**Rationale**: Matches the constitution's proportionate test-first rule and
the established 003 test idioms.

**Alternatives considered**: Playwright E2E of the real Google flow —
impossible without real credentials in CI and overkill for two users. Rejected.
