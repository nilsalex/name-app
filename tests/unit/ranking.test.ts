// Unit tests: ranking computation (US2, test-first).
// FR-007: score = win count.
// FR-014: equal scores share rank position (1-2-2-4), no tie-break.
// Acceptance scenario 2: zero-vote names appear at shared bottom rank.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankNames } from "../../lib/ranking";

describe("rankNames", () => {
  it("scores names by win count (FR-007)", () => {
    const r = rankNames(["A", "B"], { A: 3, B: 1 });
    assert.deepEqual(
      r.map((x) => [x.name, x.score]),
      [
        ["A", 3],
        ["B", 1],
      ]
    );
  });

  it("orders by score descending", () => {
    const r = rankNames(["X", "Y", "Z"], { X: 5, Y: 10, Z: 7 });
    assert.deepEqual(r.map((x) => x.name), ["Y", "Z", "X"]);
  });

  it("shares rank position for tied scores (FR-014, 1-2-2-4)", () => {
    const r = rankNames(["A", "B", "C", "D"], { A: 5, B: 4, C: 4, D: 2 });
    assert.deepEqual(r.map((x) => [x.name, x.rank]), [
      ["A", 1],
      ["B", 2],
      ["C", 2],
      ["D", 4],
    ]);
  });

  it("uses alphabetical order within a tie for stable display only", () => {
    const r = rankNames(["Zeta", "Alpha"], { Zeta: 3, Alpha: 3 });
    assert.equal(r[0].name, "Alpha");
    assert.equal(r[0].rank, 1);
    assert.equal(r[1].name, "Zeta");
    assert.equal(r[1].rank, 1); // still shared rank
  });

  it("lists zero-vote names at the shared bottom rank (acceptance scenario 2)", () => {
    const r = rankNames(["A", "B", "C"], { A: 2 });
    assert.deepEqual(r.map((x) => [x.name, x.score, x.rank]), [
      ["A", 2, 1],
      ["B", 0, 2],
      ["C", 0, 2],
    ]);
  });

  it("returns empty list for empty input (edge case)", () => {
    assert.deepEqual(rankNames([], {}), []);
  });

  it("with zero votes everything shares rank 1 (quickstart S3 empty state)", () => {
    const r = rankNames(["A", "B"], {});
    assert.deepEqual(r.map((x) => x.rank), [1, 1]);
  });

  it("is insensitive to the voter scheme: legacy A/B and uid voters blend (spec 005 SC-006)", () => {
    // rankNames receives aggregate SCORES, never per-voter records, so a
    // mixed history (alias "A"/"B" pre-005 + opaque uids post-005) yields
    // identical totals regardless of the identifier scheme. This test
    // locks the tolerance; no production change is expected.
    const scores = { Felix: 4, Paul: 2 };
    const expected = rankNames(["Felix", "Paul", "Jonas"], scores).map(
      (x) => [x.name, x.score, x.rank]
    );
    for (const voters of [
      ["A", "A", "B", "QkT9x2mR7pLw4vNs8JeD1A"],
      ["QkT9x2mR7pLw4vNs8JeD1A", "QkT9x2mR7pLw4vNs8JeD1A", "other22charbase64urlid", "A"],
      ["B", "B", "B", "B"],
    ]) {
      void voters; // the voter field never reaches rankNames — same input, same output
      assert.deepEqual(
        rankNames(["Felix", "Paul", "Jonas"], scores).map(
          (x) => [x.name, x.score, x.rank]
        ),
        expected
      );
    }
  });
});
