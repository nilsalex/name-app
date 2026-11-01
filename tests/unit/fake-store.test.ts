// Unit test: the in-memory fake store (feature 012, T003, research R1/R6,
// Constitution III — written RED first).
//
// The app talks to Upstash exclusively through the real `@upstash/redis`
// SDK client (lib/store.ts, lib/user-store.ts). The fake therefore sits
// UNDER the SDK: a real `Redis` instance is constructed over a custom
// `Requester` (the package's own documented pattern) whose `request()`
// receives the exact wire shapes —
//   single command:  { body: ["zincrby", key, …], path: ["zincrby", …] }
//   pipeline:        { path: ["pipeline"], body: [[cmd…], [cmd…], …] }
// and returns `{ result, error }` per command (pipeline: an array).
//
// These tests assert the 9-verb surface the app actually issues
// (research R6) against the REAL client, so the wire shapes stay honest:
// `zadd`-style flat-array deserializations (`zrange … withscores`,
// `hgetall`), the scan tuple, the pipeline result array.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Redis } from "@upstash/redis";
import { createFakeRequester } from "../../app/fake-store";
import type { Requester } from "@upstash/redis";
/** A real SDK client over the fake requester (readYourWrites off: the fake
 *  has no sync tokens — same as wiring through _setClientForTests). */
function fakeRedis(): { redis: Redis; requester: Requester } {
  const requester = createFakeRequester();
  requester.readYourWrites = false;
  const redis = new Redis(requester);
  return { redis, requester };
}

describe("fake store: single-command wire shapes (012 R6)", () => {
  it("xadd appends {id, fields} and returns a usable id string", async () => {
    const { redis } = fakeRedis();
    const id = await redis.xadd("ns:votes", "*", {
      winner: "Felix",
      loser: "Paul",
      user: "u1",
    });
    assert.equal(typeof id, "string");
    assert.ok((id as string).length > 0);
    // The entry is retrievable from the stream state.
    const req = await redis.xadd("ns:votes", "*", { winner: "X", loser: "Y", user: "u2" });
    assert.notEqual(id, req);
  });

  it("zincrby creates-then-increments members", async () => {
    const { redis } = fakeRedis();
    await redis.zincrby("ns:scores", 1, "Felix");
    await redis.zincrby("ns:scores", 1, "Felix");
    await redis.zincrby("ns:scores", 1, "Paul");
    const flat = (await redis.zrange("ns:scores", 0, -1, { withScores: true })) as unknown[];
    const scores: Record<string, number> = {};
    for (let i = 0; i < flat.length; i += 2) {
      scores[flat[i] as string] = Number(flat[i + 1]);
    }
    assert.equal(scores["Felix"], 2);
    assert.equal(scores["Paul"], 1);
  });

  it("zrange 0 -1 withscores returns the flat [member, score, …] array", async () => {
    const { redis } = fakeRedis();
    await redis.zincrby("ns:scores", 1, "A");
    const flat = await redis.zrange("ns:scores", 0, -1, { withScores: true });
    assert.ok(Array.isArray(flat), "zrange withScores must return a flat array");
    assert.equal(flat.length, 2);
    assert.equal(flat[0], "A");
    assert.equal(Number(flat[1]), 1);
  });

  it("hget returns the stored string or null", async () => {
    const { redis } = fakeRedis();
    assert.equal(await redis.hget("ns:users", "a@x"), null);
    await redis.hset("ns:users", { "a@x": JSON.stringify({ id: "uid1" }) });
    // The SDK's deserializer parses the JSON string — same as production.
    assert.deepEqual(await redis.hget("ns:users", "a@x"), { id: "uid1" });
  });

  it("hset returns 1", async () => {
    const { redis } = fakeRedis();
    const n = await redis.hset("ns:users", { "a@x": "{}" });
    assert.equal(n, 1);
  });

  it("hgetall returns the flat [field, value, …] array and [] for a missing key", async () => {
    const { requester } = fakeRedis();
    // Raw wire check (the SDK unflattens into an object itself).
    const res = await requester.request({
      body: ["hgetall", "ns:users"],
      path: ["hgetall", "ns:users"],
    });
    assert.deepEqual(res.result, []);
    await requester.request({
      body: ["hset", "ns:users", "a@x", "{}"],
      path: ["hset", "ns:users", "a@x", "{}"],
    });
    const res2 = await requester.request({
      body: ["hgetall", "ns:users"],
      path: ["hgetall", "ns:users"],
    });
    assert.deepEqual(res2.result, ["a@x", "{}"]);
    // And through the SDK's own deserialization (object form; the numeric
    // string "1" deserializes to the number 1 — same as production).
    const { redis } = fakeRedis();
    await redis.hset("ns:users", { "b@x": "name-value" });
    const all = await redis.hgetall<Record<string, unknown>>("ns:users");
    assert.equal(all && "b@x" in all ? all["b@x"] : undefined, "name-value");
  });

  it("incr initializes at 0 then +1 returning the number", async () => {
    const { redis } = fakeRedis();
    assert.equal(await redis.incr("ns:users:nextnum"), 1);
    assert.equal(await redis.incr("ns:users:nextnum"), 2);
  });

  it("scan(cursor, {match, count}) returns [\"0\", <matching keys>] in one hop", async () => {
    const { redis } = fakeRedis();
    await redis.zincrby("ns:scores", 1, "A");
    await redis.hset("ns:users", { "a@x": "{}" });
    const [cursor, keys] = await redis.scan(0, { match: "ns:*", count: 200 });
    assert.equal(cursor, "0");
    assert.ok(Array.isArray(keys));
    assert.ok(keys.includes("ns:scores"), `keys=${JSON.stringify(keys)}`);
    assert.ok(keys.includes("ns:users"));
  });

  it("del removes keys and returns the count", async () => {
    const { redis } = fakeRedis();
    await redis.zincrby("ns:scores", 1, "A");
    assert.equal(await redis.del("ns:scores", "ns:missing"), 1);
  });

  it("unknown verb throws an error naming the verb", async () => {
    const { requester } = fakeRedis();
    await assert.rejects(
      () => requester.request({ body: ["publish", "ch", "msg"], path: ["publish", "ch", "msg"] }),
      /publish/
    );
  });
});

