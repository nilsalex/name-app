# Research: Instant Vote Feedback

Feature: 003-instant-vote-feedback

## R1: How to make the pair transition instant (decoupling mechanism)

**Decision**: Optimistic UI via React's `useOptimistic` + `useTransition`
inside `app/vote-client.tsx`: the tap immediately swaps in the next pair from
the prepared reserve (a plain array in state), while the vote is dispatched
asynchronously outside the presentation path.

**Rationale**: The bundled Next.js guide `01-app/02-guides/interactive-apps.md`
(documented for the pinned Next version) establishes exactly this pattern for
"respond instantly to a click while the Server Function runs". Pair data is
already fully client-side (feature 002 draws pairs in the client from a score
map), so no server rendering round trip is involved in showing the next pair —
a state swap suffices. This is the simplest mechanism that satisfies FR-001/FR-003.

**Alternatives considered**:
- *Keeping `useTransition` but dropping optimistic rendering*: rejected — the
  current implementation already does this and it visibly delays the pair.
- *Manual double-buffer state with `useState` only*: functionally equivalent
  for pairs but loses React's built-in pending-state handling; no gain.
- *Server-generated pairs streamed to the client*: rejected — adds network
  latency into the presentation path, violating FR-003.

## R2: Pair reserve design (batches, refill, threshold)

**Decision**: A pure module `lib/pair-queue.ts` holding an in-memory array
(the reserve) with: `refill(queue, count, scores, previousPair)` to top up,
and `take(queue)` to pop the next pair. Refill is triggered by the client when
the reserve drops below **2 pairs**; each batch prepares **5 pairs** drawn with
the existing pure `nextPair()` against the freshest score map held in state.

**Rationale**: Just-in-time refill (clarified Q2) with a threshold of 2 means
at most one batch (~1 score fetch) per ~4 votes; a batch of 5 comfortably
covers burst tapping before the next refill lands. Constants are module-level
exports so tests can pin them without magic numbers in the client.

**Alternatives considered**:
- *Refill after every vote*: rejected (clarification Q2 option A) — multiplies
  score fetches, wasteful against the free-tier budget.
- *Timer-based refill*: rejected — idle timer churn with no benefit at two users.
- *Single look-ahead pair only (no batch)*: rejected — one slow score fetch
  during burst voting would exhaust the reserve (violates SC-002).

## R3: Vote dispatch with bounded retry and at-most-once recording

**Decision**: A `lib/vote-sender.ts` module managing a small in-memory queue
of pending votes. Each vote is dispatched immediately on cast (fire-and-forget
promise); on failure it re-enters the queue and is retried on a backoff timer
for a total window of **3 minutes**, after which the vote is marked failed and
the client shows the persistent "N votes didn't count" notice (dismissable).
At-most-once is guaranteed by never re-dispatching a vote whose promise
resolved successfully (success is terminal; only *unresolved/failed* attempts
retry). The sender exposes an `onFailure(count)` callback so the client only
subscribes to state changes.

**Rationale**: Meets clarified Q1 (retry-then-notice), Q3 (time-boxed, few
minutes → 3 min), Q4 (no UI signal during the retry window). At-most-once is
satisfied by tracking resolution state per vote — the server action itself is
idempotent-free but each *vote record* is dispatched exactly once unless it
was never confirmed.

**Alternatives considered**:
- *Persistent (localStorage/IndexedDB) offline queue*: rejected — spec
  Assumptions scope offline persistence to in-memory; toy project, tab-scoped
  votes are acceptable.
- *Retry until tab closes (indefinite)*: rejected (clarification Q3 option A)
  — keeps users unknowingly voting against incomplete tallies.
- *Attempt-count cap (e.g., 3 tries)*: rejected — on a flaky connection a
  short retry window with no time bound either gives up too early or hangs.

## R4: Reserve exhaustion UX

**Decision**: When the reserve is empty and no prepared pair exists, the pair
area shows its existing neutral `aria-busy` container (already used for the
initial mount) with buttons absent/disabled; when a pair becomes available
(batch refill resolves) it renders normally. No new visual component beyond a
minor CSS state, matching clarified Q5 (brief, unobtrusive, taps disabled).

**Rationale**: Reuses the existing "no pair yet" render path, so exhaustion is
not a new state — just a state that can now occur mid-session. Taps disabled
prevents buffering complexity (Q5 option B rejected: tap buffering risks
double-application and needs its own queue).

**Alternatives considered**:
- *Tap buffering while empty*: rejected — extra queue semantics for a state
  that should be rare; risk of lost/duplicated taps.
- *Silent discard of taps*: rejected — user action lost without notice.

## R5: Preserving weighted correctness across batches (FR-006/FR-007)

**Decision**: Pairs within a batch are drawn from one score-map snapshot;
the "no exact repeat of the previous pair" rule is enforced at *generation*
time (pass the last pair of the previous batch/run as `previousPair` into
`nextPair`) and at *display* time as a guard: if a taken pair equals the
currently shown pair (either order), it is discarded and the next reserve
pair is used (or the reserve refilled if all stale).

**Rationale**: Keeps `nextPair()` untouched and pure (feature 002 contract);
validity filtering is the queue's job. The score snapshot per batch is exactly
the clarified FR-007 semantics — refreshed scores influence the next batch,
never pairs already shown.

**Alternatives considered**:
- *Re-validating pairs against fresh scores at display time*: rejected —
  adds a re-draw path with no user-visible benefit.
- *Enforcing the repeat rule only at generation*: insufficient — batches are
  generated ahead, so the pair following a displayed one must be re-checked
  at display time.

## R6: Free-tier command volume audit

**Decision**: Per vote: exactly 1 pipeline write (`xadd` + `zincrby`, as
today). Score reads: ~1 per batch of 5 votes (just-in-time) instead of 1 per
vote as in feature 002 — a strict reduction. No new keys, no scans, no
subscriptions.

**Rationale**: Constitution Free-Plan Budget requires no traffic-pattern
worsening; the feature strictly improves read volume. At two users, daily
command count remains trivially within the 10k/day free tier.

**Alternatives considered**: none — no design option multiplied writes.
