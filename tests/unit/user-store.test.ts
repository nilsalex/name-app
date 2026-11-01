// Unit tests: user-record read-or-create (spec 005, contracts.md §4,
// research.md R3). Uses an in-memory UserStoreBackend — no Upstash, no
// credentials, no env access.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createUserStore, displayLabel } from "../../lib/user-store";
import type { UserRecord, UserStoreBackend } from "../../lib/user-store";

function fakeBackend(): UserStoreBackend & { putCalls: number } {
  const map = new Map<string, UserRecord>();
  let nextNum = 0;
  return {
    putCalls: 0,
    async get(email: string) {
      return map.get(email) ?? null;
    },
    async put(email: string, record: UserRecord) {
      map.set(email, record);
      this.putCalls++;
    },
    async nextNumber() {
      return ++nextNum;
    },
  };
}

describe("createUserStore.resolveUser", () => {
  it("creates a record on first resolve: 22-char id, num 1, ISO createdAt", async () => {
    const backend = fakeBackend();
    const store = createUserStore(backend);
    const record = await store.resolveUser("person.a@gmail.com");
    assert.match(record.id, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(record.num, 1);
    assert.doesNotThrow(() => new Date(record.createdAt).toISOString());
  });

  it("reuses the SAME id and num on the second resolve", async () => {
    const backend = fakeBackend();
    const store = createUserStore(backend);
    const first = await store.resolveUser("person.a@gmail.com");
    const second = await store.resolveUser("person.a@gmail.com");
    assert.deepEqual(second, first);
    // First resolve = 1 put; second resolve = read-only (no rewrite).
    assert.equal(backend.putCalls, 1);
  });

  it("assigns sequential nums and distinct ids to different emails", async () => {
    const store = createUserStore(fakeBackend());
    const a = await store.resolveUser("a@gmail.com");
    const b = await store.resolveUser("b@gmail.com");
    assert.equal(b.num, a.num + 1);
    assert.notEqual(a.id, b.id);
  });

  it("normalizes emails: trimmed/lowercased address maps to the same record", async () => {
    const store = createUserStore(fakeBackend());
    const first = await store.resolveUser("  Person.A@Gmail.com ");
    const second = await store.resolveUser("person.a@gmail.com");
    assert.deepEqual(first, second);
  });
});

describe("displayLabel", () => {
  it("formats 'Person N' and falls back to 'Person' without num", () => {
    const record: UserRecord = {
      id: "QkT9x2mR7pLw4vNs8JeD1A",
      num: 3,
      createdAt: "2026-11-02T10:00:00.000Z",
    };
    assert.equal(displayLabel(record), "Person 3");
    assert.equal(displayLabel({ ...record, num: undefined }), "Person");
  });
});
