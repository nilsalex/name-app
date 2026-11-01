// Vote persistence against Upstash Redis (free tier).
//
// Storage layout (data-model.md, features 001–006):
//   <prefix>:scores          sorted set   member = name, score = global win count
//   <prefix>:votes           stream       one entry per vote { winner, loser, user, at }
//   <prefix>:user:<uid>:scores  sorted set   member = name, score = personal win count (006)
//   <prefix>:user:<uid>:seen    sorted set   member = name, score = personal exposure count (006)
//
// Feature 006 (per-user tallies): votes additionally increment a per-user
// zset keyed by the internal user id; ranking/winners read ONLY that zset.
// The global zset is still written (historical integrity) but read by no
// user-facing view. Seen-frequency is maintained by bumpUserSeen — the
// SINGLE writer is the batch/refill path (research.md R4), never the vote
// path.
//
// Atomicity (research.md R2/R4): each vote is one batched pipeline
// (xadd + zincrby global + zincrby per-user) — all commands commit
// together or neither does, one round trip.
//
// Key safety (data-model.md): per-user key derivation validates the uid
// with isUserIdShape and throws otherwise; uids come exclusively from
// getCurrentUid() (HMAC-verified session), so legacy alias values never
// construct a key.
import { Redis } from "@upstash/redis";
import { upstashUrl, upstashToken } from "./env";
import { isUserIdShape } from "./user-ids";

const PREFIX = process.env.STORE_KEY_PREFIX ?? "namewahl";

export interface VoteRecord {
  winner: string;
  loser: string;
  /** Internal user id (005+) or legacy alias "A"/"B" (pre-005 data). */
  user: string;
  at: string; // ISO timestamp
}

let client: Redis | null = null;

function redis(): Redis {
  client ??= new Redis({ url: upstashUrl(), token: upstashToken() });
  return client;
}

/**
 * Test seam: injects a fake Redis client (unit tests only — never used in
 * production code paths). Passing null restores the real client.
 */
export function _setClientForTests(fake: unknown): void {
  client = (fake as Redis | null) ?? null;
}

function assertUid(uid: string): string {
  if (!isUserIdShape(uid)) {
    throw new Error(`invalid user id shape: ${JSON.stringify(String(uid).slice(0, 8))}…`);
  }
  return uid;
}

/** Per-user personal win-tally key (feature 006). */
export function userScoresKey(uid: string): string {
  return `${PREFIX}:user:${assertUid(uid)}:scores`;
}

/** Per-user seen-frequency key (feature 006). */
export function userSeenKey(uid: string): string {
  return `${PREFIX}:user:${assertUid(uid)}:seen`;
}

/** Records one vote atomically: audit stream + global tally + personal tally. */
export async function recordVote(
  vote: Omit<VoteRecord, "at">
): Promise<VoteRecord> {
  const record: VoteRecord = { ...vote, at: new Date().toISOString() };
  const r = redis();
  await r
    .pipeline()
    .xadd(`${PREFIX}:votes`, "*", { ...record })
    .zincrby(`${PREFIX}:scores`, 1, vote.winner)
    .zincrby(userScoresKey(vote.user), 1, vote.winner)
    .exec();
  return record;
}

/** Current win counts for all names that have at least one win. */
export async function scores(): Promise<Record<string, number>> {
  return readZset(`${PREFIX}:scores`);
}

/** The signed-in user's personal win tally (feature 006 ranking source). */
export async function userScores(uid: string): Promise<Record<string, number>> {
  return readZset(userScoresKey(uid));
}

/** The signed-in user's personal seen-frequency map (feature 006 drafting input). */
export async function userSeen(uid: string): Promise<Record<string, number>> {
  return readZset(userSeenKey(uid));
}

/** Flat [name, score, …] zrange parse — shared idiom. */
async function readZset(key: string): Promise<Record<string, number>> {
  const members = await redis().zrange(key, 0, -1, {
    withScores: true,
  });
  // zrange withScores returns a flat array [name, score, name, score, ...]
  const result: Record<string, number> = {};
  const flat = Array.isArray(members) ? members : [];
  for (let i = 0; i < flat.length; i += 2) {
    result[flat[i] as string] = Number(flat[i + 1]);
  }
  return result;
}

/**
 * Bumps the user's seen-frequency by 1 for each DISTINCT name (feature 006,
 * research R4: single writer — the batch/refill path). One pipeline, one
 * round trip; errors are logged, never thrown (contracts.md: seen-frequency
 * is heuristic, availability wins).
 */
export async function bumpUserSeen(uid: string, names: readonly string[]): Promise<void> {
  const distinct = [...new Set(names)];
  if (distinct.length === 0) return;
  const key = userSeenKey(uid);
  try {
    const r = redis();
    const pipe = r.pipeline();
    for (const name of distinct) {
      pipe.zincrby(key, 1, name);
    }
    await pipe.exec();
  } catch (err) {
    console.error("bumpUserSeen failed (non-fatal):", err);
  }
}
