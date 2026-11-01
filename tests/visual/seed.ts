// Pre-run reset of the dedicated test key namespace (feature 011, research
// R3, contract C3.2). Reads UPSTASH_REDIS_REST_URL/TOKEN directly — it must
// work outside Next.js — and wipes every `namewahl-visual-test:*` key so
// each suite run starts from the same empty-namespace state (SC-004,
// SC-005). It NEVER touches keys outside the visual-test prefix.
//
// Seed state: nothing beyond the wipe is required — the pool, tallies, and
// seen-zsets tolerate absence (uniform selection degenerates in
// lib/pairing.ts), and the test user's record is created naturally at
// first sign-in via resolveUser.
import { Redis } from "@upstash/redis";

export const VISUAL_TEST_PREFIX = "namewahl-visual-test";

/** Environment variables required by the suite; missing ones fail fast
 *  with a message naming the variable (contract C1.2/C3.2). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[visual-setup] Missing environment variable ${name}. ` +
        `Fix: set ${name} in .env.visual (see .env.example and quickstart.md).`
    );
  }
  return value.trim();
}

/** Reads the prefix from the environment (must be the visual-test one). */
export function storeKeyPrefix(): string {
  const prefix = process.env.STORE_KEY_PREFIX?.trim();
  if (prefix !== undefined && prefix !== "" && prefix !== VISUAL_TEST_PREFIX) {
    throw new Error(
      `[visual-setup] STORE_KEY_PREFIX must be "${VISUAL_TEST_PREFIX}" in .env.visual ` +
        `(found: "${prefix}"). Fix: the visual suite must never write to ` +
        `the dev/production namespace (SC-005).`
    );
  }
  return VISUAL_TEST_PREFIX;
}

function redis(): Redis {
  return new Redis({
    url: requireEnv("UPSTASH_REDIS_REST_URL"),
    token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
  });
}

/**
 * Deletes every `namewahl-visual-test:*` key (SCAN + pipelined DEL).
 * Fail-fast with a setup-error message when the store is unreachable
 * (contract C3.2).
 */
export async function resetTestStore(): Promise<number> {
  const redis_ = redis();
  const prefix = storeKeyPrefix();
  const match = `${prefix}:*`;
  let cursor: string | number = 0;
  let deleted = 0;
  try {
    do {
      const [next, keys] = (await redis_.scan(cursor as number, {
        match,
        count: 200,
      })) as [string, string[]];
      cursor = next;
      if (keys.length > 0) {
        await redis_.del(...keys);
        deleted += keys.length;
      }
    } while (String(cursor) !== "0");
  } catch (err) {
    throw new Error(
      `[visual-setup] Test store unreachable — could not reset ` +
        `${prefix}:* keys. Fix: check UPSTASH_REDIS_REST_URL / ` +
        `UPSTASH_REDIS_REST_TOKEN in .env.visual and your network. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return deleted;
}
