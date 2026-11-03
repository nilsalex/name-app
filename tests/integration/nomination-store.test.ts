// Integration tests: nomination store persistence (feature 013, T004 —
// Constitution IV red-green, written FIRST).
//
// Uses the same `_setClientForTests` fake-client seam pattern as the
// existing store unit/integration tests (no real network I/O).
//
// Pins (data-model.md "NominationDecisions", contracts.md "lib/nomination-store.ts"):
// - writeNomination → readNominations roundtrip (one HSET per decision).
// - A second write on another name accumulates (hash fields accumulate).
// - Values are narrowed to "in" | "out".
// - nominationKey throws on invalid uid shapes (rule 3, key-safety).
// - Key isolation: a different uid reads an empty map (FR-007 per-uid basis).
// - Two-uid independence (US3, T016): each uid's map is exactly that
//   user's own decisions; pools derive independently; no cross-visibility.
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { COLOGNE_200_BOY_NAMES } from "../../lib/names";
import {
  writeNomination,
  readNominations,
  nominationKey,
  _setClientForTests,
} from "../../lib/nomination-store";
import type { NominationDecision } from "../../lib/nomination-logic";
import { includedNames } from "../../lib/nomination-logic";

// ---------------------------------------------------------------------------
// In-memory fake Redis client with HSET/HGETALL support.
// ---------------------------------------------------------------------------

function fakeClient(): { client: unknown; hashes: Map<string, Record<string, string>> } {
  const hashes = new Map<string, Record<string, string>>();
  const client = {
    async hset(key: string, data: Record<string, string>) {
      const h = hashes.get(key) ?? {};
      hashes.set(key, { ...h, ...data });
      return 1;
    },
    async hgetall(key: string) {
      return hashes.get(key) ?? null;
    },
  };
  return { client, hashes };
}

let currentFake: ReturnType<typeof fakeClient> | null = null;
afterEach(() => {
  _setClientForTests(null);
  currentFake = null;
});

function withFake(): ReturnType<typeof fakeClient> {
  currentFake = fakeClient();
  _setClientForTests(currentFake.client);
  return currentFake;
}

const UID = "abc123def456ghi789jklm"; // 22-char base64url shape
const UID2 = "zzz123def456ghi789jklm";

describe("nomination store persistence (T004, feature 013)", () => {
  it("writeNomination then readNominations roundtrips one decision", async () => {
    withFake();
    await writeNomination(UID, "Noah", "in");
    assert.deepEqual(await readNominations(UID), { Noah: "in" });
  });

  it("a second write on another name accumulates", async () => {
    withFake();
    await writeNomination(UID, "Noah", "in");
    await writeNomination(UID, "Paul", "out");
    assert.deepEqual(await readNominations(UID), { Noah: "in", Paul: "out" });
  });

  it("values are narrowed to the in/out decision union", async () => {
    withFake();
    await writeNomination(UID, "Noah", "out");
    const decisions = await readNominations(UID);
    const value: NominationDecision | undefined = decisions["Noah"];
    assert.ok(value === "in" || value === "out");
    assert.equal(value, "out");
  });

  it("nominationKey throws on invalid uid shapes (rule 3)", () => {
    for (const bad of ["", null, undefined, 42, "bad uid!", "a".repeat(65)]) {
      assert.throws(() => nominationKey(bad as never));
    }
  });

  it("nominationKey builds the documented per-user nominations key", () => {
    assert.equal(
      nominationKey(UID),
      `namewahl:user:${UID}:nominations`
    );
  });

  it("a different uid reads an empty map (key isolation, FR-007 basis)", async () => {
    withFake();
    await writeNomination(UID, "Noah", "in");
    assert.deepEqual(await readNominations(UID2), {});
  });

  it("does not mutate the returned map into the input of another read", async () => {
    withFake();
    await writeNomination(UID, "Noah", "in");
    const first = await readNominations(UID);
    first["Paul"] = "in";
    assert.deepEqual(await readNominations(UID), { Noah: "in" });
  });
});

// ---------------------------------------------------------------------------
// US3 independence (T016 — Constitution III: one focused test for the
// independence behavior; per-uid key isolation makes it pass by design).
// ---------------------------------------------------------------------------

describe("two-uid nomination independence (T016, US3)", () => {
  it("each uid reads exactly its own map and pools derive independently (US3 AC2, FR-007)", async () => {
    withFake();
    // uid1: excludes Noah, includes Paul. uid2: the opposite.
    await writeNomination(UID, "Noah", "out");
    await writeNomination(UID, "Paul", "in");
    await writeNomination(UID2, "Noah", "in");
    await writeNomination(UID2, "Paul", "out");

    assert.deepEqual(await readNominations(UID), { Noah: "out", Paul: "in" });
    assert.deepEqual(await readNominations(UID2), { Noah: "in", Paul: "out" });

    // VotingPool derivation per user (data-model.md "VotingPool"):
    assert.deepEqual(includedNames(await readNominations(UID)), ["Paul"]);
    assert.deepEqual(includedNames(await readNominations(UID2)), ["Noah"]);

    // Cross-visibility: neither write is visible under the other uid's key.
    const list = COLOGNE_200_BOY_NAMES;
    assert.ok(!list.includes("Mystery"));
    const uid1Map = await readNominations(UID);
    const uid2Map = await readNominations(UID2);
    assert.equal(uid1Map["Noah"], "out");
    assert.equal(uid2Map["Noah"], "in");
    assert.equal("Paul" in uid2Map, true);
    assert.equal((uid1Map as Record<string, unknown>)["Mystery"], undefined);
    assert.equal((uid2Map as Record<string, unknown>)["Mystery"], undefined);
  });
});
