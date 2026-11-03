// Unit tests for lib/vote-sender.ts (feature 003, T004).
// Contracts: contracts/contracts.md — fire-and-forget dispatch, bounded
// retry until a configurable window expires, terminal "sent" state is never
// re-dispatched (at-most-once), onFailed fires once per failed vote.
//
// Determinism: injectable fake send + fake global timers (setTimeout /
// clearTimeout) — no real waits, no flaky async.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createVoteSender, type VoteInput } from "../../lib/vote-sender";

const voteA: VoteInput = { winner: "Robin", loser: "Leon", voter: "A" };
const voteB: VoteInput = { winner: "Ben", loser: "Paul", voter: "B" };

interface Timer {
  id: number;
  fn: () => void;
  due: number;
}

/** Drains all pending microtasks (promise chains) before continuing. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Clock {
  /** Current fake epoch ms. */
  now: () => number;
  advance: (ms: number) => Promise<void>;
  install: () => void;
}

function fakeClock(): Clock {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, Timer>();
  const setTimeoutFn = ((fn: () => void, ms?: number) => {
    const id = nextId++;
    timers.set(id, { id, fn, due: now + (ms ?? 0) });
    return id;
  }) as typeof setTimeout;
  const clearTimeoutFn = ((id?: number) => {
    if (id !== undefined) timers.delete(id);
  }) as unknown as typeof clearTimeout;
  return {
    now: () => now,
    async advance(ms: number): Promise<void> {
      now += ms;
      // Fire all due timers in id order, settling microtasks in between.
      const due = [...timers.values()].filter((t) => t.due <= now).sort((a, b) => a.id - b.id);
      for (const t of due) {
        if (!timers.has(t.id)) continue;
        timers.delete(t.id);
        t.fn();
        await settle();
      }
    },
    install() {
      const originalSet = globalThis.setTimeout;
      const originalClear = globalThis.clearTimeout;
      globalThis.setTimeout = setTimeoutFn;
      globalThis.clearTimeout = clearTimeoutFn;
      undoHooks.push(() => {
        globalThis.setTimeout = originalSet;
        globalThis.clearTimeout = originalClear;
      });
    },
  };
}

let undoHooks: Array<() => void> = [];
afterEach(() => {
  for (const fn of undoHooks) fn();
  undoHooks = [];
});

interface Harness {
  handle: ReturnType<typeof createVoteSender<VoteInput>>;
  /** All send attempts in order. */
  calls: VoteInput[];
  /** Reject the most recent in-flight attempt. */
  fail: () => void;
  /** Resolve the most recent in-flight attempt. */
  succeed: () => void;
  /** Number of attempts still awaiting settlement. */
  unsettled: () => number;
}

function makeSender(
  clock: Clock,
  opts: { retryWindowMs?: number; retryDelayMs?: number; onFailed?: (n: number) => void } = {}
): Harness {
  const calls: VoteInput[] = [];
  const pending: Array<{ reject: (e: Error) => void; resolve: () => void }> = [];
  const send = (v: VoteInput): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      calls.push(v);
      pending.push({ reject, resolve });
    });
  const handle = createVoteSender({
    send,
    retryWindowMs: opts.retryWindowMs,
    retryDelayMs: opts.retryDelayMs,
    onFailed: opts.onFailed,
    now: clock.now,
  });
  return {
    handle,
    calls,
    // Attempts are queued FIFO per cast order; shift() targets the oldest.
    fail: () => pending.shift()!.reject(new Error("network down")),
    succeed: () => pending.shift()!.resolve(),
    unsettled: () => pending.length,
  };
}

