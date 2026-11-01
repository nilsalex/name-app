// Stateless signed session cookie (spec 004, data-model.md "Session",
// research.md R3). Server-only: reading it needs next/headers cookies().
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
// The browser cannot mint or alter a session — only integrity matters, the
// payload (alias + issue time) is not sensitive (FR-008: no email inside).
// Session read happens at request time; callers must keep it inside a
// Suspense boundary with cacheComponents enabled (plan.md Constitution I).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./env";

export type Alias = "A" | "B";

export interface SessionPayload {
  alias: Alias;
  /** Issue time, epoch ms. */
  iat: number;
}

export const SESSION_COOKIE_NAME = "namewahl_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionDeps {
  secret?: string;
  now?: () => number;
}

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${data}.${hmac(secretOf(undefined), data)}`;
}

function secretOf(depsSecret: string | undefined): string {
  return depsSecret ?? sessionSecret();
}

function nowOf(depsNow: (() => number) | undefined): number {
  return depsNow ? depsNow() : Date.now();
}

/** Signs a session payload into a cookie value. */
export function sealSession(
  payload: SessionPayload,
  deps?: SessionDeps
): string {
  const secret = deps?.secret ?? sessionSecret();
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${data}.${hmac(secret, data)}`;
}

/**
 * Verifies a cookie value and returns its payload, or null when the value
 * is malformed, tampered, signed with a different secret, or expired.
 * Signature comparison is constant-time (timingSafeEqual).
 */
export function verifySession(
  cookieValue: string | undefined,
  deps?: SessionDeps
): SessionPayload | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const data = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);

  const secret = deps?.secret ?? sessionSecret();
  const expected = Buffer.from(hmac(secret, data), "base64url");
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = payload as Partial<SessionPayload> | null;
  if (
    !p ||
    (p.alias !== "A" && p.alias !== "B") ||
    typeof p.iat !== "number" ||
    !Number.isFinite(p.iat)
  ) {
    return null;
  }

  const iat = p.iat;
  const ageMs = nowOf(deps?.now) - iat;
  if (ageMs < 0 || ageMs > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return { alias: p.alias, iat };
}

/** Reads the current alias from the request cookies, or null. */
export async function getCurrentAlias(): Promise<Alias | null> {
  const raw = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return verifySession(raw)?.alias ?? null;
}
