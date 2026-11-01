// Unit tests: APPROVED_EMAILS parsing (spec 005, contracts.md §4,
// research.md R4). Replaces the 004 alias-mapping tests entirely.
// Pure functions — the raw env value is injected, never read here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseApprovedEmails,
  isApprovedEmail,
  assertAuthConfigured,
} from "../../lib/users";

describe("parseApprovedEmails", () => {
  it("splits on commas, trims, lowercases, drops empties, dedupes", () => {
    const parsed = parseApprovedEmails(
      " Person.A@Gmail.com , person.a@gmail.com,,\tb.person@gmail.com\n,  "
    );
    assert.deepEqual(parsed, ["person.a@gmail.com", "b.person@gmail.com"]);
  });

  it("parses a single address", () => {
    assert.deepEqual(parseApprovedEmails("only@gmail.com"), [
      "only@gmail.com",
    ]);
  });

  it("throws on undefined / empty / whitespace-only config", () => {
    for (const bad of [undefined, "", " , , "]) {
      assert.throws(
        () => parseApprovedEmails(bad),
        /APPROVED_EMAILS/
      );
    }
  });
});

describe("isApprovedEmail", () => {
  const approved = ["person.a@gmail.com", "person.b@gmail.com"];

  it("matches normalized (case, whitespace)", () => {
    assert.equal(isApprovedEmail("Person.A@Gmail.com", approved), true);
    assert.equal(isApprovedEmail("  person.b@gmail.com ", approved), true);
  });

  it("rejects unapproved addresses and raw (unnormalized) list entries", () => {
    assert.equal(isApprovedEmail("stranger@gmail.com", approved), false);
    // " UNSORTED@gmail.com" against normalized list: not found.
    assert.equal(
      isApprovedEmail("UNSORTED@gmail.com", ["UNSORTED@gmail.com"]),
      false
    );
    assert.equal(isApprovedEmail("", approved), false);
  });
});

describe("assertAuthConfigured", () => {
  it("throws with the variable name on missing/empty config", () => {
    assert.throws(() => assertAuthConfigured(undefined), /APPROVED_EMAILS/);
    assert.throws(() => assertAuthConfigured(""), /APPROVED_EMAILS/);
  });

  it("accepts a one-address list and a multi-address list", () => {
    assert.doesNotThrow(() => assertAuthConfigured("a@gmail.com"));
    assert.doesNotThrow(() =>
      assertAuthConfigured(" a@gmail.com , B@gmail.com ")
    );
  });
});