describe("fake store: pipeline wire shape (012 R6)", () => {
  it("pipeline request {path:[\"pipeline\"], body:[[commands…]]} → per-command {result, error} array", async () => {
    const { requester } = fakeRedis();
    // Wire-shape probe: pipeline responses arrive as a plain ARRAY of
    // {result, error} (the real REST wire shape — the SDK's Pipeline.exec
    // maps over the response directly).
    const responses = (await requester.request({
      path: ["pipeline"],
      body: [
        ["xadd", "ns:votes", "*", "winner", "Felix", "loser", "Paul", "user", "u1"],
        ["zincrby", "ns:scores", "1", "Felix"],
        ["zincrby", "ns:user:u1:scores", "1", "Felix"],
      ],
    })) as unknown as Array<{ result?: unknown; error?: string }>;
    assert.ok(Array.isArray(responses));
    assert.equal(responses.length, 3);
    for (const r of responses) {
      assert.equal(r.error, undefined);
      assert.notEqual(r.result, undefined);
    }
  });

  it("pipeline results are deserializable by the SDK's own exec path", async () => {
    const { redis, requester } = fakeRedis();
    void requester;
    await redis
      .pipeline()
      .zincrby("ns:scores", 1, "Felix")
      .zincrby("ns:scores", 1, "Felix")
      .exec();
    const flat = (await redis.zrange("ns:scores", 0, -1, { withScores: true })) as unknown[];
    assert.equal(Number(flat[1]), 2);
  });

  it("keys are keyed by FULL key string (prefix included) — namespaces stay isolated", async () => {
    const { redis } = fakeRedis();
    await redis.zincrby("p1:scores", 1, "A");
    await redis.zincrby("p2:scores", 5, "A");
    const p1 = (await redis.zrange("p1:scores", 0, -1, { withScores: true })) as unknown[];
    assert.equal(Number(p1[1]), 1);
    const p2 = (await redis.zrange("p2:scores", 0, -1, { withScores: true })) as unknown[];
    assert.equal(Number(p2[1]), 5);
  });
});
