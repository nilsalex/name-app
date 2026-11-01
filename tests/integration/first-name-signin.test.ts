// Integration test (feature 007 T005): a real sign-in flow against the
// request scope — signIn verifies a (mocked-transport) token, resolves the
// user, and persists `firstName` in the UserRecord JSON inside the users
// hash. lib/store is module-mocked (no Upstash, no credentials); env vars
// are set for the sign-in configuration checks; cookies() runs inside a
// synthesized Next.js request work-unit store (the same runtime plumbing
// next dev uses — see lib/session.ts and next's request-store.js).
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const recordVote = mock.fn(async (vote: unknown) => vote);

// Runtime (Node 24) accepts the modern `exports` option; the pinned
// @types/node@20 only types the deprecated `namedExports`. Cast bridges
// the gap until @types/node is upgraded (idiom from submit-auth.test.ts).
const mockOptions = {
  exports: {
    recordVote,
    scores: mock.fn(async () => ({})),
  },
} as unknown as Parameters<typeof mock.module>[1];
mock.module("../../lib/store", mockOptions);

// Next.js request-scope harness (cookies() only works inside a request
// work-unit store; node:test runs bare). globalThis.AsyncLocalStorage is
// normally installed by next's own server runtime — absent in bare node,
// so polyfill it FIRST, before any next module is required.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??=
  AsyncLocalStorage;

// tokeninfo returns exp as a STRING (all fields are strings); it must be
// in the future for the token to verify.
const EXP = String(Math.floor(Date.now() / 1000) + 3600);

const VALID_CLAIMS = {
  aud: "test-client-id.apps.googleusercontent.com",
  email: "person.a@gmail.com",
  email_verified: "true" as const,
  exp: EXP,
};

function fakeTokeninfoResponse(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
    })) as unknown as typeof fetch;
}

interface CapturedCookie {
  name: string;
  value: string;
}

async function withRequestScope(
  fn: () => Promise<void>
): Promise<CapturedCookie[]> {
  const [{ workUnitAsyncStorage }, { workAsyncStorage }, { createRequestStore }] =
    await Promise.all([
      import("next/dist/server/app-render/work-unit-async-storage.external.js"),
      import("next/dist/server/app-render/work-async-storage.external.js"),
      import("next/dist/server/async-storage/request-store.js"),
    ]);
  const captured: CapturedCookie[] = [];
  const requestStore = createRequestStore({
    phase: "action",
    headers: new Headers({ cookie: "" }),
    onUpdateCookies: (setCookie: string[]) => {
      for (const line of setCookie) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        captured.push({ name: pair.slice(0, eq), value: pair.slice(eq + 1) });
      }
    },
    url: { pathname: "/", search: "" },
    rootParams: {},
    implicitTags: null as unknown as NonNullable<
      Parameters<typeof createRequestStore>[0]["implicitTags"]
    >,
    resumeDataCache: null,
    previewProps: undefined,
    isHmrRefresh: undefined,
    serverComponentsHmrCache: undefined,
    hmrRefreshHash: undefined,
    stagedFallbackParams: null,
  });
  const workStore = {
    route: "/",
    page: "/",
    forceStatic: false,
    dynamicShouldError: false,
    // Remaining WorkStore fields are only read by Next internals this test
    // never touches; the cast documents the intentional minimal shape.
  } as unknown as Parameters<typeof workAsyncStorage.run>[0];
  await workAsyncStorage.run(workStore, () =>
    workUnitAsyncStorage.run(requestStore, fn)
  );
  return captured;
}

async function withEnv(fn: () => Promise<void>): Promise<void> {
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.APPROVED_EMAILS = "person.a@gmail.com,person.b@gmail.com";
  process.env.SESSION_SECRET =
    "test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
  // The Upstash REST URL/TOKEN must be present (env check) even though the
  // Redis module itself is mocked — lib/user-store only ever CONSTRUCTS the
  // mocked client.
  process.env.UPSTASH_REDIS_REST_URL ??= "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";
  try {
    await fn();
  } finally {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.APPROVED_EMAILS;
    delete process.env.SESSION_SECRET;
  }
}

