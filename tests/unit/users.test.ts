// Unit tests: approved-address -> alias mapping (spec 004, contracts.md §4).
// Pure module with injectable env record — no process.env access here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aliasForEmail } from "../../lib/users";

const env = {
  APPROVED_USER_A_EMAIL: "person.a@gmail.com",
  APPROVED_USER_B_EMAIL: "person.b@gmail.com",
};

describe("aliasForEmail", () => {
  it("maps the approved A address to alias A", () => {
    assert.equal(aliasForEmail("person.a@gmail.com", env), "A");
  });

  it("maps the approved B address to alias B", () => {
    assert.equal(aliasForEmail("person.b@gmail.com", env), "B");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    assert.equal(aliasForEmail("  Person.A@GMAIL.COM ", env), "A");
    assert.equal(aliasForEmail("PERSON.B@Gmail.com", env), "B");
  });

  it("returns null for a non-approved address", () => {
    assert.equal(aliasForEmail("stranger@gmail.com", env), null);
  });

  it("returns null for an empty or missing email", () => {
    assert.equal(aliasForEmail("", env), null);
    assert.equal(
      aliasForEmail("", { APPROVED_USER_A_EMAIL: "", APPROVED_USER_B_EMAIL: "" }),
      null
    );
  });

  it("returns null (not a throw) when the address config is missing entirely", () => {
    assert.equal(aliasForEmail("person.a@gmail.com", {}), null);
  });
});
