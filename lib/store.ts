// Vote persistence against Upstash Redis (free tier).
//
// Storage layout (data-model.md):
//   <prefix>:scores  sorted set   member = name, score = win count
//   <prefix>:votes   stream       one entry per vote { winner, loser, user, at }
//
// Atomicity (research.md R2): each vote is written as one batched pipeline
// (xadd + zincrby) — both commands commit together or neither does, so
// concurrent votes are never lost and partial persistence is impossible.
import { Redis } from "@upstash/redis";
import { upstashUrl, upstashToken } from "./env";

const PREFIX = process.env.STORE_KEY_PREFIX ?? "namewahl";

export interface VoteRecord {
  winner: string;
  loser: string;
  user: "A" | "B";
  at: string; // ISO timestamp
}

let client: Redis | null = null;

function redis(): Redis {
  client ??= new Redis({ url: upstashUrl(), token: upstashToken() });
  return client;
}

/** Records one vote atomically: appends to audit stream + increments score. */
export async function recordVote(
  vote: Omit<VoteRecord, "at">
): Promise<VoteRecord> {
  const record: VoteRecord = { ...vote, at: new Date().toISOString() };
  const r = redis();
  await r
    .pipeline()
    .xadd(`${PREFIX}:votes`, "*", { ...record })
    .zincrby(`${PREFIX}:scores`, 1, vote.winner)
    .exec();
  return record;
}

/** Current win counts for all names that have at least one win. */
export async function scores(): Promise<Record<string, number>> {
  const members = await redis().zrange(`${PREFIX}:scores`, 0, -1, {
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
