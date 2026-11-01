"use server";

// Server actions for the voting app (contracts/contracts.md).
import { COLOGNE_200_BOY_NAMES } from "@/lib/names";
import { recordVote, scores } from "@/lib/store";
import { rankNames } from "@/lib/ranking";
import type { RankedName } from "@/lib/ranking";
import type { Alias } from "@/lib/session";
import {
  sealSession,
  verifySession,
  getCurrentAlias,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import { verifyGoogleIdToken } from "@/lib/google-verify";
import { aliasForEmail, assertAuthConfigured } from "@/lib/users";
import { cookies } from "next/headers";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type SignInResult =
  | { ok: true; alias: "A" | "B" }
  | {
      ok: false;
      reason: "invalid-token" | "not-approved" | "server-config";
    };

export interface WinnersResult {
  ok: boolean;
  winners?: string[];
  error?: string;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && COLOGNE_200_BOY_NAMES.includes(value);
}

/**
 * Verifies a Google ID token and, for an approved address, sets the
 * signed session cookie (spec 004 FR-002/FR-003/FR-004). Never returns or
 * logs the email (FR-008).
 */
export async function signIn(idToken: unknown): Promise<SignInResult> {
  try {
    if (typeof idToken !== "string" || idToken.trim() === "") {
      return { ok: false, reason: "invalid-token" };
    }
    const verified = await verifyGoogleIdToken(idToken);
    if (!verified.ok) {
      return { ok: false, reason: verified.reason };
    }
    assertAuthConfigured();
    const alias = aliasForEmail(verified.email);
    if (alias === null) {
      return { ok: false, reason: "not-approved" };
    }
    const sealed = sealSession({ alias, iat: Date.now() });
    (await cookies()).set(SESSION_COOKIE_NAME, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return { ok: true, alias };
  } catch (err) {
    // Missing/malformed secret configuration is an operator error (FR-004):
    // fail the sign-in without leaking details to the client.
    console.error("signIn failed:", err);
    return { ok: false, reason: "server-config" };
  }
}

/**
 * Ends the session (spec 004 US3, FR-007): deletes the session cookie.
 * Idempotent — succeeds even without a session.
 */
export async function signOut(): Promise<{ ok: true }> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return { ok: true };
}

/**
 * Validates and records one vote; returns error state on failure (FR-012).
 * Spec 004 (T016): the alias is derived from the session cookie — the
 * client can no longer choose the identity (US2, FR-005/FR-009).
 */
export async function submitVote(
  winner: unknown,
  loser: unknown
): Promise<ActionResult> {
  try {
    if (!isName(winner) || !isName(loser)) {
      return { ok: false, error: "Unbekannter Name." };
    }
    if (winner === loser) {
      return { ok: false, error: "Ein Paar muss aus zwei verschiedenen Namen bestehen." };
    }
    const alias = await getCurrentAlias();
    if (alias === null) {
      return { ok: false, error: "Abgelaufen — bitte neu anmelden." };
    }
    await recordVote({ winner, loser, user: alias as Alias });
    return { ok: true };
  } catch (err) {
    // FR-012: failed submissions must NOT count and must be reported.
    console.error("submitVote failed:", err);
    return { ok: false, error: "Speichern fehlgeschlagen — bitte nochmal versuchen." };
  }
}

/** Current ranking of all 200 names (FR-007/FR-008, FR-014 shared ranks). */
export async function getRanking(): Promise<RankedName[]> {
  const current = await scores();
  return rankNames(COLOGNE_200_BOY_NAMES, current);
}

/** Raw win counts for weighted pair selection (feature 002, FR-006). */
export async function getScores(): Promise<Record<string, number>> {
  return scores();
}

/** The name(s) at rank 1, including ties (FR-009). */
export async function getWinners(): Promise<WinnersResult> {
  try {
    const ranking = await getRanking();
    const winners = ranking.filter((r) => r.rank === 1).map((r) => r.name);
    return { ok: true, winners };
  } catch (err) {
    console.error("getWinners failed:", err);
    return { ok: false, error: "Rangliste konnte nicht geladen werden." };
  }
}
