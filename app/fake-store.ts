// In-memory fake Upstash Redis (feature 012, research R1/R6) — dev-only.
//
// The suite's server process replaces its external dependencies with
// in-process mocks when VISUAL_MOCK_EXTERNAL=1. Storage: a real
// `@upstash/redis` client constructed over a custom `Requester` (the
// package's own documented pattern) whose commands execute against plain
// Map/array state — slotted through `lib/store.ts`'s existing test seam
// `_setClientForTests()` (and `lib/user-store.ts`'s shared client) BEFORE
// the first request, so the dummy Upstash credentials in the suite env are
// never contacted (contract C6.2).
//
// Command surface = EXACTLY the 9 verbs the app issues (research R6):
//   xadd, zincrby, zrange (withscores), hget, hset, hgetall, incr,
//   scan (match/count), del — plus the REST-level pipeline batching shape
//   (path ["pipeline"], body = array of command arrays).
// Any other verb throws immediately: an app using a verb the fake does not
// know is a dev-time failure caught by the suite's canary, never silent
// wrong data.
//
// All state is keyed by the FULL key string (prefix included) — the fake
// is the only store in its process and cannot see any other instance's
// state (FR-006 tenancy, structural). Created empty; lives only in the
// dev-server process memory; discarded when the process dies (research R3:
// the per-run reset IS the server lifecycle).
import { Redis, type Requester, type UpstashRequest, type UpstashResponse } from "@upstash/redis";
import { _setClientForTests } from "../lib/store";
import { _setClientForTests as _setNominationClientForTests } from "../lib/nomination-store";
import { _setClientForTests as _setResetClientForTests } from "../lib/reset-store";
import * as userStoreModule from "../lib/user-store";

/**
 * Process-wide bridge slot for the fake client (webpack dev reality):
 * in `next dev`, EACH server entry bundle (instrumentation, every route)
 * carries its OWN copy of lib/store — a seam set in the instrumentation
 * bundle's copy is invisible to route bundles. Storing the client on
 * globalThis and consuming it lazily from every bundle's `redis()`-style
 * getter makes the single instance visible process-wide (same pattern the
 * Next.js docs recommend for Prisma singletons). Slot name is prefixed to
 * avoid collisions with anything else on global.
 */
const FAKE_CLIENT_SLOT = "__namewahl_visual_fake_client__";

/** Publishes the fake client process-wide (called by installFakeStore). */
function publishFakeClient(client: unknown): void {
  (globalThis as Record<string, unknown>)[FAKE_CLIENT_SLOT] = client;
}

/**
 * Consumes the published fake client (called from lib/store.ts and
 * lib/user-store.ts lazily, in every bundle). Returns undefined when not
 * in mock mode — production never has the slot set.
 */
export function consumeFakeClient(): unknown | undefined {
  return (globalThis as Record<string, unknown | undefined>)[FAKE_CLIENT_SLOT];
}

/** Wire command: verb + args, as serialized by the SDK (all strings/numbers). */
type WireCommand = unknown[];

/** Stream entry shape (app audit trail; never read back by app code). */
interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

/** Case-insensitive verb of a wire command (SDK emits lowercase; probe-safe). */
function verbOf(cmd: WireCommand): string {
  return String(cmd[0]).toLowerCase();
}

/**
 * Creates the fake `Requester`. The returned object satisfies the SDK's
 * `Requester` interface (`request<TResult>`; `readYourWrites` left unset —
 * clients constructed over it pass `{ readYourWrites: false }`).
 */
