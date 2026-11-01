# Quickstart: Show the User's First Name (007)

Date: 2026-11-01. Validation scenarios for the deployed feature. All live
steps run against a real deployment (Vercel + real Google/Upstash creds);
automated gates (`npm test`, `tsc --noEmit` via build, `npm run build`)
run locally. Format follows feature 006's quickstart.

**Prerequisites**: `APPROVED_EMAILS` with both addresses set; a signed-out
browser; Vercel deployment of this branch. Details on where the name is
captured and stored: [data-model.md](./data-model.md); signature changes:
[contracts/contracts.md](./contracts/contracts.md).

## V1 — Fresh sign-in shows the real first name (spec US1, SC-001/002, FR-001)

1. User X signs **out** completely (clear cookie via "Abmelden"), then
   signs in fresh via Google.
2. After the router refresh swaps in the vote screen, read the hint line:
   it must read "Welcher Name gefällt dir besser, X?" (X = X's given
   name as their Google profile reports it).
3. **Pass**: the real first name appears on first load, no settings
   opened, no extra click — and one reload keeps it.

## V2 — Second sign-in on the same browser shows the next user's name (spec US1 AC3, FR-002/FR-006)

1. X signs out in the browser; user Y signs in with a different approved
   account.
2. **Pass**: the label now shows Y's first name, never X's, on the first
   load of the new session.

## V3 — Signed-out visitor sees no name (spec US2, SC-003)

1. Sign out; open the app in the same browser without signing in.
2. **Pass**: the login screen shows only the Google button — no first
   name of X or anyone else anywhere on the page.

## V4 — Account without a given name falls back (spec US3, FR-005)

1. (Optional, only if obtainable) Sign in with an approved account whose
   Google profile has no split given name but a display name.
2. **Pass**: the label shows the first word of the display name; if the
   account has neither field, the label falls back to "Person N"
   (existing neutral label), never to a blank or an error — voting works
   normally afterwards.

## V5 — Existing record keeps working (research R5, no backfill)

1. If a user record was created *before* this deployment and that user
   does not re-sign-in: they keep seeing "Person N" — this is the
   documented, accepted post-deploy state, not a bug.
2. After they sign out once and sign in again with this build, the label
   shows their given name (fresh creation path captures it).
3. **Pass**: both states behave as described; voting and ranking are
   unaffected in either case.

## V6 — Privacy cross-check (data-model "What does NOT change", FR-008 lineage)

1. With X signed in, cast several votes; open `/ranking` and `/winners`.
2. **Pass**: neither page contains X's first name anywhere (they list
   baby names only); vote records and per-user zsets show no name; the
   session cookie stays `{ uid, iat }`-shaped (opaque, no name).

## Automated gates (Constitution III/IV)

- Unit: tokeninfo fixture with `given_name` → success result carries
  `firstName`; fixture with only `name` → its first word; fixture with
  neither → success, but no `firstName` (and sign-in persists a record
  without the field — store-level integration gate in
  `tests/integration/submit-auth.test.ts`).
- Unit: `displayLabel` precedence — name > "Person N" > "Person";
  legacy record without `firstName` unchanged from 005.
- Command: `npm test` fully green; `npm run build` zero type/lint errors.
