// Unit tests for per-user store additions (feature 006, Phase 2 + US2/US3).
//
// Covers:
// - Key derivation with isUserIdShape guard (T002/T003, data-model.md):
//   `namewahl:user:<uid>:scores` / `:seen`, throw on invalid uid shapes,
//   never produce legacy-shaped keys (FR-008 defense in depth).
// - userScores parse + empty-state (T004/T005, INV: fresh user → {}).
// - recordVote 3-command pipeline (T006/T007, INV-3): xadd + global
//   zincrby + per-user zincrby in ONE pipeline.
// - bumpUserSeen single-writer pipeline (T018/T019, INV-4): one zincrby
//   per DISTINCT name, errors swallowed + logged.
// - Key isolation across uids (T024, INV-2).
//
// The Redis client is replaced via an in-memory fake bound through the
// module's test seam (client override), avoiding real network I/O.
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  userScoresKey,
  userSeenKey,
  userScores,
  userSeen,
  recordVote,
  bumpUserSeen,
  _setClientForTests,
} from "../../lib/store";
import { isUserIdShape } from "../../lib/user-ids";

// ---------------------------------------------------------------------------
// In-memory fake Redis client: records the pipeline command sequence.
// ---------------------------------------------------------------------------

interface RecordedCommand {
  op: "xadd" | "zincrby";
  args: unknown[];
}

interface FakeClient {
  pipelineCalls: RecordedCommand[][];
  // backing data for reads
  zsets: Map<string, Record<string, number>>;
}

function fakeClient(): FakeClient & { client: unknown } {
  const state: FakeClient = { pipelineCalls: [], zsets: new Map() };
  const client = {
    pipeline() {
      const calls: RecordedCommand[] = [];
      state.pipelineCalls.push(calls);
      return {
        xadd(key: string, id: string, fields: unknown) {
          calls.push({ op: "xadd", args: [key, id, fields] });
          return this;
        },
        zincrby(key: string, delta: number, member: string) {
          calls.push({ op: "zincrby", args: [key, delta, member] });
          return this;
        },
        async exec() {
          // Apply zincrby effects to backing zsets so reads can verify.
          for (const c of calls) {
            if (c.op === "zincrby") {
              const [key, delta, member] = c.args as [string, number, string];
              const z = state.zsets.get(key) ?? {};
              z[member] = (z[member] ?? 0) + delta;
              state.zsets.set(key, z);
            }
          }
          return calls.map(() => null);
        },
      };
    },
    async zrange(key: string, _start: number, _stop: number, _opts?: unknown) {
      const z = state.zsets.get(key) ?? {};
      const flat: Array<string | number> = [];
      for (const [member, score] of Object.entries(z)) flat.push(member, score);
      return flat;
    },
  };
  return Object.assign(state, { client });
}

let currentFake: ReturnType<typeof fakeClient> | null = null;
afterEach(() => {
  _setClientForTests(null);
  currentFake = null;
});

function withFake(): ReturnType<typeof fakeClient> {
  currentFake = fakeClient();
  _setClientForTests(currentFake.client as never);
  return currentFake;
}

// ---------------------------------------------------------------------------
// Key derivation (T002/T003)
// ---------------------------------------------------------------------------

describe("per-user key derivation (T002/T003)", () => {
  it("derives the documented per-user keys", () => {
    const uid = "abc123def456ghi789jklm"; // 22-char base64url shape
    assert.equal(userScoresKey(uid), `namewahl:user:${uid}:scores`);
    assert.equal(userSeenKey(uid), `namewahl:user:${uid}:seen`);
  });

  it("throws on uids failing isUserIdShape (defense in depth)", () => {
    for (const bad of ["", null, undefined, 42, "a".repeat(65), "bad uid!"]) {
      assert.throws(() => userScoresKey(bad as never));
      assert.throws(() => userSeenKey(bad as never));
    }
  });

  it("legacy aliases never become per-user keys (FR-008)", () => {
    // "A"/"B" are 1-char strings — they PASS the shape check in isolation,
    // so the guard must be the session-only uid source; here we pin that
    // derived keys are always namespaced under namewahl:user: and can
    // never equal a legacy top-level key.
    const keys = new Set([
      "namewahl:scores",
      "namewahl:votes",
      "namewahl:users",
      "namewahl:users:nextnum",
    ]);
    for (const alias of ["A", "B"]) {
      assert.ok(!keys.has(userScoresKey(alias)));
      assert.ok(!keys.has(userSeenKey(alias)));
    }
    // And the shape check is still what guards derivation:
    assert.equal(isUserIdShape("A"), true); // shape-wise valid...
    // ...so recordVote's uid must come exclusively from getCurrentUid()
    // (integration-pinned in tests/integration/submit-auth.test.ts).
  });
});

// ---------------------------------------------------------------------------
// userScores / userSeen reads (T004/T005, T020)
// ---------------------------------------------------------------------------

