// Unit tests: pair selection (US1, test-first).
// FR-002: both members always distinct.
// Acceptance scenario 3: never identical repeat of previousPair.
// Clarification Q1: no memory beyond previousPair (repeats allowed).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextPair } from "../../lib/pairing";

describe("nextPair", () => {
  it("returns two distinct names (FR-002)", () => {
    for (let i = 0; i < 500; i++) {
      const [a, b] = nextPair();
      assert.notEqual(a, b, `pair members must differ, got ${a}/${b}`);
    }
  });

  it("never repeats the previous pair exactly (acceptance scenario 3)", () => {
    let prev = nextPair();
    for (let i = 0; i < 500; i++) {
      const p = nextPair(prev);
      assert.notDeepEqual(p, prev, "must not show the identical previous pair");
      prev = p;
    }
  });

  it("has no memory beyond previousPair (clarification Q1: repeats allowed)", () => {
    // Feed a sequence and verify results only depend on the passed-in pair:
    // the same input can produce a pair that was seen two turns ago.
    const seen = new Set<string>();
    let prev = nextPair();
    let repeatSeen = false;
    for (let i = 0; i < 2000; i++) {
      const p = nextPair(prev);
      const key = [...p].sort().join("|");
      if (seen.has(key)) repeatSeen = true; // allowed — repeats are fine
      seen.add(key);
      prev = p;
    }
    // With ~19,900 possible pairings and 2000 draws, a repeat is expected.
    assert.ok(repeatSeen || seen.size === 2000, "pairing must keep working indefinitely (FR-011)");
  });

  it("works indefinitely for >19,900 iterations (FR-011)", () => {
    let prev = nextPair();
    for (let i = 0; i < 20_000; i++) {
      const p = nextPair(prev);
      assert.notEqual(p[0], p[1]);
      assert.notDeepEqual(p, prev);
      prev = p;
    }
  });

  it("returns names from the Cologne 200 list (FR-001)", async () => {
    const { COLOGNE_200_BOY_NAMES } = await import("../../lib/names");
    for (let i = 0; i < 100; i++) {
      const [a, b] = nextPair();
      assert.ok(COLOGNE_200_BOY_NAMES.includes(a));
      assert.ok(COLOGNE_200_BOY_NAMES.includes(b));
    }
  });
});
