// Unit tests: Google ID token verification (spec 004, research.md R2,
// contracts.md §4). The tokeninfo fetch is injected — no network here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { verifyGoogleIdToken } from "../../lib/google-verify";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const NOW = 1_700_000_000_000; // epoch ms
const EXP = Math.floor(NOW / 1000) + 3600; // tokeninfo exp is epoch seconds

interface FakeResponse {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}

function fakeFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}) {
  return (async (): Promise<FakeResponse> => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const validClaims = {
  aud: CLIENT_ID,
  email: "person.a@gmail.com",
  email_verified: "true",
  exp: EXP,
};

const baseDeps = {
  clientId: CLIENT_ID,
  now: () => NOW,
};

describe("verifyGoogleIdToken", () => {
  it("accepts valid claims and returns the email", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch(validClaims),
    });
    assert.deepEqual(result, { ok: true, email: "person.a@gmail.com" });
  });

  it("rejects a token whose audience is not our client id", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch({ ...validClaims, aud: "other-client" }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });

  it("rejects a token with an unverified email", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch({ ...validClaims, email_verified: "false" }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });

  it("rejects an expired token", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch({ ...validClaims, exp: Math.floor(NOW / 1000) - 1 }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });

  it("rejects a token without an email claim", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch({
        aud: CLIENT_ID,
        email_verified: "true",
        exp: EXP,
      }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });

  it("rejects a malformed (non-object) tokeninfo response", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch("not-an-object"),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });

  it("rejects when the tokeninfo endpoint fails (non-2xx)", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      fetchTokenInfo: fakeFetch(validClaims, { ok: false, status: 400 }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });
  it("maps a missing client id configuration to server-config", async () => {
    const result = await verifyGoogleIdToken("some.jwt.value", {
      ...baseDeps,
      clientId: undefined,
      fetchTokenInfo: fakeFetch(validClaims),
    });
    assert.deepEqual(result, { ok: false, reason: "server-config" });
  });

  it("rejects an empty id token without calling the endpoint", async () => {
    let called = 0;
    const counting = ((_input: unknown, _init?: unknown) => {
      called += 1;
      const inner = fakeFetch(validClaims) as unknown as (
        input?: unknown,
        init?: unknown
      ) => Promise<unknown>;
      return inner();
    }) as unknown as typeof fetch;
    const result = await verifyGoogleIdToken("", {
      ...baseDeps,
      fetchTokenInfo: counting,
    });
    assert.equal(called, 0);
    assert.deepEqual(result, { ok: false, reason: "invalid-token" });
  });
});