describe("userScores / userSeen reads (T004/T005/T020)", () => {
  it("parses the flat zrange array into a score map", async () => {
    const fake = withFake();
    const uid = "uid-parse-test-0000000001";
    const scoresKey = userScoresKey(uid);
    fake.zsets.set(scoresKey, { Felix: 3, Paul: 1 });
    const result = await userScores(uid);
    assert.deepEqual(result, { Felix: 3, Paul: 1 });
  });

  it("returns {} for a user with no votes yet (fresh user, US1 AC3)", async () => {
    withFake();
    const result = await userScores("uid-empty-000000000000001");
    assert.deepEqual(result, {});
  });

  it("userSeen returns {} when nothing has been drafted", async () => {
    withFake();
    const result = await userSeen("uid-empty-000000000000001");
    assert.deepEqual(result, {});
  });

  it("parses seen counts from the seen zset", async () => {
    const fake = withFake();
    const uid = "uid-seen-parse-000000001";
    fake.zsets.set(userSeenKey(uid), { Felix: 7, Emil: 2 });
    assert.deepEqual(await userSeen(uid), { Felix: 7, Emil: 2 });
  });

  it("throws on invalid uid shapes before touching Redis", async () => {
    withFake();
    await assert.rejects(() => userScores("bad uid!"));
    await assert.rejects(() => userSeen("bad uid!"));
  });
});

// ---------------------------------------------------------------------------
// recordVote pipeline (T006/T007, INV-3)
// ---------------------------------------------------------------------------

describe("recordVote 3-command pipeline (T006/T007, INV-3)", () => {
  it("issues xadd + global zincrby + per-user zincrby in ONE pipeline", async () => {
    const fake = withFake();
    const uid = "uid-vote-pipe-0000000001";
    await recordVote({ winner: "Felix", loser: "Paul", user: uid });

    assert.equal(fake.pipelineCalls.length, 1, "exactly one pipeline round trip");
    const calls = fake.pipelineCalls[0];
    assert.equal(calls.length, 3, "exactly three chained commands");
    assert.equal(calls[0].op, "xadd");
    const [votesKey, , fields] = calls[0].args as [string, string, Record<string, string>];
    assert.equal(votesKey, "namewahl:votes");
    assert.equal(fields.winner, "Felix");
    assert.equal(fields.loser, "Paul");
    assert.equal(fields.user, uid);
    assert.ok(typeof fields.at === "string");

    assert.equal(calls[1].op, "zincrby");
    assert.deepEqual(calls[1].args[0], "namewahl:scores"); // global, kept
    assert.equal(calls[1].args[1], 1);
    assert.equal(calls[1].args[2], "Felix");

    assert.equal(calls[2].op, "zincrby");
    assert.deepEqual(calls[2].args[0], userScoresKey(uid)); // per-user tally
    assert.equal(calls[2].args[1], 1);
    assert.equal(calls[2].args[2], "Felix");

    // Applied effect readable through userScores.
    assert.deepEqual(await userScores(uid), { Felix: 1 });
  });
});

// ---------------------------------------------------------------------------
// bumpUserSeen (T018/T019, INV-4 single-writer)
// ---------------------------------------------------------------------------

describe("bumpUserSeen single-writer pipeline (T018/T019, INV-4)", () => {
  it("issues one zincrby per DISTINCT name against the seen key", async () => {
    const fake = withFake();
    const uid = "uid-seen-bump-00000001";
    await bumpUserSeen(uid, ["Felix", "Paul", "Felix", "Emil", "Paul", "Felix"]);

    const calls = fake.pipelineCalls[0];
    // 3 distinct names → 3 commands, one pipeline.
    assert.equal(fake.pipelineCalls.length, 1);
    assert.equal(calls.length, 3);
    for (const c of calls) {
      assert.equal(c.op, "zincrby");
      assert.equal(c.args[0], userSeenKey(uid));
      assert.equal(c.args[1], 1);
    }
    const members = calls.map((c) => c.args[2]).sort();
    assert.deepEqual(members, ["Emil", "Felix", "Paul"]);

    assert.deepEqual(await userSeen(uid), { Emil: 1, Felix: 1, Paul: 1 });
  });

  it("swallows and logs bump errors (availability wins)", async () => {
    withFake();
    const uid = "uid-seen-err-00000001";
    // Replace the client with one whose pipeline exec throws.
    _setClientForTests({
      pipeline() {
        return {
          zincrby() {
            return this;
          },
          async exec() {
            throw new Error("upstash down");
          },
        };
      },
    } as never);
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      await bumpUserSeen(uid, ["Felix"]); // must NOT throw
    } finally {
      console.error = orig;
    }
    assert.equal(errors.length, 1, "error logged exactly once");
  });

  it("no-ops on an empty batch without touching Redis", async () => {
    const fake = withFake();
    await bumpUserSeen("uid-seen-empty-0000001", []);
    assert.equal(fake.pipelineCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Key isolation (T024, INV-2)
// ---------------------------------------------------------------------------

describe("key isolation across uids (T024, INV-2)", () => {
  it("distinct uids yield disjoint keys, never legacy keys", () => {
    const uid1 = "uid-one-aaaaaaaaaaaaaaaa";
    const uid2 = "uid-two-bbbbbbbbbbbbbbbb";
    const keys = [
      userScoresKey(uid1),
      userSeenKey(uid1),
      userScoresKey(uid2),
      userSeenKey(uid2),
    ];
    assert.equal(new Set(keys).size, 4);
    for (const k of keys) {
      assert.ok(k.startsWith("namewahl:user:"));
      assert.ok(!["namewahl:scores", "namewahl:votes", "namewahl:users", "namewahl:users:nextnum"].includes(k));
    }
  });
});
