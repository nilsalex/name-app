// Unit tests: opaque internal user IDs (spec 005, contracts.md §4,
// research.md R1). Pure module — no env access, no I/O.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateUserId, isUserIdShape } from "../../lib/user-ids";

describe("generateUserId", () => {
  it("returns a 22-char base64url string", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateUserId();
      assert.match(id, /^[A-Za-z0-9_-]{22}$/);
    }
  });

  it("generates unique ids across 1000 generations", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateUserId());
    assert.equal(ids.size, 1000);
  });

  it("is not derived from any input (no arguments, opaque)", () => {
    // Two ids never collide even when generated "for the same" conceptual
    // user in quick succession — identity comes from entropy, not email.
    const a = generateUserId();
    const b = generateUserId();
    assert.notEqual(a, b);
  });
});

describe("isUserIdShape", () => {
  it("accepts valid generated ids", () => {
    assert.equal(isUserIdShape(generateUserId()), true);
  });

  it("accepts other opaque uid shapes (1-64 base64url chars)", () => {
    assert.equal(isUserIdShape("x"), true);
    assert.equal(isUserIdShape("A".repeat(64)), true);
  });

  it("rejects non-strings, empty, wrong charset, and >64 chars", () => {
    assert.equal(isUserIdShape(undefined), false);
    assert.equal(isUserIdShape(null), false);
    assert.equal(isUserIdShape(42), false);
    assert.equal(isUserIdShape(""), false);
    assert.equal(isUserIdShape("has spaces"), false);
    assert.equal(isUserIdShape("bad/charset"), false);
    assert.equal(isUserIdShape("bad+charset"), false);
    assert.equal(isUserIdShape("A".repeat(65)), false);
  });
});
