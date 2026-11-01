// Unit tests for getScores(freshBatch?) — the uid-scoped scores+seen read
// with the batch-time seen bump (feature 006 US2, T018/T019, contracts.md).
//
// Locks:
// - getScores() signed-out → throws (caller redirects — unchanged 004/005).
// - getScores() signed-in → { scores: userScores(uid), seen: userSeen(uid) }.
// - With freshBatch → bumpUserSeen(uid, batch) called exactly once with the
//   batch names (single-writer rule, R4); AFTER the read; bump errors
//   non-fatal (contracts.md: availability wins).
// - Mount-time call (no freshBatch) → read-only, zero bumps.
//
// lib/store and lib/session are module-mocked (004/005 idiom).
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const bumpCalls: Array<{ uid: string; names: readonly string[] }> = [];
const readOrder: string[] = [];

const userScoresMock = mock.fn(async (uid: string) => {
  readOrder.push("scores:" + uid);
  return { Felix: 3 };
});

const userSeenMock = mock.fn(async (uid: string) => {
  readOrder.push("seen:" + uid);
  return { Paul: 7 };
});

const bumpUserSeenMock = mock.fn(async (uid: string, names: readonly string[]) => {
  bumpCalls.push({ uid, names });
  readOrder.push("bump");
});

const getCurrentUidMock = mock.fn(async (): Promise<string | null> => currentUid);
let currentUid: string | null = null;

const storeMock = {
  exports: {
    recordVote: mock.fn(async (v: unknown) => v),
    scores: mock.fn(async () => ({})),
    userScores: userScoresMock,
    userSeen: userSeenMock,
    bumpUserSeen: bumpUserSeenMock,
    userScoresKey: (uid: string) => `namewahl:user:${uid}:scores`,
    userSeenKey: (uid: string) => `namewahl:user:${uid}:seen`,
  },
} as unknown as Parameters<typeof mock.module>[1];
mock.module("../../lib/store", storeMock);

const sessionMock = {
  exports: {
    getCurrentUid: getCurrentUidMock,
    SESSION_COOKIE_NAME: "namewahl_session",
    SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
    verifySession: mock.fn(() => null),
    sealSession: mock.fn(() => "sealed"),
  },
} as unknown as Parameters<typeof mock.module>[1];
mock.module("../../lib/session", sessionMock);

describe("getScores(freshBatch?) — uid-scoped read + batch-time seen bump (US2)", () => {
  it("signed-out call throws (caller redirects)", async () => {
    currentUid = null;
    const { getScores } = await import("../../app/actions");
    await assert.rejects(() => getScores());
    assert.equal(userScoresMock.mock.callCount(), 0);
    assert.equal(userSeenMock.mock.callCount(), 0);
  });

  it("signed-in mount call returns both personal maps, read-only", async () => {
    currentUid = "uid-mount-000000000001";
    const before = bumpUserSeenMock.mock.callCount();
    const { getScores } = await import("../../app/actions");
    const result = await getScores();
    assert.deepEqual(result, { scores: { Felix: 3 }, seen: { Paul: 7 } });
    assert.equal(bumpUserSeenMock.mock.callCount(), before, "no bump on mount");
  });

  it("refill call bumps the fresh batch's names exactly once (single writer)", async () => {
    currentUid = "uid-refill-00000000001";
    const { getScores } = await import("../../app/actions");
    const batch = ["Felix", "Paul", "Felix", "Emil", "Paul", "Felix", "Anton", "Bela", "Charlie", "David"];
    await getScores(batch);
    assert.equal(bumpUserSeenMock.mock.callCount(), 1);
    const call = bumpCalls[0];
    assert.equal(call.uid, "uid-refill-00000000001");
    // Deduplication is bumpUserSeen's job (INV-4); the action passes the
    // batch through as-is.
    assert.deepEqual([...call.names], batch);
  });

  it("bump happens AFTER the reads (read-then-bump order)", async () => {
    currentUid = "uid-order-00000000001";
    readOrder.length = 0;
    const { getScores } = await import("../../app/actions");
    await getScores(["Felix", "Paul"]);
    const scoresIdx = readOrder.indexOf("scores:uid-order-00000000001");
    const seenIdx = readOrder.indexOf("seen:uid-order-00000000001");
    const bumpIdx = readOrder.indexOf("bump");
    assert.ok(scoresIdx !== -1 && seenIdx !== -1 && bumpIdx !== -1);
    assert.ok(scoresIdx < bumpIdx && seenIdx < bumpIdx);
  });

  it("bump failure does not fail the read (availability wins)", async () => {
    currentUid = "uid-bumpfail-000000001";
    // Swap the bump mock's behavior to a throwing one for this test.
    bumpUserSeenMock.mock.mockImplementation(async () => {
      throw new Error("upstash down");
    });
    const errors: unknown[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const { getScores } = await import("../../app/actions");
      const result = await getScores(["Felix", "Paul"]);
      assert.deepEqual(result.scores, { Felix: 3 }); // read still served
    } finally {
      console.error = origErr;
      // Restore the recording behavior.
      bumpUserSeenMock.mock.mockImplementation(
        async (uid: string, names: readonly string[]) => {
          bumpCalls.push({ uid, names });
          readOrder.push("bump");
        }
      );
    }
  });
});
