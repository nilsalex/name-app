// Unit tests: pure nomination logic (feature 013, T002 — Constitution III
// red-green). Written FIRST, red against the unmodified tree (module does
// not exist yet).
//
// Pins (contracts.md "lib/nomination-logic.ts", data-model.md validation
// rule 1):
// - nextUndecidedName: canonical-order first name with no decision entry;
//   null when every list name is decided.
// - decidedCount: number of decided list entries (0 for empty).
// - includedNames: "in" names in CANONICAL list order (map key order must
//   NOT matter).
// - isRoundComplete: true only when all 200 list names are decided.
// - Unknown/extra map keys not on the list are ignored by all four
//   functions (defensive, data-model.md validation rule 1).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { COLOGNE_200_BOY_NAMES } from "../../lib/names";
import {
  nextUndecidedName,
  decidedCount,
  includedNames,
  isRoundComplete,
  type NominationDecision,
} from "../../lib/nomination-logic";

const LIST = COLOGNE_200_BOY_NAMES;

/** All 200 names mapped to the given decision. */
function fullDecisions(
  value: NominationDecision = "in"
): Record<string, NominationDecision> {
  return Object.fromEntries(LIST.map((n) => [n, value]));
}

describe("nextUndecidedName", () => {
  it("returns the first list name for an empty map (empty → Noah)", () => {
    assert.equal(nextUndecidedName({}), "Noah");
  });

  it("skips decided names regardless of decision value", () => {
    assert.equal(nextUndecidedName({ Noah: "in" }), "Paul");
    assert.equal(nextUndecidedName({ Noah: "out", Paul: "out" }), "Leon");
    assert.equal(
      nextUndecidedName({ Noah: "in", Paul: "out", Leon: "in" }),
      "Felix"
    );
  });

  it("resumes at the first undecided name in canonical order (FR-005)", () => {
    // Exactly the first 37 names decided (mixed values); every later name
    // still undecided → next is LIST[37], regardless of decided values.
    const decisions: Record<string, NominationDecision> = {};
    for (const [i, name] of LIST.slice(0, 37).entries()) {
      decisions[name] = i % 2 === 0 ? "in" : "out";
    }
    assert.equal(decidedCount(decisions), 37);
    assert.equal(nextUndecidedName(decisions), LIST[37]);
  });

  it("returns null when every list name is decided", () => {
    assert.equal(nextUndecidedName(fullDecisions("out")), null);
  });

  it("ignores unknown/extra map keys not on the list (rule 1)", () => {
    assert.equal(nextUndecidedName({ "Not On List": "in" }), "Noah");
    const withExtra = fullDecisions("in");
    (withExtra as Record<string, string>)["Mystery"] = "in";
    assert.equal(nextUndecidedName(withExtra), null);
  });
});

describe("decidedCount", () => {
  it("counts zero for an empty map", () => {
    assert.equal(decidedCount({}), 0);
  });

  it("counts decided entries", () => {
    assert.equal(decidedCount({ Noah: "in", Paul: "out", Leon: "in" }), 3);
  });

  it("counts 200 when every list name is decided", () => {
    assert.equal(decidedCount(fullDecisions("in")), LIST.length);
    assert.equal(LIST.length, 200);
  });

  it("ignores unknown/extra map keys not on the list (rule 1)", () => {
    assert.equal(decidedCount({ Noah: "in", "Not On List": "in" }), 1);
  });
});

describe("includedNames", () => {
  it("returns an empty array for an empty map", () => {
    assert.deepEqual(includedNames({}), []);
  });

  it("returns only the in-names, in canonical list order", () => {
    // Map keys inserted in REVERSE order — output order must follow the
    // canonical list, not the map's key order.
    const decisions: Record<string, NominationDecision> = {
      Felix: "in",
      Leon: "out",
      Paul: "in",
      Noah: "in",
    };
    assert.deepEqual(includedNames(decisions), ["Noah", "Paul", "Felix"]);
  });

  it("map key insertion order must NOT matter", () => {
    const a: Record<string, NominationDecision> = { Noah: "in", Paul: "in" };
    const b: Record<string, NominationDecision> = { Paul: "in", Noah: "in" };
    assert.deepEqual(includedNames(a), includedNames(b));
  });

  it("ignores unknown/extra map keys not on the list (rule 1)", () => {
    assert.deepEqual(includedNames({ Noah: "in", "Not On List": "in" }), [
      "Noah",
    ]);
  });

  it("equals the full list when everything is in", () => {
    assert.deepEqual(includedNames(fullDecisions("in")), LIST);
  });
});

describe("isRoundComplete", () => {
  it("is false for an empty map", () => {
    assert.equal(isRoundComplete({}), false);
  });

  it("is false for a partial round", () => {
    assert.equal(isRoundComplete({ Noah: "in", Paul: "out" }), false);
  });

  it("is true only when all 200 list names are decided", () => {
    assert.equal(isRoundComplete(fullDecisions("out")), true);
    assert.equal(isRoundComplete(fullDecisions("in")), true);
  });

  it("stays false when a list name is missing, even with extra keys", () => {
    const almost = fullDecisions("in");
    delete almost["Noah"];
    (almost as Record<string, string>)["Extra"] = "in";
    assert.equal(isRoundComplete(almost), false);
  });

  it("does not mutate the input map (project convention)", () => {
    const decisions = { Noah: "in" } as Record<string, NominationDecision>;
    nextUndecidedName(decisions);
    decidedCount(decisions);
    includedNames(decisions);
    isRoundComplete(decisions);
    assert.deepEqual(decisions, { Noah: "in" });
  });
});
