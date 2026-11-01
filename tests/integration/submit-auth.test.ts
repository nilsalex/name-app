// Integration test (spec 004 US2, T015): an unauthenticated submitVote must
// be rejected and must issue ZERO store writes. Runs without credentials:
// lib/store is mocked via node:test's module mocking.
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const recordVote = mock.fn(async (vote: unknown) => vote);

// Runtime (Node 24) accepts the modern `exports` option; the pinned
// @types/node@20 only types the deprecated `namedExports`. Cast bridges
// the gap until @types/node is upgraded.
const mockOptions = {
  exports: {
    recordVote,
    scores: mock.fn(async () => ({})),
  },
} as unknown as Parameters<typeof mock.module>[1];
mock.module("../../lib/store", mockOptions);

describe("submitVote authorization (spec 004 US2)", () => {
  it("rejects an unauthenticated vote with no store write", async () => {
    // Import AFTER the mock is registered.
    const { submitVote } = await import("../../app/actions");
    // No session cookie is set in this environment -> getCurrentAlias()
    // resolves null (cookies() outside a request returns an empty store).
    const result = await submitVote("Felix", "Paul");
    assert.equal(result.ok, false);
    assert.equal(recordVote.mock.callCount(), 0);
  });

  it("still rejects an invalid name pair before auth matters", async () => {
    const { submitVote } = await import("../../app/actions");
    const result = await submitVote("Felix", "Felix");
    assert.equal(result.ok, false);
    assert.equal(recordVote.mock.callCount(), 0);
  });
});
