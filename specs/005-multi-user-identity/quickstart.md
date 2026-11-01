# Quickstart: Multi-User Identity (005)

Validation guide. Automated tests cover the pure logic (contracts.md §5);
live scenarios need real secrets — run them in your environment.

## Prerequisites (operator migration from 004)

1. **Replace** the two per-alias variables with the new combined one in
   `.env.local` and Vercel (delete the old ones to avoid stale config):
   ```sh
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com   # unchanged
   APPROVED_EMAILS=person.a@gmail.com,person.b@gmail.com
   SESSION_SECRET=<openssl rand -base64 32>               # unchanged
   ```
   Adding a future user = append `,new.address@gmail.com` to
   `APPROVED_EMAILS` and redeploy. Nothing else.
2. `npm install && npm run dev`

## Automated checks (no credentials needed)

```sh
npm test          # unit suites (user-ids, users, user-store, session) + integration
npx tsc --noEmit
npm run build     # cacheComponents validation
```

## V1 — Approved user signs in; stable ID assigned (US1 + US2)

1. Fresh browser profile → login screen → sign in with an approved address.
2. Vote screen appears; hint shows a neutral label ("Person 1" or
   "Person 2" — first two sign-ins, order of first sign-in decides).
3. Vote a few times. In Upstash: `namewahl:votes` entries now carry a
   22-char opaque `user` id (e.g. `QkT9x2mR7pLw4vNs8JeD1A`) — **not** "A"/"B"
   and **not** an email. `namewahl:users` holds one hash field per signed-in
   address; `HGET` shows id/num/createdAt.
4. `/ranking` and `/winners` render exactly as before (they aggregate by
   name, not voter) — old "A"/"B" entries and new-ID entries coexist.

## V2 — ID stability across sign-outs, devices (US2)

1. Sign out, sign in again (same account) → same vote attribution id in new
   records; label identical ("Person 1" stays "Person 1").
2. Sign in on a second device/browser → same id, same label (identity is
   server-side, not browser-local).

## V3 — Non-approved account: denial, no record (US3)

1. Sign in with a Google account not in `APPROVED_EMAILS`.
2. Expected: "Diese Adresse ist nicht freigeschaltet." — and `namewahl:users`
   gains **no** hash field for that address (denial leaves no trace).

## V4 — Extend the approved list without code changes (FR-011, SC-006)

1. Append a third address to `APPROVED_EMAILS`, redeploy/restart.
2. Sign in with it → works, gets the next display number ("Person 3"), no
   errors for the existing two users, no data migration.

## V5 — One-time re-login after deploy (documented cost)

1. Immediately after deploying 005, a still-open 004 session (alias-shaped
   cookie) is rejected → login screen appears once.
2. After re-login everything works; this happens exactly once per browser.

## V6 — Operator fail-fast (FR-004 analog)

1. Set `APPROVED_EMAILS=` (empty) or remove it, restart, try to sign in.
2. Expected: sign-in fails with the generic `server-config` message; server
   log names the variable. Existing sessions/votes are unaffected.
