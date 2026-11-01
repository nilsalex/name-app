// SPIKE persistence layer.
//
// Backends (selected automatically):
// - Upstash Redis REST API when UPSTASH_REDIS_REST_URL and
//   UPSTASH_REDIS_REST_TOKEN are set (Vercel-native, works for two
//   simultaneous voters; free tier; see SPIKE-NOTES.md).
// - Local JSON file fallback (data/votes.json) for dev with no env vars.
//   NOT usable on Vercel's read-only filesystem.
//
// Votes are stored per voter name+name pair as a Redis hash: HSET
// votes <name>=<voter>. Two simultaneous voters never overwrite each
// other's separate keys. The full tally is derived by HGETALL.
import { promises as fs } from "fs";
import path from "path";
import { BOY_NAMES, NameScore } from "./names";

const VOTE_KEY = "name-app:votes";
type Votes = Record<string, string>; // name -> voter

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
    return JSON.parse(await fs.readFile(localFile(), "utf8")) as Votes;
  } catch {
    return {};
  }
}

async function localWrite(votes: Votes): Promise<void> {
  await fs.mkdir(path.dirname(localFile()), { recursive: true });
  await fs.writeFile(localFile(), JSON.stringify(votes, null, 2), "utf8");
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
    const votes: Votes = {};
    if (Array.isArray(result)) {
      for (let i = 0; i + 1 < result.length; i += 2) {
        votes[result[i]] = result[i + 1];
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
  const backend = activeBackend();
  if (backend === "upstash") {
    await upstashCommand(["HSET", VOTE_KEY, name, voter]);
  } else {
    const votes = await localRead();
    votes[name] = voter;
    await localWrite(votes);
  }
}

export function tally(votes: Votes): NameScore[] {
  return BOY_NAMES.map((name) => ({
    name,
    score: Object.keys(votes).filter((k) => k === name).length,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));
}
