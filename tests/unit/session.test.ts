// Unit tests: stateless signed session cookie (spec 004, contracts.md §4).
// Pure module with injectable deps ({ secret, now }) — no env access here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";
const NOW = 1_700_000_000_000;
const deps = { secret: SECRET, now: () => NOW };

import {
  sealSession,
  verifySession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from "../../lib/session";

const payload: SessionPayload = { uid: "QkT9x2mR7pLw4vNs8JeD1A", iat: NOW };

describe("session seal/verify", () => {
  it("round-trips a valid payload", () => {
    const sealed = sealSession(payload, deps);
    assert.deepEqual(verifySession(sealed, deps), payload);
  });

  it("uses the agreed cookie name and max age", () => {
    assert.equal(SESSION_COOKIE_NAME, "namewahl_session");
    assert.equal(SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  });

  it("rejects a tampered payload (bit-flip in the data part)", () => {
    const sealed = sealSession(payload, deps);
    const [data, sig] = sealed.split(".");
    const decoded = Buffer.from(data, "base64url").toString("utf8");
    const tampered = Buffer.from(
      decoded.replace(
        "QkT9x2mR7pLw4vNs8JeD1A",
        "Otherx2mR7pLw4vNs8JeD1A"
      ),
      "utf8"
    ).toString("base64url");
    assert.equal(verifySession(`${tampered}.${sig}`, deps), null);
  });

  it("rejects a tampered signature", () => {
    const sealed = sealSession(payload, deps);
    const [data, sig] = sealed.split(".");
    const badSig =
      sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
    assert.equal(verifySession(`${data}.${badSig}`, deps), null);
  });

  it("rejects an expired session (older than 30 days)", () => {
    const sealed = sealSession(payload, deps);
    const later = { ...deps, now: () => NOW + 30 * 24 * 60 * 60 * 1000 + 1 };
    assert.equal(verifySession(sealed, later), null);
  });

  it("accepts a session that is just within the max age", () => {
    const sealed = sealSession(payload, deps);
    const later = { ...deps, now: () => NOW + 30 * 24 * 60 * 60 * 1000 - 1 };
    assert.deepEqual(verifySession(sealed, later), payload);
  });

  it("rejects malformed values: no dot, bad base64, wrong shape, bad uid", () => {
    assert.equal(verifySession("not-a-sealed-value", deps), null);
    assert.equal(verifySession("!!!.!!!" as string, deps), null);
    const bogus = Buffer.from(JSON.stringify({ x: 1 }), "utf8").toString(
      "base64url"
    );
    assert.equal(verifySession(`${bogus}.${bogus}`, deps), null);
    const badUid = Buffer.from(
      JSON.stringify({ uid: "has spaces!", iat: NOW }),
      "utf8"
    ).toString("base64url");
    // Correctly signed but semantically invalid uid must still fail.
    const signed = sealSession(payload, deps);
    const [, goodSig] = signed.split(".");
    assert.equal(verifySession(`${badUid}.${goodSig}`, deps), null);
  });

  it("rejects a legacy 004 alias payload (correctly signed)", () => {
    // Sessions issued before 005 carry { alias, iat } — they must be
    // rejected so users re-login once after deploy (research R5).
    const legacy = Buffer.from(
      JSON.stringify({ alias: "A", iat: NOW }),
      "utf8"
    ).toString("base64url");
    const signedLegacy = `${legacy}.${Buffer.from(
      sealSession(payload, deps).split(".")[1],
      "base64url"
    ).toString("base64url")}`;
    assert.equal(verifySession(signedLegacy, deps), null);
  });

  it("rejects a payload signed with a different secret", () => {
    const sealed = sealSession(payload, deps);
    const other = { ...deps, secret: "another-secret-0123456789abcdef012345" };
    assert.equal(verifySession(sealed, other), null);
  });
});
