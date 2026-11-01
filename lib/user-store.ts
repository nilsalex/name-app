// Persistent user records (spec 005, data-model.md "UserRecord",
// research.md R2/R3). Server-only: storage access is Upstash Redis.
//
// Storage layout (free-plan budget: +2 keys, writes only at first sign-in):
//   namewahl:users          hash    field = normalized email, value = JSON UserRecord
//   namewahl:users:nextnum  string  INCR counter for display numbers
//
// The email is the lookup key at sign-in ONLY — it never reaches vote
// records, sessions, or the UI (FR-008/FR-012). Race note (research R3):
// two simultaneous first sign-ins both increment and both PUT; the later
// write wins and both ids are valid — only the cosmetic display number
// is affected. Not solved with WATCH/Lua (Principle V).
import "server-only";
import { Redis } from "@upstash/redis";
import { upstashUrl, upstashToken } from "./env";
import { generateUserId } from "./user-ids";

export interface UserRecord {
  id: string;
  num: number;
  createdAt: string; // ISO timestamp; operator info, never displayed
}

/** Minimal storage surface, injectable for tests. */
export interface UserStoreBackend {
  get(email: string): Promise<UserRecord | null>;
  put(email: string, record: UserRecord): Promise<void>;
  nextNumber(): Promise<number>;
}

const PREFIX = process.env.STORE_KEY_PREFIX ?? "namewahl";
const USERS_KEY = `${PREFIX}:users`;
const NEXTNUM_KEY = `${PREFIX}:users:nextnum`;

/** Default backend: the Upstash Redis hash + counter (data-model.md). */
function upstashBackend(): UserStoreBackend {
  let client: Redis | null = null;
  const redis = (): Redis =>
    (client ??= new Redis({ url: upstashUrl(), token: upstashToken() }));
  return {
    async get(email) {
      const raw = await redis().hget<string>(USERS_KEY, email);
      if (!raw) return null;
      return typeof raw === "string" ? (JSON.parse(raw) as UserRecord) : raw;
    },
    async put(email, record) {
      await redis().hset(USERS_KEY, { [email]: JSON.stringify(record) });
    },
    async nextNumber() {
      return redis().incr(NEXTNUM_KEY);
    },
  };
}

export interface UserStore {
  /**
   * Read-or-create (research R3): returns the existing record for the
   * normalized email, or mints a new id + sequential display number and
   * persists it. Sign-in is the only caller.
   */
  resolveUser(email: string): Promise<UserRecord>;
}

export function createUserStore(backend?: UserStoreBackend): UserStore {
  const store = backend ?? upstashBackend();
  return {
    async resolveUser(email: string): Promise<UserRecord> {
      const key = email.trim().toLowerCase();
      const existing = await store.get(key);
      if (existing !== null) return existing;
      const record: UserRecord = {
        id: generateUserId(),
        num: await store.nextNumber(),
        createdAt: new Date().toISOString(),
      };
      await store.put(key, record);
      return record;
    },
  };
}

/**
 * Neutral display label (FR-008, research R6): "Person N" from the record's
 * stable sequential number, "Person" when the number is missing.
 */
export function displayLabel(record: UserRecord): string {
  return typeof record.num === "number" ? `Person ${record.num}` : "Person";
}
