// Integration tests: reset persistence critical path (feature 014 T004 —
// Constitution IV red-green, written FIRST). Same `_setClientForTests`
// fake-client seam pattern as tests/integration/nomination-store.test.ts
// (no real network I/O).
//
// Pins (spec FR-001–FR-009, data-model.md, research R1):
// - deleteUserVotes deletes the user's scores+seen keys; reads return empty
//   maps afterwards (FR-003: no residue).
// - The shared `<prefix>:scores` zset and `<prefix>:votes` stream are
//   untouched (research R1: never shared/historical data).
// - uid2's keys are untouched (per-user scope, FR-001).
// - deleteUserVotes on a uid with no keys succeeds without error (FR-009 —
//   DEL is a no-op on missing keys).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  recordVote,
  bumpUserSeen,
  userScores,
  userSeen,
  _setClientForTests as _setStoreClient,
} from "../../lib/store";
import {
  deleteUserVotes,
  deleteUserNominations,
  deleteUserEverything,
  _setClientForTests as _setResetClient,
} from "../../lib/reset-store";
import {
  writeNomination,
  readNominations,
  _setClientForTests as _setNomClient,
} from "../../lib/nomination-store";

// ---------------------------------------------------------------------------
// In-memory fake Redis client covering every op the three stores use.
// ---------------------------------------------------------------------------

interface FakeState {
  zsets: Map<string, Record<string, number>>;
  hashes: Map<string, Record<string, string>>;
  streams: Map<string, unknown[]>;
  /** Commands recorded at client (non-pipeline) level, in order. */
  directCalls: string[];
  /** Recorded pipeline batches — each an array of { op, args } commands. */
  pipelineBatches: { op: string; args: unknown[] }[][];
  /** When set, every exec()* rejects (Upstash failure). */
  failPipelines: boolean;
}

function fakeClient(): { client: unknown; state: FakeState } {
  const state: FakeState = {
    zsets: new Map(),
    hashes: new Map(),
    streams: new Map(),
    directCalls: [],
    pipelineBatches: [],
    failPipelines: false,
  };
  const zor = (map: Map<string, Record<string, number>>, key: string) => {
    const z = map.get(key) ?? {};
    map.set(key, z);
    return z;
  };
  /** Applies one command against the shared state (used by pipeline exec). */
  const apply = (op: string, args: unknown[]): void => {
    if (op === "del") {
      for (const key of args as string[]) {
        state.zsets.delete(key);
        state.hashes.delete(key);
        state.streams.delete(key);
      }
    } else if (op === "xadd") {
      const [key, , fields] = args as [string, string, unknown];
      const s = state.streams.get(key) ?? [];
      state.streams.set(key, [...s, fields]);
    } else if (op === "zincrby") {
      const [key, delta, member] = args as [string, number, string];
      const z = zor(state.zsets, key);
      z[member] = (z[member] ?? 0) + delta;
    }
  };
  const client = {
    async zadd(key: string, score: number, member: string) {
      state.directCalls.push(`zadd ${key}`);
      zor(state.zsets, key)[member] = score;
      return 1;
    },
    async zrange(key: string, _start: number, _stop: number) {
      state.directCalls.push(`zrange ${key}`);
      const z = state.zsets.get(key) ?? {};
      // Flat [member, score, member, score, ...] — readZset idiom.
      const flat: string[] = [];
      for (const [m, s] of Object.entries(z)) {
        flat.push(m, String(s));
      }
      return flat;
    },
    async hset(key: string, data: Record<string, string>) {
      state.directCalls.push(`hset ${key}`);
      const h = state.hashes.get(key) ?? {};
      state.hashes.set(key, { ...h, ...data });
      return 1;
    },
    async hgetall(key: string) {
      state.directCalls.push(`hgetall ${key}`);
      return state.hashes.get(key) ?? null;
    },
    async xadd(key: string, _id: string, fields: unknown) {
      state.directCalls.push(`xadd ${key}`);
      const s = state.streams.get(key) ?? [];
      state.streams.set(key, [...s, fields]);
      return "0-1";
    },
    async del(...keys: string[]) {
      for (const key of keys) state.directCalls.push(`del ${key}`);
      let deleted = 0;
      for (const key of keys) {
        if (state.zsets.delete(key) || state.hashes.delete(key) || state.streams.delete(key)) {
          deleted++;
        }
      }
      return deleted;
    },
    pipeline() {
      const batch: { op: string; args: unknown[] }[] = [];
      state.pipelineBatches.push(batch);
      const self = {
        del(...keys: string[]) {
          for (const key of keys) batch.push({ op: "del", args: [key] });
          return self;
        },
        xadd(key: string, id: string, fields: unknown) {
          batch.push({ op: "xadd", args: [key, id, fields] });
          return self;
        },
        zincrby(key: string, delta: number, member: string) {
          batch.push({ op: "zincrby", args: [key, delta, member] });
          return self;
        },
        async exec() {
          if (state.failPipelines) {
            throw new Error("upstash down");
          }
          for (const { op, args } of batch) apply(op, args);
          return batch.map(() => "OK");
        },
      };
      return self;
    },
  };
  return { client, state };
}

