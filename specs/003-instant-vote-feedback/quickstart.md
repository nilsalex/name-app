# Quickstart: Instant Vote Feedback — End-to-End Validation

Feature: 003-instant-vote-feedback

Prerequisites identical to feature 001 (`specs/001-baby-name-voting/quickstart.md`):
Node + npm; Upstash REST credentials in `.env.local` for the integration-backed
scenarios (V1–V3 partially work without credentials — pairs render, votes fail).

## Setup

```bash
npm install
npm run dev        # start locally
npm test           # unit tests incl. new pair-queue / vote-sender suites
npm run build      # must pass with zero type errors (constitution gate)
```

## Validation Scenarios

### V1: Tap → next pair is instant (SC-001, SC-002 / US1)

1. Open `/`, pick Person A or B, and tap through 20+ pairs at a brisk pace.
2. **Expect**: every tap swaps in the next pair immediately — no spinner, no
   disabled period, no blank flash (SC-002). Perceived transition is
   imperceptible (SC-001, <100 ms).
3. Verify in the network tab: vote requests fire in the background, *after*
   the pair has already changed.

### V2: Weighting follows fresh votes without reload (SC-004 / US3)

1. Vote heavily for one name (e.g., Noah) 5–10 times in one session.
2. **Expect**: Noah and other high-score names keep appearing noticeably more
   often in later pairs of the *same* session; zero-score names still appear
   occasionally. Behaviour matches feature 002 (linear weight = score + 1).
3. Automated check: existing unit tests in `tests/unit/pairing.test.ts` still
   pass unchanged (selection logic untouched); new `pair-queue` tests assert
   the chaining of the previous pair across batch boundaries.

### V3: Votes actually count (SC-005 / US3)

1. With credentials configured, vote ~10 times, then open `/ranking`.
2. **Expect**: the ranking reflects exactly the votes cast — totals and shared
   ranks (1-2-2-4) as in feature 001. `/winners` likewise.

### V4: Failed votes are retried then honestly reported (SC-003 / US1+US3)

1. Simulate failure: stop the Upstash fetch (e.g., block the network in devtools
   or temporarily remove credentials) and cast several votes.
2. **Expect**: pairs keep appearing instantly (reserve is client-side); no
   error shown during the retry window (clarified Q4). The vote-sender unit
   tests (V4-automated) prove the retry-then-fail transition deterministically
   with a fake clock.
3. After the 3-minute window: persistent "N Stimmen wurden nicht gezählt"
   notice appears; dismiss it to clear. No partial/double counting occurred.

### V5: At-most-once under retries (SC-003)

Automated check (unit, deterministic via injected timers/fakes in
`tests/unit/vote-sender.test.ts`): a vote that fails twice then succeeds is
sent 3 times, recorded once, and never dispatched again; a vote that never
succeeds within the window is marked failed exactly once.

### V6: Reserve exhaustion stays graceful (US2 edge)

1. Throttle the network heavily ("Slow 3G") and tap faster than batches can
   prepare.
2. **Expect**: occasionally the pair area shows its neutral loading state with
   taps disabled for a moment, then voting resumes — never an invalid pair,
   never a lost tap error.

## Exit Criteria

All scenarios pass; `npm test` green (existing 20 + new suites), `npm run
build` clean, no new dependencies (Free-Plan Budget audit: score reads per
session reduced vs feature 002 — see research.md R6).
