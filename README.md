This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup (Namewahl)

1. Copy `.env.example` to `.env.local` and fill in all values. Required
   variables:
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis
     (free tier) for vote storage.
   - `GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud Console
     ("APIs & Services → Credentials → OAuth client ID", type *Web
     application*). Add `http://localhost:3000` and your production URL as
     *Authorized JavaScript origins*. The two approved Gmail addresses
     should be added as *Test users* on the OAuth consent screen.
   - `APPROVED_EMAILS` — comma-separated approved Gmail addresses
     (secret). Append an address to add a user — no code change, no data
     migration. Each approved address becomes a permanent internal user
     ID at first sign-in; display labels ("Person 1", "Person 2", …)
     follow first-sign-in order. Replaces 004's
     `APPROVED_USER_A_EMAIL` / `APPROVED_USER_B_EMAIL`. One-time effect of
     upgrading: existing 004 sessions are invalidated, so each browser
     re-logs in once; historical A/B vote records stay untouched (no
     migration).
   - `SESSION_SECRET` — at least 32 random bytes (`openssl rand -base64 32`).
   In production, set the same variables in Vercel (Settings → Environment
   Variables) and redeploy.

2. `npm install && npm run dev` → http://localhost:3000

3. Tests: `npm test` (unit + integration), `npx tsc --noEmit`,
   `npm run build`.

4. End-to-end validation scenarios: see
   `specs/006-per-user-tally/quickstart.md` (V1–V6).

## How votes count (features 005/006)

- **Identity**: every vote is recorded under the signed-in user's internal
  ID (opaque, generated at first sign-in from an approved Gmail address).
- **Personal ranking & winners**: `/ranking` ("Deine Rangliste") and
  `/winners` ("Deine Gewinner") are computed EXCLUSIVELY from your own
  votes. Other users' votes — and the pre-005 "A"/"B" alias history —
  never influence your personal view.
- **Personal pair drafting**: the pairs you are offered balance against
  your own seen-frequency (how often YOU have been offered each name);
  under-seen names appear more often. Win counts do not drive drafting.
- **Redis keys** (prefix `namewahl`):
  - `namewahl:votes` — stream, one audit entry per vote (all-time).
  - `namewahl:scores` — global win-count zset, still written per vote for
    history but read by no user-facing view (kept for a possible future
    global view).
  - `namewahl:user:<uid>:scores` — per-user win tally (source of your
    ranking/winners).
  - `namewahl:user:<uid>:seen` — per-user name exposure (drives pair
    drafting; written once per drafted batch).
  - `namewahl:users` / `namewahl:users:nextnum` — email→ID registry and
    display-label counter.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
