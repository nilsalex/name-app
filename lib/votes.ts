// SPIKE persistence layer.
//
// Backends (selected automatically):
// - Upstash Redis REST API when UPSTASH_REDIS_REST_URL and
//   UPSTASH_REDIS_REST_TOKEN are set (Vercel-native, works for two
//   simultaneous voters; free tier; see SPIKE-NOTES.md).
// - Local JSON file fallback (data/votes.json) for dev with no env vars.
//   NOT usable on Vercel's read-only filesystem.
//
// Votes are stored per (name, voter) pair as a Redis hash: HSET
// votes <voter>\x00<name>=1. Two simultaneous voters never overwrite
// each other's fields; one voter re-voting the same name rewrites
// their own field. The full tally is derived by HGETALL.
import { promises as fs } from "fs";
import path from "path";
import { BOY_NAMES, NameScore } from "./names";

const VOTE_KEY = "name-app:votes";
const FIELD = "\x00"; // voter\x00name

type Votes = Map<string, string>; // voter -> name

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function activeBackend(): "upstash" | "local-file" {
  return upstashEnv() ? "upstash" : "local-file";
}

async function upstashCommand(
  command: (string | number)[]
): Promise<unknown> {
  const { url, token } = upstashEnv()!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Upstash request failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

// --- local-file fallback ---

function localFile(): string {
  return path.join(process.cwd(), "data", "votes.json");
}

async function localRead(): Promise<Votes> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(localFile(), "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.every(([, v]) => typeof v === "string")) {
        return new Map(entries as [string, string][]);
      }
    }
    return new Map();
  } catch {
    return new Map();
  }
}

async function localWrite(votes: Votes): Promise<void> {
  await fs.mkdir(path.dirname(localFile()), { recursive: true });
  await fs.writeFile(
    localFile(),
    JSON.stringify(Object.fromEntries(votes), null, 2),
    "utf8"
  );
}

// --- vote access ---

export async function getVotesSnapshot(): Promise<{
  backend: "upstash" | "local-file";
  votes: Votes;
}> {
  const backend = activeBackend();
  if (backend === "upstash") {
    // Upstash REST HGETALL returns a flat [k1, v1, k2, v2, ...] array.
    const result = (await upstashCommand(["HGETALL", VOTE_KEY])) as
      | string[]
      | null;
    const votes: Votes = new Map();
    if (Array.isArray(result)) {
      for (let i = 0; i + 1 < result.length; i += 2) {
        const field = result[i].split(FIELD);
        if (field.length === 2) {
          const [voter, name] = field as [string, string];
          votes.set(voter, name);
        }
      }
    }
    return { backend, votes };
  }
  return { backend: "local-file", votes: await localRead() };
}

export async function castVote(
  voter: string,
  name: string
): Promise<void> {
  if (!BOY_NAMES.includes(name)) {
    throw new Error(`Unknown name: ${name}`);
  }
  if (!voter.trim()) {
    throw new Error("Voter must not be empty");
  }
  if (voter.includes(FIELD)) {
    throw new Error(`Invalid voter: ${voter}`);
  }
  const backend = activeBackend();
  const field = voter + FIELD + name;
  if (backend === "upstash") {
    await upstashCommand(["HSET", VOTE_KEY, field, 1]);
  } else {
    const votes = await localRead();
    votes.set(voter, name);
    await localWrite(votes);
  }
}

export function tally(votes: Votes): NameScore[] {
  return BOY_NAMES.map((name) => ({
    name,
    score: [...votes.values()].filter((n) => n === name).length,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));
}
