// Unit tests: reset-target derivation (feature 014 T002 — Constitution III
// red-green, written FIRST; the module lib/reset-store.ts does not exist
// yet, so this file MUST fail to collect before T003).
//
// Pins (contracts.md "lib/reset-store.ts", data-model.md ResetTargets):
// - `resetTargets(uid, "votes")`        → [userScoresKey(uid), userSeenKey(uid)]
//     (personal win tally + seen-frequency — research R1; seen is included
//     because it is a pure function of the deleted vote history, FR-003).
// - `resetTargets(uid, "nominations")`  → [nominationKey(uid)]
// - `resetTargets(uid, "all")`          → deterministic order
//     scores → seen → nominations (data-model.md ResetTargets).
// - Key strings are composed from the EXISTING exported builders
//   `userScoresKey`/`userSeenKey` (lib/store.ts) and `nominationKey`
//   (lib/nomination-store.ts) — asserted against those builders' outputs,
//   never literal strings (no duplicated key formats).
// - `resetTargets` throws on invalid uid shapes (key-safety guard,
//   data-model.md validation rule 1 — same rule as the key builders).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { userScoresKey, userSeenKey } from "../../lib/store";
import { nominationKey } from "../../lib/nomination-store";
import { resetTargets } from "../../lib/reset-store";

const UID = "abc123def456ghi789jklm"; // 22-char base64url shape

afterEach(() => {
  // reset-store is pure — no client injection to reset; kept for symmetry
  // with the other store suites.
});

describe("resetTargets derivation (T002, feature 014)", () => {
  it('"votes" returns exactly [userScoresKey, userSeenKey] in pipeline order (R1)', () => {
    assert.deepEqual(resetTargets(UID, "votes"), [
      userScoresKey(UID),
      userSeenKey(UID),
    ]);
  });

  it('"nominations" returns exactly [nominationKey]', () => {
    assert.deepEqual(resetTargets(UID, "nominations"), [nominationKey(UID)]);
  });

  it('"all" returns all three in the deterministic order scores → seen → nominations', () => {
    const targets = resetTargets(UID, "all");
    assert.deepEqual(targets, [
      userScoresKey(UID),
      userSeenKey(UID),
      nominationKey(UID),
    ]);
    // Deterministic: repeated calls give identical lists.
    assert.deepEqual(resetTargets(UID, "all"), targets);
  });

  it("throws on invalid uid shapes (data-model.md rule 1)", () => {
    for (const bad of ["", "not a uid!", "bad uid!", "a".repeat(65), null, undefined, 42]) {
      for (const variant of ["votes", "nominations", "all"] as const) {
        assert.throws(
          // Safety: deliberately probing invalid shapes through the guard.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          () => resetTargets(bad as never, variant)
        );
      }
    }
  });
});
