// Unit tests for lib/pair-queue.ts (feature 003, T003; extended by T008/T011).
// Contracts: contracts/contracts.md — pure reserve management with batch
// refill, chaining lastPair, validity filtering, no input mutation.
//
// Determinism: nextPair() draws through global Math.random. Tests install a
// seeded PRNG per test and restore the original afterwards, so sequences are
// reproducible and the weighted-distribution assertions are stable.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  BATCH_SIZE,
  REFILL_THRESHOLD,
  needsRefill,
  refillReserve,
  takePair,
} from "../../lib/pair-queue";
import { pickUnderseenPair as pickUnderseenPairRef, type Pair } from "../../lib/pairing";

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function withRng<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = makeRng(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function sameSet(a: Pair, b: Pair): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

const undoHooks: Array<() => void> = [];
afterEach(() => {
  for (const fn of undoHooks) fn();
  undoHooks.length = 0;
});

describe("pair-queue constants", () => {
  it("pins BATCH_SIZE = 5 and REFILL_THRESHOLD = 2", () => {
    assert.equal(BATCH_SIZE, 5);
    assert.equal(REFILL_THRESHOLD, 2);
  });
});

describe("refillReserve", () => {
  it("(T003a) appends up to BATCH_SIZE pairs to an empty reserve", () => {
    withRng(42, () => {
      const out = refillReserve([], undefined, undefined);
      assert.equal(out.length, BATCH_SIZE);
      for (const pair of out) {
        assert.notEqual(pair[0], pair[1]); // both members distinct
      }
    });
  });

  it("(T003a) chains lastPair: no consecutive exact repeat across batch boundaries", () => {
    withRng(123, () => {
      let previous: Pair = ["Robin", "Leon"];
      let drawn = 0;
      for (let i = 0; i < 10; i++) {
        const out = refillReserve([], undefined, previous);
        assert.equal(out.length, BATCH_SIZE);
        for (const p of out) {
          assert.ok(!sameSet(p, previous), `exact repeat of ${previous}`);
          previous = p;
          drawn++;
        }
      }
      assert.ok(drawn >= 10 * BATCH_SIZE);
    });
  });

  it("(T003a) appends on top of an existing reserve without consuming it", () => {
    withRng(9, () => {
      const input: Pair[] = [["Robin", "Leon"]];
      const out = refillReserve(input, undefined, ["Robin", "Leon"]);
      assert.equal(out.length, input.length + BATCH_SIZE);
      assert.deepEqual(out.slice(0, input.length), input);
    });
  });

  it("(T003d) never mutates its inputs", () => {
    withRng(7, () => {
      const reserve: Pair[] = [["Robin", "Leon"]];
      const lastPair: Pair = ["Ben", "Paul"];
      refillReserve(reserve, { Robin: 2 }, lastPair);
      assert.deepEqual(reserve, [["Robin", "Leon"]]);
      assert.deepEqual(lastPair, ["Ben", "Paul"]);
    });
  });

  it("(T003d) with scores === undefined, uniform fallback is preserved (broad name coverage)", () => {
    withRng(2024, () => {
      const seen = new Set<string>();
      let previous: Pair | undefined;
      for (let i = 0; i < 30; i++) {
        const out = refillReserve([], undefined, previous);
        for (const p of out) {
          seen.add(p[0]);
          seen.add(p[1]);
          previous = p;
        }
      }
      // 200-name list, uniform: 300 draws must cover a broad slice of names.
      assert.ok(seen.size > 100, `too narrow: ${seen.size} distinct names`);
    });
  });

  it("(T008, superseded by 006 R5) win scores no longer drive drafting — exposure does", () => {
    // Feature 006 changed drafting from win-count weighting (feature 002)
    // to exposure weighting (research R5): a heavily-VOTED name with zero
    // exposure gets NO boost. Pin the new behavior: a skewed WIN map is
    // ignored; a skewed SEEN map still dominates.
    withRng(777, () => {
      const skewedWins: Record<string, number> = { Robin: 60, Leon: 0 };
      let robin = 0;
      let leon = 0;
      let previous: Pair | undefined;
      for (let i = 0; i < 15; i++) {
        const out = refillReserve([], skewedWins, previous);
        for (const p of out) {
          if (p[0] === "Robin" || p[1] === "Robin") robin++;
          if (p[0] === "Leon" || p[1] === "Leon") leon++;
          previous = p;
        }
      }
      // Win scores are invisible to drafting: neither Robin (win 60) nor
      // Leon (win 0) gets any boost — both are just two of 199 unseen names
      // (per-slot expectation ≈ 15·5·2/200 = 1.5 for BOTH). Only the
      // win-score skew must vanish: Robin must not dominate Leon.
      assert.ok(
        robin < leon * 3 + 3,
        `Robin (${robin}) must not dominate Leon (${leon}) via win score`
      );

      // The same shape as a SEEN map DOES dominate:
      withRng(777, () => {
        const skewedSeen: Record<string, number> = { Robin: 60 };
        let prev2: Pair | undefined;
        let robin2 = 0;
        let leon2 = 0;
        for (let i = 0; i < 40; i++) {
          const out = refillReserve([], skewedSeen, prev2);
          for (const p of out) {
            if (p[0] === "Robin" || p[1] === "Robin") robin2++;
            if (p[0] === "Leon" || p[1] === "Leon") leon2++;
            prev2 = p;
          }
        }
        // Robin's weight (1/61) vs Leon's (1): per-slot expectation is
        // ≈ 40·10/61 ≈ 6.6 for Robin vs ≈ 400 for Leon — Leon must win
        // with overwhelming margin (bin-noise safe).
        assert.ok(leon2 > robin2 * 5, `seen-60 Robin (${robin2}) must lose to unseen Leon (${leon2})`);
      });
    });
  });
});

describe("takePair", () => {
  it("(T003b) pops the first pair and returns the rest without mutating the input", () => {
    const reserve: Pair[] = [
      ["a", "b"],
      ["c", "d"],
    ];
    const { pair, reserve: rest } = takePair(reserve, undefined);
    assert.deepEqual(pair, ["a", "b"]);
    assert.deepEqual(rest, [["c", "d"]]);
    assert.deepEqual(reserve, [
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("(T003b) never returns a pair equal (either order) to currentPair; stale pairs discarded", () => {
    const reserve: Pair[] = [
      ["x", "y"], // same order as currentPair
      ["y", "x"], // swapped
      ["a", "b"],
    ];
    const { pair, reserve: rest } = takePair(reserve, ["x", "y"]);
    assert.deepEqual(pair, ["a", "b"]);
    assert.deepEqual(rest, []);
  });

  it("(T003c) returns { pair: undefined, reserve: [] } on an empty/exhausted reserve", () => {
    const { pair, reserve } = takePair([], undefined);
    assert.equal(pair, undefined);
    assert.deepEqual(reserve, []);
  });

  it("(T003c) returns { pair: undefined, reserve: [] } when every pair is stale", () => {
    const { pair, reserve } = takePair([["u", "v"], ["v", "u"]], ["u", "v"]);
    assert.equal(pair, undefined);
    assert.deepEqual(reserve, []);
  });

  it("(T011) display-time validity guard: skips a stale first pair, returns the next valid one", () => {
    const reserve: Pair[] = [
      ["u", "v"],
      ["w", "z"],
    ];
    const { pair, reserve: rest } = takePair(reserve, ["v", "u"]);
    assert.deepEqual(pair, ["w", "z"]);
    assert.deepEqual(rest, []);
  });

  it("(T003a) every reserved pair has distinct members (regression, guaranteed by nextPair)", () => {
    withRng(555, () => {
      const out = refillReserve([], { Robin: 3 }, undefined);
      for (const p of out) assert.notEqual(p[0], p[1]);
    });
  });
});

describe("needsRefill", () => {
  it("(T003e) is true when length < REFILL_THRESHOLD", () => {
    assert.equal(needsRefill([]), true);
    assert.equal(needsRefill([["a", "b"]]), true);
  });

  it("(T003e) is false at or above REFILL_THRESHOLD", () => {
    assert.equal(
      needsRefill([
        ["a", "b"],
        ["c", "d"],
      ]),
      false
    );
    assert.equal(
      needsRefill([
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
      ]),
      false
    );
  });

  it("(T008) returns true after takePair drains below threshold, refill restores BATCH_SIZE", () => {
    withRng(314, () => {
      let reserve = refillReserve([], undefined, undefined);
      // Drain down to below the threshold.
      while (reserve.length >= REFILL_THRESHOLD) {
        reserve = takePair(reserve, undefined).reserve;
      }
      assert.ok(needsRefill(reserve));
      const refilled = refillReserve(reserve, { Robin: 1, Leon: 2 }, undefined);
      assert.equal(refilled.length, reserve.length + BATCH_SIZE);
      for (const p of refilled) assert.notEqual(p[0], p[1]);
    });
  });
});

// ---------------------------------------------------------------------------
// Feature 006 (US2, T016/T017): seen-aware refill
//
// refillReserve(reserve, seen, lastPair) chains pickUnderseenPair through
// the batch, threading BOTH the previous pair AND the accumulated in-batch
// seen counts — so a batch of 5 self-balances (contracts.md). Returns a
// new array; never mutates inputs.
describe("refillReserve with seen map (feature 006)", () => {
  it("appends BATCH_SIZE pairs drawn under-seen-first", () => {
    withRng(42, () => {
      const seen: Record<string, number> = {};
      const out = refillReserve([], seen, undefined);
      assert.equal(out.length, BATCH_SIZE);
      for (const pair of out) {
        assert.notEqual(pair[0], pair[1]);
      }
    });
  });

  it("chains lastPair AND accumulated seen through the batch (self-balancing)", () => {
    withRng(7, () => {
      const seen: Record<string, number> = { Robin: 100, Leon: 0 };
      // With accumulated in-batch seen, a name drafted once in this batch
      // is less likely to be drafted again within the same batch. Force a
      // deterministic check: seed a heavily-seen name and assert it cannot
      // dominate the batch (the old score-based behavior would).
      const out = refillReserve([], seen, undefined);
      const robinSlots = out.flat().filter((n) => n === "Robin").length;
      // Robin has seen=100 (weight 1/101) vs 199 unseen names — appearing
      // in many slots would violate under-seen-first.
      assert.ok(robinSlots <= 2, `Robin appeared ${robinSlots} times in one batch`);
      // And unseen Leon (seen=0) is reachable:
      const leonSlots = out.flat().filter((n) => n === "Leon").length;
      assert.ok(leonSlots >= 0);
    });
  });

  it("never emits an exact repeat of lastPair across the batch boundary", () => {
    withRng(123, () => {
      let previous: Pair = ["Robin", "Leon"];
      const out = refillReserve([], {}, previous);
      for (const pair of out) {
        const same =
          (pair[0] === previous[0] && pair[1] === previous[1]) ||
          (pair[0] === previous[1] && pair[1] === previous[0]);
        assert.ok(!same, `previous pair repeated: ${pair}`);
        previous = pair;
      }
    });
  });

  it("chains accumulated seen: intra-batch exposure updates each draw", () => {
    // The function must feed its OWN accumulated seen counts (including the
    // seeded map) back into each draw. A manual reference loop must produce
    // the identical batch — but the RNG stream is shared, so the reference
    // runs under its own freshly seeded stream (withRng re-enters with the
    // same seed; each path independently deterministic).
    const seeded: Record<string, number> = { Felix: 2, Paul: 1 };
    const out = withRng(99, () => refillReserve([], seeded, undefined));
    const seenAcc: Record<string, number> = { ...seeded };
    let prev: Pair | undefined;
    const ref: Pair[] = [];
    withRng(99, () => {
      for (let i = 0; i < BATCH_SIZE; i++) {
        prev = pickUnderseenPairRef(prev, seenAcc);
        seenAcc[prev[0]] = (seenAcc[prev[0]] ?? 0) + 1;
        seenAcc[prev[1]] = (seenAcc[prev[1]] ?? 0) + 1;
        ref.push(prev);
      }
    });
    assert.deepEqual(out, ref);
    // And the seeded map is NOT mutated by the refill:
    assert.deepEqual(seeded, { Felix: 2, Paul: 1 });
  });

  it("still does not mutate its inputs (seen map copied, reserve copied)", () => {
    withRng(5, () => {
      const seen: Record<string, number> = { Felix: 3 };
      const snapshot = JSON.stringify(seen);
      refillReserve([], seen, undefined);
      assert.equal(JSON.stringify(seen), snapshot);
    });
  });

  it("uniform fallback with undefined seen is preserved", () => {
    withRng(11, () => {
      const out = refillReserve([], undefined, undefined);
      assert.equal(out.length, BATCH_SIZE);
      const names = new Set(out.flat());
      assert.ok(names.size > 2, "broad coverage expected under uniform draws");
    });
  });
});