// The users hash is in-memory: spy on UserStoreBackend via lib/user-store's
// injectable backend is not reachable from signIn (it builds its own), so
// observe the persisted record through findUserById — which reads the same
// Upstash client. To stay credential-free, module-mock user-store's backend
// is not possible (the backend is internal); instead we assert on what
// signIn RETURNS and re-resolve through the same public surface the vote
// gate uses. Mock @upstash/redis with an in-memory hash.
const usersHash = new Map<string, string>();
let nextNum = 0;

const redisMock = {
  Redis: class {
    async hget(key: string, field: string): Promise<string | null> {
      if (key.endsWith(":users")) return usersHash.get(field) ?? null;
      return null;
    }
    async hset(key: string, obj: Record<string, string>): Promise<void> {
      for (const [field, value] of Object.entries(obj)) usersHash.set(field, value);
    }
    async hgetall(key: string): Promise<Record<string, string> | null> {
      if (key.endsWith(":users")) {
        return Object.fromEntries(usersHash);
      }
      return null;
    }
    async incr(key: string): Promise<number> {
      return ++nextNum;
    }
  },
};

mock.module("@upstash/redis", {
  exports: redisMock,
} as unknown as Parameters<typeof mock.module>[1]);

describe("signIn persists firstName (feature 007 US1)", () => {
  it("creates a record with the verified given name on first sign-in", async () => {
    await withEnv(async () => {
      const { signIn } = await import("../../app/actions");
      const cookies = await withRequestScope(async () => {
        const result = await signIn("fake.id.token", {
          fetchTokenInfo: fakeTokeninfoResponse({
            ...VALID_CLAIMS,
            given_name: "Nils",
          }),
        } as never);
        assert.equal(result.ok, true, "result=" + JSON.stringify(result));
        if (result.ok) {
          // The returned label is the real first name, not "Person N".
          assert.equal(result.label, "Nils");
        }
      });
      const session = cookies.find((c) => c.name === "namewahl_session");
      assert.ok(session, "sign-in must set the session cookie");
      // Persisted record carries the name (read back through the store).
      const { findUserById } = await import("../../lib/user-store");
      const { verifySession } = await import("../../lib/session");
      const payload = verifySession(session.value);
      assert.ok(payload, "session cookie must verify");
      const record = await findUserById(payload!.uid);
      assert.ok(record, "record must exist");
      assert.equal(record!.firstName, "Nils");
    });
  });

  it("falls back to the first word of name when given_name is absent", async () => {
    await withEnv(async () => {
      const { signIn } = await import("../../app/actions");
      await withRequestScope(async () => {
        const result = await signIn("fake.id.token", {
          fetchTokenInfo: fakeTokeninfoResponse({
            ...VALID_CLAIMS,
            email: "person.b@gmail.com",
            name: "Alex Guest",
          }),
        } as never);
        assert.equal(result.ok, true, "result=" + JSON.stringify(result));
        if (result.ok) assert.equal(result.label, "Alex");
      });
    });
  });

  it("a second sign-in of the same email returns the stored record unchanged (immutability, R5)", async () => {
    await withEnv(async () => {
      const { signIn } = await import("../../app/actions");
      await withRequestScope(async () => {
        // Second sign-in of person.a — token claims a DIFFERENT name, but
        // the existing record's stored fields win (no update).
        const result = await signIn("fake.id.token", {
          fetchTokenInfo: fakeTokeninfoResponse({
            ...VALID_CLAIMS,
            given_name: "Different",
          }),
        } as never);
        assert.equal(result.ok, true, "result=" + JSON.stringify(result));
        if (result.ok) assert.equal(result.label, "Nils");
      });
      const { findUserById } = await import("../../lib/user-store");
      // Record still holds the originally captured name.
      const all = [...usersHash.values()].map((v) => JSON.parse(v) as { firstName?: string });
      const withNames = all.filter((r) => r.firstName !== undefined);
      assert.ok(withNames.length >= 1);
      assert.equal(withNames[0].firstName, "Nils");
    });
  });
});
