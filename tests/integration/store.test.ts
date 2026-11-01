// Integration test: vote persistence against Upstash Redis.
// Run with real credentials in the environment (see quickstart.md).
// Uses a dedicated key prefix (STORE_KEY_PREFIX) so production keys are untouched.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const runTests = Boolean(url && token);

if (!runTests) {
  console.log(
    "# SKIPPED: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set - " +
      "integration tests require real Upstash credentials (see specs/001-baby-name-voting/quickstart.md)"
  );
}

const PREFIX = `test:${Date.now()}`;
let store: typeof import("../../lib/store");

(runTests ? describe : describe.skip)("store integration (Upstash)", () => {
  before(async () => {
    process.env.STORE_KEY_PREFIX = PREFIX;
    store = await import("../../lib/store");
  });

  after(async () => {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: url!, token: token! });
    await redis.del(`${PREFIX}:scores`, `${PREFIX}:votes`);
  });

  it("recordVote persists vote atomically: audit entry + score increment", async () => {
    const before = await store.scores();
    const beforeScore = before["Felix"] ?? 0;

    await store.recordVote({ winner: "Felix", loser: "Paul", user: "A" });

    const after = await store.scores();
    assert.equal(after["Felix"], beforeScore + 1);

    // audit stream contains the vote
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: url!, token: token! });
    const range = await redis.xrange(`${PREFIX}:votes`, "-", "+");
    const flat = (Array.isArray(range) ? range : []).flat(2) as unknown[];
    const recorded = flat.some(
      (e) =>
        typeof e === "object" && e !== null && "message" in (e as object) &&
        (e as { message: { winner: string; loser: string; user: string } }).message?.winner === "Felix"
    );
    assert.ok(recorded, "vote entry must appear in the audit stream");
  });

  it("concurrent recordVote calls both persist (SC-004)", async () => {
    const before = await store.scores();
    const start = before["Noah"] ?? 0;

    await Promise.all([
      store.recordVote({ winner: "Noah", loser: "Leo", user: "A" }),
      store.recordVote({ winner: "Noah", loser: "Ben", user: "B" }),
    ]);

    const after = await store.scores();
    assert.equal(after["Noah"], start + 2, "both concurrent votes must count");
  });
});