describe("vote-sender", () => {
  let clock: Clock;
  beforeEach(() => {
    clock = fakeClock();
    clock.install();
  });

  it("(T004a) calls send exactly once for a first-attempt success", async () => {
    const h = makeSender(clock);
    h.handle.cast(voteA);
    await settle();
    assert.equal(h.unsettled(), 1);
    assert.equal(h.calls.length, 1);
    h.succeed();
    await settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.handle.pendingCount(), 0);
  });

  it("(T004b) a vote that rejects twice then resolves is dispatched 3 times, ends sent, never re-dispatched", async () => {
    const h = makeSender(clock, { retryDelayMs: 5_000 });
    h.handle.cast(voteA);
    await settle();
    assert.equal(h.unsettled(), 1);
    h.fail();
    await settle();
    await clock.advance(5_000); // retry #1
    assert.equal(h.unsettled(), 1);
    h.fail();
    await settle();
    await clock.advance(5_000); // retry #2
    assert.equal(h.unsettled(), 1);
    h.succeed();
    await settle();
    assert.equal(h.calls.length, 3);
    assert.equal(h.handle.pendingCount(), 0);
    // Long past the window: a sent vote is never re-dispatched (at-most-once).
    await clock.advance(10 * 180_000);
    assert.equal(h.calls.length, 3);
  });

  it("(T004c) a vote that rejects until retryWindowMs elapses ends failed; onFailed(1) fires exactly once; no further sends", async () => {
    const failures: number[] = [];
    const h = makeSender(clock, {
      retryWindowMs: 30_000,
      retryDelayMs: 5_000,
      onFailed: (n) => failures.push(n),
    });
    h.handle.cast(voteA);
    await settle();
    h.fail(); // attempt 1 rejected
    await settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.handle.pendingCount(), 1); // still pending inside the window

    // Advance past the whole window: retries happen, all keep rejecting.
    await clock.advance(180_000);
    const attemptsSoFar = h.calls.length;
    assert.ok(attemptsSoFar > 1, "retries should have occurred inside the window");
    // Settle every still-unsettled attempt as a failure.
    while (h.unsettled() > 0) h.fail();
    await settle();

    assert.deepEqual(failures, [1]);
    assert.equal(h.handle.pendingCount(), 0);
    // Window expired: no further send attempts, ever.
    await clock.advance(1_000_000);
    assert.equal(h.calls.length, attemptsSoFar);
  });

  it("(T004c, guard) no retry attempt fires after the window has expired", async () => {
    const h = makeSender(clock, { retryWindowMs: 5_000, retryDelayMs: 5_000 });
    h.handle.cast(voteA);
    await settle();
    h.fail();
    await settle();
    assert.equal(h.handle.pendingCount(), 1);
    // One retry starts at t=5s, exactly at window expiry.
    await clock.advance(5_000);
    assert.ok(h.unsettled() >= 1);
    h.fail();
    await settle();
    assert.equal(h.handle.pendingCount(), 0); // expired → failed
    const afterWindow = h.calls.length;
    await clock.advance(500_000);
    assert.equal(h.calls.length, afterWindow);
  });

  it("(T004c, continued) onFailed fires exactly once even after dismissal-equivalent rage advancing", async () => {
    const failures: number[] = [];
    const h = makeSender(clock, { retryWindowMs: 10_000, retryDelayMs: 100, onFailed: (n) => failures.push(n) });
    h.handle.cast(voteA);
    await settle();
    h.fail();
    await settle();
    await clock.advance(10_000);
    while (h.unsettled() > 0) h.fail();
    await settle();
    assert.deepEqual(failures, [1]);
    await clock.advance(10_000);
    await settle();
    assert.deepEqual(failures, [1]);
  });

  it("(T004d) multiple votes retry independently, each at-most-once", async () => {
    const failures: number[] = [];
    const h = makeSender(clock, { retryWindowMs: 60_000, retryDelayMs: 5_000, onFailed: (n) => failures.push(n) });
    h.handle.cast(voteA);
    h.handle.cast(voteB);
    await settle();
    assert.equal(h.unsettled(), 2);
    assert.equal(h.calls.length, 2);

    h.fail(); // voteA attempt 1 rejected
    h.fail(); // voteB attempt 1 rejected
    await settle();
    assert.equal(h.handle.pendingCount(), 2); // both re-queued

    await clock.advance(5_000); // both retried simultaneously
    assert.equal(h.unsettled(), 2);
    assert.ok(h.calls.length >= 4, "both votes retried");
    h.succeed(); // voteA attempt 2 resolves (oldest unsettled = voteA)
    h.fail(); // voteB attempt 2 rejected
    await settle();
    // voteA is terminal-sent; only voteB remains pending/retrying.
    assert.equal(h.handle.pendingCount(), 1);
    assert.equal(failures.length, 0); // voteB still inside its 60 s window

    await clock.advance(60_000); // voteB's window (started t=0) expires
    while (h.unsettled() > 0) h.fail();
    await settle();
    assert.deepEqual(failures, [1]); // voteB failed exactly once
    assert.equal(h.handle.pendingCount(), 0);
    // voteA must never be re-dispatched alongside voteB's attempts.
    const voteACalls = h.calls.filter((c) => c.winner === "Robin").length;
    assert.equal(voteACalls, 2);
  });

  it("(T004e) pendingCount reflects unsent, not-yet-failed votes", async () => {
    const failures: number[] = [];
    const h = makeSender(clock, { retryWindowMs: 10_000, retryDelayMs: 5_000, onFailed: (n) => failures.push(n) });
    h.handle.cast(voteA);
    await settle();
    assert.equal(h.handle.pendingCount(), 1);
    h.fail();
    await settle();
    assert.equal(h.handle.pendingCount(), 1); // still retrying inside the window
    await clock.advance(10_000); // window expires
    while (h.unsettled() > 0) h.fail();
    await settle();
    assert.deepEqual(failures, [1]);
    assert.equal(h.handle.pendingCount(), 0);
  });

  it("(T004e) pendingCount across a drain-and-refill cycle tracks only live votes", async () => {
    const h = makeSender(clock);
    h.handle.cast(voteA);
    h.handle.cast(voteB);
    await settle();
    assert.equal(h.handle.pendingCount(), 2);
    h.succeed();
    await settle();
    assert.equal(h.handle.pendingCount(), 1);
    h.succeed();
    await settle();
    assert.equal(h.handle.pendingCount(), 0);
  });
});
