# Data Model: Mobile-Friendly Voting Layout (008)

Date: 2026-11-02. **This feature is presentational only — no data entities.**
All Upstash Redis keys (`namewahl:user:<uid>:scores`, `namewahl:user:<uid>:seen`,
`namewahl:votes`, `namewahl:scores`) keep their exact shapes from features
002–006. No keys, records, pipelines, or actions change.

## Existing entities (referenced, unchanged)

| Entity | Shape used by this feature | Change |
|---|---|---|
| Name pair (`Pair`) | `[string, string]` from `lib/pairing.ts` via `lib/pair-queue.ts` | none |
| Candidate names | `COLOGNE_200_BOY_NAMES: readonly string[]` (200 single-token first names; longest "Maximilian"/"Konstantin", 10 chars) | none |
| Session/user display label | `label: string` prop from `page.tsx` server component | none |
| Vote records / per-user tallies | Redis zsets + stream (005/006) | none |

## Presentation-domain rules validated against the data

The only "data" this feature constrains is how strings render in fixed
slots. Validation rules from the spec (FR-001…FR-008) evaluated against
the real candidate set:

- Longest name (10 chars) must render on one line in a flex card at 320 px
  viewport ⇒ satisfied by clamp'd font ≈17–26 px with nowrap (research R1/R2).
- The spec's worst case (hyphenated multi-part names, e.g. 40+ chars) has
  no current data source but remains handled by the ellipsis fallback chain
  (shrink → ellipsis), so adding future names with spaces/hyphens cannot
  reintroduce wrapping.

## UI layout contract

See `contracts/ui-layout.md` for the presentation contract (slot order,
single-line guarantee, target sizes, fallback chain) that governs every
screen touched by this feature.