export function createFakeRequester(): Requester {
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();
  const streams = new Map<string, StreamEntry[]>();
  const counters = new Map<string, number>();
  let streamSeq = 0;

  function assertKnown(verb: string): void {
    const KNOWN = ["xadd", "zincrby", "zrange", "hget", "hset", "hgetall", "incr", "scan", "del"];
    if (!KNOWN.includes(verb)) {
      throw new Error(
        `[fake-store] Unknown command "${verb}" — the in-memory fake implements ` +
          `exactly the app's 9-verb surface (xadd, zincrby, zrange, hget, hset, ` +
          `hgetall, incr, scan, del). Fix: extend app/fake-store.ts deliberately ` +
          `(with a wire-shape test) or remove the new store call.`
      );
    }
  }

  /** Executes ONE wire command against the map state → `{ result, error }`. */
  function execute(cmd: WireCommand): UpstashResponse<unknown> {
    const verb = verbOf(cmd);
    assertKnown(verb);
    switch (verb) {
      case "xadd": {
        // wire: ["xadd", key, id, field, value, field, value, …]
        const key = String(cmd[1]);
        const id = String(cmd[2]);
        const fields: Record<string, string> = {};
        for (let i = 3; i + 1 < cmd.length; i += 2) {
          fields[String(cmd[i])] = String(cmd[i + 1]);
        }
        const list = streams.get(key) ?? [];
        const entryId = id === "*" ? `${Date.now()}-${++streamSeq}` : id;
        list.push({ id: entryId, fields });
        streams.set(key, list);
        return { result: entryId };
      }
      case "zincrby": {
        // wire: ["zincrby", key, increment, member]
        const key = String(cmd[1]);
        const increment = Number(cmd[2]);
        const member = String(cmd[3]);
        const zset = zsets.get(key) ?? new Map<string, number>();
        zset.set(member, (zset.get(member) ?? 0) + increment);
        zsets.set(key, zset);
        return { result: zset.get(member) };
      }
      case "zrange": {
        // wire: ["zrange", key, min, max, ("withscores")] — the app only
        // ever issues 0 -1 withscores (lib/store.ts readZset). The result
        // MUST be the flat [member, score, …] array the SDK's own
        // deserializer expects (research R6/R7).
        const key = String(cmd[1]);
        const min = cmd[2];
        const max = cmd[3];
        const withScores = cmd.slice(4).map(String).includes("withscores");
        if (min !== 0 && String(min) !== "0") {
          throw new Error(`[fake-store] zrange only supports 0 -1 (got ${String(min)} ${String(max)})`);
        }
        const zset = zsets.get(key);
        const entries = zset ? [...zset.entries()] : [];
        // Ascending score, ties in insertion order (Map preserves it).
        entries.sort((a, b) => a[1] - b[1]);
        const flat: unknown[] = [];
        for (const [member, score] of entries) {
          if (withScores) {
            flat.push(member, score);
          } else {
            flat.push(member);
          }
        }
        return { result: flat };
      }
      case "hget": {
        // wire: ["hget", key, field]
        const field = hashes.get(String(cmd[1]))?.get(String(cmd[2]));
        return { result: field === undefined ? null : field };
      }
      case "hset": {
        // wire: ["hset", key, field, value, …]
        const key = String(cmd[1]);
        const hash = hashes.get(key) ?? new Map<string, string>();
        for (let i = 2; i + 1 < cmd.length; i += 2) {
          hash.set(String(cmd[i]), String(cmd[i + 1]));
        }
        hashes.set(key, hash);
        return { result: 1 };
      }
      case "hgetall": {
        // wire: ["hgetall", key] — flat [field, value, …]; empty key → []
        // (the SDK unflattens into an object / null itself, research R7).
        const hash = hashes.get(String(cmd[1]));
        const flat: unknown[] = [];
        if (hash) {
          for (const [field, value] of hash) flat.push(field, value);
        }
        return { result: flat };
      }
      case "incr": {
        // wire: ["incr", key] — starts at 0, returns the post-increment number.
        const key = String(cmd[1]);
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return { result: next };
      }
      case "scan": {
        // wire: ["scan", cursor, ("match", pattern), ("count", n)] — the
        // emulator holds at most a few dozen keys; one hop, cursor "0".
        const allKeys = new Set<string>([...zsets.keys(), ...hashes.keys(), ...streams.keys(), ...counters.keys()]);
        const matchIdx = cmd.findIndex((c, i) => i > 1 && String(c) === "match");
        const pattern = matchIdx >= 0 ? String(cmd[matchIdx + 1]) : undefined;
        const matching = pattern === undefined ? [...allKeys] : [...allKeys].filter((k) => matchesPattern(k, pattern));
        return { result: ["0", matching] };
      }
      case "del": {
        // wire: ["del", key, key, …] → removed count
        let removed = 0;
        for (let i = 1; i < cmd.length; i++) {
          const key = String(cmd[i]);
          const existed =
            zsets.delete(key) || hashes.delete(key) || streams.delete(key) || counters.delete(key);
          if (existed) {
            removed++;
          }
        }
        return { result: removed };
      }
      default: {
        // Unreachable (assertKnown above) — satisfies exhaustiveness.
        throw new Error(`[fake-store] Unknown command "${verb}"`);
      }
    }
  }

  /** Redis-style glob match for the scan MATCH pattern ("ns:*"). */
  function matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`
    );
    return regex.test(key);
  }

  return {
    request: async <TResult = unknown>(req: UpstashRequest): Promise<UpstashResponse<TResult>> => {
      const body = req.body;
      if (req.path && req.path[0] === "pipeline" && Array.isArray(body) && Array.isArray(body[0])) {
        // Pipeline: body is an array of command arrays → the response IS the
        // plain array of {result, error} (the real REST wire shape — the
        // SDK's Pipeline.exec maps over the response value directly).
        return (body as WireCommand[]).map(execute) as UpstashResponse<TResult>;
      }
      // Single command: body is the command array itself.
      return execute(body as WireCommand) as UpstashResponse<TResult>;
    },
  };
}

/**
 * Wires the in-memory fake into the app's store seams. Called once at
 * server start by `app/instrumentation.ts` in mock mode (mock mode only).
 * The dummy Upstash credentials in the suite env satisfy `lib/env.ts`'s
 * fail-fast checks but are never contacted: the seam client is replaced
 * before the first request.
 *
 * Both seams share ONE client instance: `lib/store.ts`'s `_setClientForTests`
 * and `lib/user-store.ts`'s module-private shared client (its `findUserById`
 * reads `hgetall` through that client and has no public seam — the
 * `_setSharedClientForTests` seam below is the minimal addition that lets
 * the fake reach it without re-architecting `user-store.ts`).
 */
export function installFakeStore(): void {
  const client = redisOverFake();
  // Process-wide publish FIRST (route bundles read the slot lazily), then
  // the direct seams for the instrumentation bundle's own module copies.
  // Feature 014: lib/nomination-store.ts and lib/reset-store.ts share the
  // same accessor pattern and therefore get the same direct injection (the
  // globalThis slot keeps every other bundle copy consistent).
  publishFakeClient(client);
  _setClientForTests(client);
  _setNominationClientForTests(client);
  _setResetClientForTests(client);
  const { _setSharedClientForTests } = userStoreSeams();
  _setSharedClientForTests(client);
}

/** A real SDK `Redis` client over a fresh fake requester (fresh = empty state). */
export function redisOverFake(): Redis {
  const requester = createFakeRequester();
  requester.readYourWrites = false;
  return new Redis(requester);
}

/** Resolves lib/user-store's test seam lazily (avoids an import cycle at
 *  module-evaluation time; the seam itself lives in lib/user-store.ts). */
function userStoreSeams(): {
  _setSharedClientForTests: (fake: unknown) => void;
} {
  const mod = userStoreModule as {
    _setSharedClientForTests: (fake: unknown) => void;
  };
  return { _setSharedClientForTests: mod._setSharedClientForTests };
}
