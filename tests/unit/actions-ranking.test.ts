// Unit tests for uid-scoped ranking/winners (feature 006 US1, T009/T010).
//
// Locks data-model.md invariants:
// - INV-1: no session → getRanking returns null with ZERO Redis reads;
//   getWinners returns { ok: false } with zero reads.
// - US1: signed-in ranking is built exclusively from userScores(uid)
//   (personal zset), never from the global scores().
// - Winners derive from the personal ranking (rank-1 names incl. ties);
//   empty personal tally → { ok: true, winners: [] }.
//
// Strategy: mock lib/store (module mocking, 004/005 idiom) and spy on
// which functions are called; session uid is controlled via a mocked
// lib/session getCurrentUid.
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const calls = {
  globalScores: 0,
  userScoresFor: [] as string[],
};

const scoresMock = mock.fn(async () => {
  calls.globalScores += 1;
  return { Felix: 10, Paul: 5 }; // global-ish data that must NOT leak in
});

const userScoresMock = mock.fn(async (uid: string) => {
  calls.userScoresFor.push(uid);
  if (uid === "uid-signed-in-000000001") return { Felix: 3, Paul: 1 };
  return {}; // fresh user
});

const userSeenMock = mock.fn(async () => ({}));

const getCurrentUidMock = mock.fn(async (): Promise<string | null> => currentUid);
let currentUid: string | null = null;

const storeMock = {
  exports: {
    recordVote: mock.fn(async (v: unknown) => v),
    scores: scoresMock,
    userScores: userScoresMock,
    userSeen: userSeenMock,
    bumpUserSeen: mock.fn(async () => undefined),
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

describe("uid-scoped ranking/winners (feature 006 US1)", () => {
  it("signed-out getRanking returns null with ZERO store reads (INV-1)", async () => {
    currentUid = null;
    const before = scoresMock.mock.callCount() + userScoresMock.mock.callCount();
    const { getRanking } = await import("../../app/actions");
    const result = await getRanking();
    assert.equal(result, null);
    const after = scoresMock.mock.callCount() + userScoresMock.mock.callCount();
    assert.equal(after, before, "no Redis reads when signed out");
  });

  it("signed-out getWinners returns { ok: false } with zero reads", async () => {
    currentUid = null;
    const before = scoresMock.mock.callCount() + userScoresMock.mock.callCount();
    const { getWinners } = await import("../../app/actions");
    const result = await getWinners();
    assert.equal(result.ok, false);
    const after = scoresMock.mock.callCount() + userScoresMock.mock.callCount();
    assert.equal(after, before, "no Redis reads when signed out");
  });

  it("signed-in getRanking ranks from the PERSONAL tally only", async () => {
    currentUid = "uid-signed-in-000000001";
    const { getRanking } = await import("../../app/actions");
    const ranking = (await getRanking())!;
    assert.ok(Array.isArray(ranking));
    assert.equal(userScoresMock.mock.callCount() >= 1, true);
    assert.deepEqual(calls.userScoresFor.at(-1), "uid-signed-in-000000001");

    // Personal tally { Felix: 3, Paul: 1 } → Felix rank 1, Paul rank 2.
    // Global data (Felix: 10, Paul: 5) would give the same order here but
    // with wrong scores — so pin the SCORES, not just the order:
    const felix = ranking.find((r) => r.name === "Felix")!;
    const paul = ranking.find((r) => r.name === "Paul")!;
    assert.equal(felix.score, 3);
    assert.equal(paul.score, 1);
    assert.equal(felix.rank, 1);
    assert.equal(paul.rank, 2);

    // All 200 names present, ties at the bottom shared (zero-vote names).
    assert.equal(ranking.length, 200);
    const bottom = ranking[ranking.length - 1];
    assert.equal(bottom.score, 0);
  });

  it("personal tally NEVER reads the global scores zset", async () => {
    currentUid = "uid-signed-in-000000001";
    const before = scoresMock.mock.callCount();
    const { getRanking } = await import("../../app/actions");
    await getRanking();
    assert.equal(scoresMock.mock.callCount(), before, "global scores() untouched");
  });

  it("signed-in with an empty personal tally: 200 names all at score 0", async () => {
    currentUid = "uid-fresh-user-00000001";
    const { getRanking } = await import("../../app/actions");
    const ranking = (await getRanking())!;
    assert.equal(ranking.length, 200);
    assert.ok(ranking.every((r) => r.score === 0));
    assert.ok(ranking.every((r) => r.rank === 1)); // shared bottom rank
  });

  it("getWinners returns personal rank-1 names incl. ties", async () => {
    currentUid = "uid-signed-in-000000001";
    const { getWinners } = await import("../../app/actions");
    const result = await getWinners();
    assert.equal(result.ok, true);
    assert.deepEqual((result as { winners: string[] }).winners, ["Felix"]);
  });

  it("getWinners with an empty personal tally → { ok: true, winners: [] }", async () => {
    currentUid = "uid-fresh-user-00000001";
    const { getWinners } = await import("../../app/actions");
    const result = await getWinners();
    assert.deepEqual(result, { ok: true, winners: [] });
  });
});
