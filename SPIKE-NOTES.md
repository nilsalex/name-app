# SPIKE-NOTES — name-app voting spike

Throwaway-but-working end-to-end spike: a German boys' name list, simple
persistence, and a voting flow, so the real specification can be written
against something that actually runs on Vercel. NOT meant to be merged as-is.

## What is in the spike

- `lib/names.ts` — seeded name list (see "Name data" below).
- `lib/votes.ts` — persistence abstraction with two backends.
- `app/actions.ts` — Server Action that casts a vote and refreshes the page.
- `app/page.tsx` — spike-grade voting UI: ranking, vote form, per-vote log.
- `next.config.ts` — unchanged (Cache Components already enabled by the
  scaffold); the uncached vote read lives inside a `<Suspense>` boundary as
  Cache Components requires.
- `.env.example` — documents the Upstash env vars.

## Name data

- Source: official "Vornamen Köln" dataset (city of Cologne open data),
  https://offenedaten-koeln.de/dataset/vornamen, consumed via the mirrored
  per-year CSVs at
  https://github.com/mhyfritz/baby-names-cologne
  (`src/Vornamen_Koeln_2010.csv` … `2018.csv`, byte-identical to the
  official downloads).
- License: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
- Derivation: male (`geschlecht=m`) rows of all nine seasons, aggregated by
  name, top 200 by total count, alphabetically sorted. Two trivial named
  edge cases: rows with empty names were dropped; one legitimately
  female-coded entry ("Maria") appears among male-attributed rows in the
  original data and was kept as-is (for the spec to decide).

## Persistence: what was chosen and why

Chosen for the spike: **Upstash Redis, used via its plain REST API**
(`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`), no SDK dependency.

- Works natively on Vercel (serverless, edge-friendly, generous free tier;
  it is Vercel's own marketplace partner for Redis).
- Two simultaneous voters: votes are stored as a Redis hash
  (`HSET name-app:votes <voter>\x00<name> 1`), one field per (voter,
  name) pair — two voters casting at the same time only touch different
  fields, so no lost update.
- Dev fallback: a local JSON file (`data/votes.json`) when the env vars are
  absent, so `next dev` works with zero setup. It is NOT portable to
  Vercel's read-only filesystem — the page labels the active backend.
- One pick per voter: re-voting overwrites that voter's field.

Alternatives deliberately not chosen for the spike:

- **Vercel KV / Vercel Marketplace Upstash** — the managed version of the
  same thing; simpler env-var story, but vendor-locked. The raw REST API
  keeps the code portable and the spike token-free at setup time.
- **Neon/Postgres + Drizzle/Prisma** — the "real app" answer (real schema,
  migration story typed queries), but heavier for a spike.
- **Vercel Blob / Edge Config** — Blob is not queryable for tallies;
  Edge Config is heavily write-limited and not meant for interactive
  writes.

## Decisions the real specification must settle

1. **Schema**: spikes votes into a single hash of (voter -> picked name)
   (field key `voter\x00name`, derived per-voter snapshot). The real spec
   needs: a persisted tally vs. per-vote rows (allowing undos,
   change-of-vote history, timestamps); one vote per voter vs. a
   shortlist/score per voter (rank ~5 names?); whether "one pick per
   voter" or a shortlist is the actual product model.

2. **Provider**: Upstash (REST or via Vercel Marketplace KV) vs. Postgres
   (Neon) vs. Vercel Blob/Edge Config. Decide based on whether the final
   app needs anything beyond a tally (history, comments per name,
   dates) — anything of that shape argues for Postgres.

3. **Auth for the two voters**: the spike uses a typed free-text "Your
   name" field — unauthenticated, trivially spoofable, and duplicated
   names silently split one voter into two. The real spec must decide:
   shared secret/Passphrase gate, invite link, or magic-link email sign
   in, and how the two fixed users' identities are established.

4. **Seed strategy**: names are currently baked into `lib/names.ts` from
   the Cologne dataset. The spec must decide whether the name list is
   static (imported once), or seeded into the DB at first boot, and where
   it comes from: which dataset, which years, top-N threshold, and the
   girls' list (out of spike scope). Also decide how the couple's own
   additions or removals are modeled.

5. **Vote-visibility semantics**: the spike shows live tallies plus who
   voted for what. The spec must decide whether the two voters see each
   other's individual choices immediately, or only after both have voted.

6. **Caching/model**: with Cache Components enabled, the vote read must
   stay inside `<Suspense>` (spike keeps it uncached for freshness). The
   spec should decide whether live freshness is wanted at all — a
   scheduled revalidation or manual refresh could simplify the code.
