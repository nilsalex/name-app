// Nomination persistence against Upstash Redis (feature 013, feature 013
// data-model.md "NominationDecisions").
//
// Storage layout: ONE hash per user —
//   <prefix>:user:<uid>:nominations   hash   field = name, value = "in" | "out"
//
// The hash is the single source of truth for that user's nomination round,
// its progress, and their voting pool; completeness, progress, and the pool
// are all DERIVED on read (research R1) by lib/nomination-logic.ts. Decisions
// are final: one HSET per decision, idempotent under retry (FR-011-safe);
// the only writer is the setNomination action.
//
// Key safety (data-model.md rule 3): per-user key derivation validates the
// uid with isUserIdShape and throws otherwise; uids come exclusively from
// getCurrentUid() (HMAC-verified session), so legacy alias values never
// construct a key.
import "server-only";
import { Redis } from "@upstash/redis";
import { upstashUrl, upstashToken } from "./env";
import { isUserIdShape } from "./user-ids";
import type { NominationDecision } from "./nomination-logic";

const PREFIX = process.env.STORE_KEY_PREFIX ?? "namewahl";

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

function assertUid(uid: string): string {
  if (!isUserIdShape(uid)) {
    throw new Error(`invalid user id shape: ${JSON.stringify(String(uid).slice(0, 8))}…`);
  }
  return uid;
}

/** Per-user nominations key (feature 013, data-model.md). */
export function nominationKey(uid: string): string {
  return `${PREFIX}:user:${assertUid(uid)}:nominations`;
}

/**
 * Writes ONE decision: a single HSET of a single field. Idempotent under
 * retry — writing the same (name, decision) again is the same write
 * (FR-011-safe). Throws on Upstash failure (the action maps it to an
 * ActionResult error).
 */
export async function writeNomination(
  uid: string,
  name: string,
  decision: NominationDecision
): Promise<void> {
  await redis().hset(nominationKey(uid), { [name]: decision });
}

/**
 * Reads the user's full decisions map (HGETALL). Values are narrowed to
 * the "in" | "out" union; no third value can ever be HSET by the only
 * writer contract, but reads stay type-honest regardless.
 */
export async function readNominations(
  uid: string
): Promise<Record<string, NominationDecision>> {
  const raw = await redis().hgetall(nominationKey(uid));
  const map: Record<string, NominationDecision> = {};
  if (!raw || typeof raw !== "object") return map;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "in" || value === "out") {
      map[name] = value;
    }
  }
  return map;
}