let currentFake: ReturnType<typeof fakeClient> | null = null;
afterEach(() => {
  _setStoreClient(null);
  _setNomClient(null);
  _setResetClient(null);
  currentFake = null;
});

function withFake(): ReturnType<typeof fakeClient> {
  currentFake = fakeClient();
  const client = currentFake.client;
  // Every store module owns its own client slot — inject into all three.
  _setStoreClient(client);
  _setNomClient(client);
  _setResetClient(client);
  return currentFake;
}

// The seed path: recordVote/bumpUserSeen build pipelines whose exec() just
// applies the recorded commands — but the fake's pipeline exec above only
// interprets del. Seeds therefore write through the DIRECT ops (zadd/zinc
// via zadd) on the shared state maps, which the real read functions
// (userScores/userSeen/readNominations via zrange/hgetall) see; and DELs
// issued through deleteUser* pipelines must actually remove that state —
// the fake exec applies del against the same maps. To keep seeds simple
// and observable, they write directly through the fake's client methods.
//
// The seed path (recordVote / bumpUserSeen / writeNomination) goes through
// the REAL store functions — their pipelines record xadd/zincrby commands
// (hset is a direct op) that the fake's exec applies against the shared
// state maps, so the real read functions (userScores/userSeen/
// readNominations via zrange/hgetall) see the seeded data. The reset path
// under test (deleteUserVotes/Nominations/Everything) is exercised
// verbatim: its DELs flow through real pipelines and the fake applies
// them to the same maps — exactly the contract under test (right keys,
// one round-trip batch).

const UID1 = "abc123def456ghi789jklm"; // 22-char base64url shape
const UID2 = "zzz123def456ghi789jklm";

describe("reset-store votes path (T004, feature 014)", () => {
  it("deleteUserVotes empties the user's scores and seen maps (FR-003)", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    await bumpUserSeen(UID1, ["Felix", "Paul"]);

    // Sanity: data present before the reset.
    assert.ok(Object.keys(await userScores(UID1)).length > 0);
    assert.ok(Object.keys(await userSeen(UID1)).length > 0);

    await deleteUserVotes(UID1);

    assert.deepEqual(await userScores(UID1), {});
    assert.deepEqual(await userSeen(UID1), {});
  });

  it("deleteUserVotes never touches the shared global tally or audit stream (R1)", async () => {
    const fake = withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    const globalKey = "namewahl:scores";
    const streamKey = "namewahl:votes";

    await deleteUserVotes(UID1);

    assert.ok(Object.keys(fake.state.zsets.get(globalKey) ?? {}).length > 0);
    assert.ok((fake.state.streams.get(streamKey) ?? []).length > 0);
  });

  it("deleteUserVotes leaves another user's keys untouched (FR-001)", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    await recordVote({ winner: "Noah", loser: "Leo", user: UID2 });

    await deleteUserVotes(UID1);

    assert.ok(Object.keys(await userScores(UID2)).length > 0);
    assert.deepEqual(await userScores(UID1), {});
  });

  it("deleteUserVotes on a uid with no keys succeeds (FR-009)", async () => {
    withFake();
    await deleteUserVotes(UID1);
    assert.deepEqual(await userScores(UID1), {});
  });

  it("deleteUserVotes throws when Upstash fails (pipeline error propagates)", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    const fake = withFake();
    fake.state.failPipelines = true;
    await assert.rejects(() => deleteUserVotes(UID1));
  });
});

