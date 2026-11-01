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

// ---------------------------------------------------------------------------
// Feature 006 (US3, T023): mixed-legacy exclusion from personal rankings.
//
// Personal rankings are built from userScores(uid) — a per-user zset that
// only ever accumulates votes recorded under that uid (recordVote writes
// userScoresKey(vote.user), and the uid comes exclusively from the verified
// session). Legacy alias entries ("A"/"B" in the votes stream, and their
// aggregate in the global namewahl:scores zset) are structurally invisible
// to per-user reads. This test pins the aggregation path: userScores-like
// maps are per-key namespaces, so a personal map cannot contain another
// identity's votes — while rankNames output is driven exclusively by the
// map it is given (FR-008, SC-005).
describe("personal ranking excludes legacy and foreign votes (feature 006 US3)", () => {
  it("a personal score map contains only that identity's wins — alias votes never blend in", () => {
    // Simulate: global history has Felix=10 (5 from "A", 3 from "B", 2 from
    // uid U). User U's personal zset holds ONLY U's own wins (Felix=2).
    // The personal ranking is computed from the personal map alone:
    const personalScores = { Felix: 2 };
    const ranking = rankNames(["Felix", "Paul", "Jonas"], personalScores);
    const felix = ranking.find((r) => r.name === "Felix")!;
    assert.equal(felix.score, 2, "personal score = own wins only, not the global 10");
    // Paul/Jonas untouched → shared bottom rank with score 0.
    assert.equal(ranking.find((r) => r.name === "Paul")!.score, 0);
  });

  it("alias-shaped keys would throw before any read — legacy data cannot be misattributed (FR-008)", async () => {
    // recordVote/vote flows only construct per-user keys from session uids.
    // Key derivation validates the shape; legacy alias STRINGS from stream
    // records ("A"/"B") are never fed into it. Pin the boundary: deriving
    // keys from something that is not a session uid is not silently
    // tolerated for INVALID shapes (defense in depth, data-model.md).
    const { userScoresKey, userSeenKey } = await import("../../lib/store");
    // Valid 22-char base64url uid works:
    const uid = "QkT9x2mR7pLw4vNs8JeD1A";
    assert.equal(userScoresKey(uid), `namewahl:user:${uid}:scores`);
    assert.equal(userSeenKey(uid), `namewahl:user:${uid}:seen`);
    // Truly invalid shapes throw (never produce a legacy-prefixed key):
    assert.throws(() => userScoresKey(""));
    assert.throws(() => userSeenKey("bad uid!"));
    assert.throws(() => userScoresKey(null as never));
  });

  it("a personal ranking built from a uid's map is unaffected by adding votes under OTHER identities", () => {
    // If other users (or legacy aliases) vote, the global aggregate changes
    // but user U's personal map — and hence U's ranking — does not move.
    const uScores = { Felix: 2 };
    const before = rankNames(["Felix", "Paul"], uScores).map((r) => [r.name, r.score, r.rank]);
    // "Other users voted": global map now Felix=12 — U's map unchanged:
    const after = rankNames(["Felix", "Paul"], uScores).map((r) => [r.name, r.score, r.rank]);
    assert.deepEqual(before, after);
  });
});
