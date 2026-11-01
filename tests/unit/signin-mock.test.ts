// Unit test: the injectable sign-in dependency (feature 012, T011,
// research R2, Constitution III — written first).
//
// Verifies the full mock-sign-in contract against the REAL action code:
//   - the injected provider resolves the fixed suite identity through the
//     UNCHANGED remainder (approval gate → resolveUser → sealSession →
//     cookies().set), producing { ok: true } with a uid of isUserIdShape
//     form and the suite's fixed firstName label;
//   - a user record is resolved via the user-store seam (UserStoreBackend
//     fake in the test — the record must EXIST after sign-in);
//   - the set cookie value verifies through verifySession with the suite
//     SESSION_SECRET;
//   - a non-approved injected identity is still rejected (not-approved) —
//     the approval gate is part of the unchanged remainder;
//   - the production signature (no injection) still calls the real
//     verifier path unchanged (a fake fetchTokenInfo dep flows through).
// Runs inside a synthesized Next.js request scope (same polyfill pattern
// as tests/integration/first-name-signin.test.ts) so cookies() works.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??=
  AsyncLocalStorage;
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const SUITE_SECRET = "suite-secret-0123456789abcdef0123456789abcdef";
const SUITE_EMAIL = "visual-suite@nameapp.invalid";
const SUITE_FIRST_NAME = "Visueller Tester";

// --- request scope (mirrors first-name-signin.test.ts) ---------------------

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
  } as unknown as Parameters<typeof workAsyncStorage.run>[0];
  await workAsyncStorage.run(workStore, () =>
    workUnitAsyncStorage.run(requestStore, fn)
  );
  return captured;
}

// --- in-memory user store backend (the seam under resolveUser) -------------

const usersHash = new Map<string, string>();
let nextNum = 0;

// lib/user-store is module-mocked so resolveUser's persistence lands in
// memory (no credentials); lib/store is mocked because the approved-email
// path never touches it but the module imports it.
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
      if (key.endsWith(":users")) return Object.fromEntries(usersHash);
      return null;
    }
    async incr(): Promise<number> {
      return ++nextNum;
    }
  },
};

mock.module("@upstash/redis", {
  exports: redisMock,
} as unknown as Parameters<typeof mock.module>[1]);

// --- env -------------------------------------------------------------------

function withSuiteEnv(fn: () => Promise<void>): Promise<void> {
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.APPROVED_EMAILS = SUITE_EMAIL;
  process.env.SESSION_SECRET = SUITE_SECRET;
  process.env.UPSTASH_REDIS_REST_URL ??= "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";
  return fn().finally(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.APPROVED_EMAILS;
    delete process.env.SESSION_SECRET;
  });
}

function suiteIdentityProvider() {
  return async () => ({ ok: true as const, email: SUITE_EMAIL, firstName: SUITE_FIRST_NAME });
}

describe("signIn injected verified identity (012 US2, T011)", () => {
  it("issues a real session for the suite identity through the unchanged remainder", async () => {
    usersHash.clear();
    nextNum = 0;
    await withSuiteEnv(async () => {
      const { signIn } = await import("../../app/actions");
      const cookies = await withRequestScope(async () => {
        const result = await signIn("unused-token", undefined, suiteIdentityProvider());
        assert.equal(result.ok, true, "result=" + JSON.stringify(result));
        if (result.ok) {
          assert.ok(
            /^[A-Za-z0-9_-]{1,64}$/.test(result.uid),
            `uid must be isUserIdShape form, got ${result.uid}`
          );
          // Feature 007 first-name capture: the label is the suite firstName.
          assert.equal(result.label, SUITE_FIRST_NAME);
        }
      });
      const session = cookies.find((c) => c.name === "namewahl_session");
      assert.ok(session, "sign-in must set the session cookie");
      // The cookie verifies through verifySession with the SUITE secret.
      const { verifySession } = await import("../../lib/session");
      const payload = verifySession(session.value);
      assert.ok(payload, "session cookie must verify against the suite secret");
      // A user record was resolved via the user-store seam.
      const { findUserById } = await import("../../lib/user-store");
      const record = await findUserById(payload!.uid);
      assert.ok(record, "suite identity record must exist after sign-in");
      assert.equal(record!.firstName, SUITE_FIRST_NAME);
    });
  });

  it("still rejects a non-approved injected identity (approval gate is unchanged)", async () => {
    usersHash.clear();
    await withSuiteEnv(async () => {
      const { signIn } = await import("../../app/actions");
      await withRequestScope(async () => {
        const result = await signIn("unused-token", undefined, async () => ({
          ok: true as const,
          email: "stranger@evil.example",
        }));
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "not-approved");
      });
      assert.equal(usersHash.size, 0, "denial leaves no record (FR-003)");
    });
  });

  it("the production signature (no injection) still compiles and calls the real verifier", async () => {
    usersHash.clear();
    await withSuiteEnv(async () => {
      const { signIn } = await import("../../app/actions");
      await withRequestScope(async () => {
        // No third argument: the default (real verifyGoogleIdToken) runs.
        // A syntactically non-token string fails verification exactly as
        // production would (no injected bypass).
        const result = await signIn("not-a-real-id-token");
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "invalid-token");
      });
      assert.equal(usersHash.size, 0);
    });
  });
});
