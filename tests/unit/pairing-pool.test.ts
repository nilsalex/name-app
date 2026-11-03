// Unit tests: pool-constrained pair drafting (feature 013, T012 —
// Constitution III red-green, written FIRST against the pre-pool API).
//
// Pins (contracts.md "lib/pairing.ts"):
// - pickUnderseenPair(previousPair, seen, pool) with a tiny pool over many
//   draws produces ONLY pool names (SC-004/FR-007), distinct members, and
//   never repeats previousPair in either order.
// - With seen counts it still prefers under-seen pool names (weight
//   semantics 1/(1+seen) unchanged WITHIN the pool).
// - Omitting the pool argument reproduces the existing full-list behavior
//   exactly (zero-drift contract — the existing pairing tests stay green
//   unchanged).
// - refillReserve(reserve, seen, lastPair, pool) drafts all BATCH_SIZE
//   pairs from the pool only.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickUnderseenPair, type Pair } from "../../lib/pairing";
import { refillReserve, BATCH_SIZE } from "../../lib/pair-queue";

const POOL = ["Noah", "Paul", "Leon", "Felix"];

describe("pickUnderseenPair with a pool (T012, feature 013)", () => {
  it("drafts ONLY pool names across 200 draws (SC-004/FR-007)", () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = pickUnderseenPair(undefined, {}, POOL);
      assert.ok(POOL.includes(a), `drafted non-pool name ${a}`);
      assert.ok(POOL.includes(b), `drafted non-pool name ${b}`);
    }
  });

  it("keeps both members distinct", () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = pickUnderseenPair(undefined, {}, POOL);
      assert.notEqual(a, b);
    }
  });

  it("never repeats previousPair in either order", () => {
    let prev: Pair = pickUnderseenPair(undefined, {}, POOL);
    for (let i = 0; i < 200; i++) {
      const p = pickUnderseenPair(prev, {}, POOL);
      const same =
        (p[0] === prev[0] && p[1] === prev[1]) ||
        (p[0] === prev[1] && p[1] === prev[0]);
      assert.ok(!same, `repeated previous pair ${prev} as ${p}`);
      prev = p;
    }
  });

  it("prefers under-seen pool names (weight semantics unchanged within the pool)", () => {
    // seen = 9 for "Noah" (weight 0.1), 0 for the rest (weight 1.0).
    // Across 4000 draws, "Noah" must stay far below the ~25% uniform share
    // and the others must dominate — any full-list leak or weight drift
    // would break this band (statistical, generous margins).
    let noah = 0;
    const draws = 4000;
    for (let i = 0; i < draws; i++) {
      const [a, b] = pickUnderseenPair(undefined, { Noah: 9 }, POOL);
      if (a === "Noah" || b === "Noah") noah++;
    }
    // Uniform-within-pool pair presence would be 2/4 = 50%; weighted the
    // Noah share is ~2*0.1/(0.1+3) ≈ 6.5%. Band: strictly below 20%.
    assert.ok(
      noah / draws < 0.2,
      `Noah appeared in ${(noah / draws * 100).toFixed(1)}% of pairs — under-seen weighting violated`
    );
  });

  it("omitting the pool argument keeps full-list behavior (zero drift)", () => {
    // Without a pool, ANY of the 200 names must remain reachable; with a
    // 10k-draw sample across the full list, many distinct names appear —
    // pinning that no pool constraint is silently applied.
    const distinct = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const [a, b] = pickUnderseenPair();
      distinct.add(a);
      distinct.add(b);
    }
    assert.ok(distinct.size > 100, `only ${distinct.size} distinct names drafted`);
  });
});

describe("refillReserve with a pool (T012, feature 013)", () => {
  it("drafts all BATCH_SIZE pairs from the pool only", () => {
    const batches = refillReserve([], {}, undefined, POOL);
    assert.equal(batches.length, BATCH_SIZE);
    for (const [a, b] of batches) {
      assert.ok(POOL.includes(a), `non-pool name ${a}`);
      assert.ok(POOL.includes(b), `non-pool name ${b}`);
      assert.notEqual(a, b);
    }
  });

  it("accumulates in-batch seen within the pool (self-balancing preserved)", () => {
    // A 3-name pool with an in-batch accumulation must still terminate and
    // spread draws across all three names (weights stay positive).
    const small = ["Noah", "Paul", "Leon"];
    const batches = refillReserve([], {}, undefined, small);
    assert.equal(batches.length, BATCH_SIZE);
    const drafted = new Set(batches.flat());
    assert.ok(drafted.size >= 2, "batch must spread across pool names");
  });
});