describe("reset-store nominations path (T012, feature 014)", () => {
  it("deleteUserNominations empties the user's decisions (FR-004)", async () => {
    withFake();
    await writeNomination(UID1, "Noah", "in");
    assert.deepEqual(await readNominations(UID1), { Noah: "in" });

    await deleteUserNominations(UID1);

    assert.deepEqual(await readNominations(UID1), {});
  });

  it("deleteUserNominations NEVER deletes votes (FR-005)", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    // seen-frequency's single writer is the batch/refill path (research
    // 014-R1 / 006-R4) — seed it the same way production populates it.
    await bumpUserSeen(UID1, ["Felix", "Paul"]);
    await writeNomination(UID1, "Noah", "in");

    await deleteUserNominations(UID1);

    assert.ok(Object.keys(await userScores(UID1)).length > 0);
    assert.ok(Object.keys(await userSeen(UID1)).length > 0);
    assert.deepEqual(await readNominations(UID1), {});
  });

  it("deleteUserNominations leaves uid2's decisions untouched (FR-002)", async () => {
    withFake();
    await writeNomination(UID1, "Noah", "in");
    await writeNomination(UID2, "Ben", "out");

    await deleteUserNominations(UID1);

    assert.deepEqual(await readNominations(UID2), { Ben: "out" });
    assert.deepEqual(await readNominations(UID1), {});
  });
});

describe("reset-store everything path (T016, feature 014)", () => {
  it("deleteUserEverything empties all three maps (US3)", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    await bumpUserSeen(UID1, ["Felix", "Paul"]);
    await writeNomination(UID1, "Noah", "in");

    await deleteUserEverything(UID1);

    assert.deepEqual(await userScores(UID1), {});
    assert.deepEqual(await userSeen(UID1), {});
    assert.deepEqual(await readNominations(UID1), {});
  });

  it("deleteUserEverything leaves uid2's keys untouched", async () => {
    withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    await writeNomination(UID1, "Noah", "in");
    await recordVote({ winner: "Noah", loser: "Leo", user: UID2 });
    await writeNomination(UID2, "Ben", "out");

    await deleteUserEverything(UID1);

    assert.ok(Object.keys(await userScores(UID2)).length > 0);
    assert.deepEqual(await readNominations(UID2), { Ben: "out" });
  });

  it("deleteUserEverything issues ONE pipeline (data-model.md rule 5)", async () => {
    const fake = withFake();
    await recordVote({ winner: "Felix", loser: "Paul", user: UID1 });
    await writeNomination(UID1, "Noah", "in");

    const batchesBefore = fake.state.pipelineBatches.length;
    await deleteUserEverything(UID1);

    const newBatches = fake.state.pipelineBatches.slice(batchesBefore);
    const delBatches = newBatches.filter((b) => b.some((c) => c.op === "del"));
    assert.equal(delBatches.length, 1, "exactly one pipeline containing DELs");
    const delKeys = delBatches[0]
      .filter((c) => c.op === "del")
      .map((c) => c.args[0]);
    assert.equal(delKeys.length, 3, "2-3 DELs batched in that one pipeline");
  });
});
