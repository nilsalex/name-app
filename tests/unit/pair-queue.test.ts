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
import type { Pair } from "../../lib/pairing";

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function withRng(seed: number, fn: () => void): void {
  const original = Math.random;
  Math.random = makeRng(seed);
  try {
    fn();
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

  it("(T008) fresh scores influence the new batch: skewed map changes drawn distribution", () => {
    withRng(777, () => {
      const skewed: Record<string, number> = { Robin: 60, Leon: 0 };
      let robin = 0;
      let leon = 0;
      let previous: Pair | undefined;
      for (let i = 0; i < 15; i++) {
        const out = refillReserve([], skewed, previous);
        for (const p of out) {
          if (p[0] === "Robin" || p[1] === "Robin") robin++;
          if (p[0] === "Leon" || p[1] === "Leon") leon++;
          previous = p;
        }
      }
      assert.ok(robin > 0, "Robin (score 60) must appear");
      assert.ok(robin > leon, `Robin (${robin}) should dominate Leon (${leon})`);
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
