# Quickstart: Gmail Login (004)

Validation guide. Automated tests cover the pure logic (see contracts.md §5);
these scenarios prove the wired feature end-to-end. **Scenarios V1–V3 need
real secrets (`GOOGLE_CLIENT_ID`, `APPROVED_*_EMAIL`, `SESSION_SECRET`,
Upstash) — run them in your environment; this sandbox has none.**

## Prerequisites

1. Google Cloud Console: create an OAuth **client ID** (type "Web
   application"); add both `http://localhost:3000` and your production URL
   as *Authorized JavaScript origins*.
2. `.env.local` (never commit):
   ```sh
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   APPROVED_USER_A_EMAIL=person.a@gmail.com
   APPROVED_USER_B_EMAIL=person.b@gmail.com
   SESSION_SECRET=<openssl rand -base64 32>
   ```
3. `npm install && npm run dev`

## Automated checks (no credentials needed)

```sh
npm test          # all unit tests + unauthenticated submitVote integration test
npx tsc --noEmit  # strict types
npm run build     # cacheComponents validation: session read must be Suspense-gated
```

Expected: all pass; build succeeds with the session-dependent entry route.

## V1 — Approved user signs in and votes (US1 + US2)

1. Open `http://localhost:3000` in a fresh profile → **login screen** (no
   vote UI, no "Person A/B" picker).
2. Click the Google button, choose **Person A's** approved Gmail account.
3. Expected: vote screen appears with the first pair in well under 60 s
   (first sign-in; SC-002). No email is displayed anywhere.
4. Vote through ~10 pairs. Pairs swap instantly on tap (003 behavior
   unchanged). Open Upstash → `namewahl:votes` stream: new entries have
   `user: "A"`, shape identical to pre-004 records.
5. `/ranking` shows the same scores a pre-004 vote from "A" would have
   produced (SC-006).

## V2 — Session survives reload; attribution continues (US2)

1. While signed in as A, reload `/` → vote screen directly (no login,
   SC-001, < 5 s warm).
2. Vote once more → still attributed to "A".

## V3 — Non-approved account is denied (US3)

1. Sign out, sign in with a Google account that is **not** one of the two
   approved addresses.
2. Expected: friendly German denial ("Diese Adresse ist nicht
   freigeschaltet."), no vote UI, nothing written to Upstash.

## V4 — Sign-out ends the session (US3)

1. Signed in as A: click **Abmelden** → login screen returns immediately.
2. Reload `/` → still login screen (cookie gone, FR-007).
3. Tamper test (dev tools): edit the `namewahl_session` cookie value →
   reload → login screen (signature verification rejects it; no error page).

## V5 — Fail-fast on missing config (operator check)

1. Remove `SESSION_SECRET` (or an `APPROVED_*_EMAIL`) from `.env.local`,
   restart dev server, try to sign in.
2. Expected: sign-in fails with the `server-config` generic message;
   server log shows a clear missing-variable error naming the variable.
   Vote/ranking pages do not silently misattribute votes.

## V6 — Historical data unchanged (SC-006)

1. Note `/winners` before the deploy.
2. After deploying 004 and voting as both users, winners page logic and
   existing entries are unchanged; new votes only ever use aliases "A"/"B".
