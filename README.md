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
   - `APPROVED_USER_A_EMAIL` / `APPROVED_USER_B_EMAIL` — the two approved
     Gmail addresses; the variable suffix maps them to alias "A" / "B".
   - `SESSION_SECRET` — at least 32 random bytes (`openssl rand -base64 32`).
   In production, set the same variables in Vercel (Settings → Environment
   Variables) and redeploy.

2. `npm install && npm run dev` → http://localhost:3000

3. Tests: `npm test` (unit + integration), `npx tsc --noEmit`,
   `npm run build`.

4. End-to-end validation scenarios: see
   `specs/004-gmail-login/quickstart.md` (V1–V6).

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
