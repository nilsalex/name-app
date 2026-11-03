// Reset persistence against Upstash Redis (feature 014 — per-user votes /
// nominations / combined reset).
//
// Zero new key shapes: a reset DELETES existing per-user keys
// (data-model.md, feature 014) — the personal win tally and seen-frequency
// zsets (lib/store.ts, feature 006) and the nominations decisions hash
// (lib/nomination-store.ts, feature 013). Key strings are composed ONLY
// from the existing exported key builders — no duplicated key formats.
//
// Deletion list = pure function of the variant (resetTargets); DEL on a
// missing key is a Redis no-op, so "nothing to reset" needs no existence
// checks (FR-009). Batching contract (data-model.md rule 5, same as
// recordVote): one pipeline per reset — all DELs commit together or
// neither does, one round trip.
//
// Never touched by any reset: the shared `<prefix>:scores` global zset,
// the `<prefix>:votes` audit stream, any other user's keys, and the
// shared name list (FR-005; research R1).
import "server-only";
import { Redis } from "@upstash/redis";
import { upstashUrl, upstashToken } from "./env";
import { userScoresKey, userSeenKey } from "./store";
import { nominationKey } from "./nomination-store";

/** Which of the user's own data sets a reset deletes. */
export type ResetVariant = "votes" | "nominations" | "all";

let client: Redis | null = null;

/**
 * Mock-mode hook (feature 012) + test seam: identical accessor pattern to
 * lib/store.ts's redis() — consume the fake client slot if one is
 * published (visual suite), else use the injected test client, else the
 * real Upstash client. Client construction is NOT duplicated: this module
 * mirrors the minimal accessor pattern of lib/store.ts.
 */
function currentClient(): Redis | null {
  if (client) return client;
  try {
    const { consumeFakeClient } = require("../app/fake-store") as {
      consumeFakeClient: () => unknown | undefined;
    };
    const fake = consumeFakeClient();
    if (fake !== undefined) {
      client = fake as Redis;
    }
  } catch {
    // Module unavailable outside bundled contexts — fall through.
  }
  return client;
}

function redis(): Redis {
  return currentClient() ?? (client ??= new Redis({ url: upstashUrl(), token: upstashToken() }));
}

/**
 * Test seam: injects a fake Redis client (unit/integration tests only —
 * never used in production code paths). Passing null restores the real
 * client. Same seam pattern as lib/store.ts's _setClientForTests.
 */
export function _setClientForTests(fake: unknown): void {
  client = (fake as Redis | null) ?? null;
}

/**
 * The exact keys the given reset variant deletes, in pipeline order
 * (contracts.md "lib/reset-store.ts"). Pure; throws on invalid uid shapes
 * (data-model.md rule 1 — the guard lives inside the existing key
 * builders). Deterministic order: scores, seen, nominations.
 */
export function resetTargets(uid: string, variant: ResetVariant): string[] {
  if (variant === "nominations") return [nominationKey(uid)];
  if (variant === "votes") return [userScoresKey(uid), userSeenKey(uid)];
  return [userScoresKey(uid), userSeenKey(uid), nominationKey(uid)];
}

/**
 * Deletes the user's own vote-derived keys (personal win tally +
 * seen-frequency): ONE pipeline DEL of resetTargets(uid, "votes")
 * (research R1). Throws on Upstash failure — the calling server action
 * maps the error to an ActionResult.
 */
export async function deleteUserVotes(uid: string): Promise<void> {
  const targets = resetTargets(uid, "votes");
  await redis()
    .pipeline()
    .del(...targets)
    .exec();
}

/**
 * Deletes the user's own nominations hash: one DEL — the next gate render
 * derives a fresh nomination round (research R2; no restart marker, no
 * cursor). Never touches the user's vote tallies (FR-005). Throws on
 * Upstash failure.
 */
export async function deleteUserNominations(uid: string): Promise<void> {
  await redis().del(nominationKey(uid));
}

/**
 * Deletes the user's own votes AND nominations in ONE pipeline (FR-006's
 * single combined action — one confirmation, one round trip). Throws on
 * Upstash failure.
 */
export async function deleteUserEverything(uid: string): Promise<void> {
  const targets = resetTargets(uid, "all");
  await redis()
    .pipeline()
    .del(...targets)
    .exec();
}
