"use server";

// Server actions for the voting app (contracts/contracts.md).
import { COLOGNE_200_BOY_NAMES } from "@/lib/names";
import { recordVote, scores } from "@/lib/store";
import { rankNames } from "@/lib/ranking";
import type { RankedName } from "@/lib/ranking";
import {
  sealSession,
  verifySession,
  getCurrentUid,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import { verifyGoogleIdToken } from "@/lib/google-verify";
import {
  parseApprovedEmails,
  isApprovedEmail,
  assertAuthConfigured,
} from "@/lib/users";
import { approvedEmails } from "@/lib/env";
import { createUserStore, displayLabel, findUserById } from "@/lib/user-store";
import { cookies } from "next/headers";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type SignInResult =
  | { ok: true; uid: string; label: string }
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
 * Verifies a Google ID token and, for an approved address, resolves the
 * persistent internal user record and sets the signed session cookie
 * (spec 005 FR-001/FR-002/FR-004, contracts.md §1). The email is the
 * lookup key at sign-in ONLY — never returned, logged, or stored in votes
 * or sessions (FR-008/FR-012). Denial happens BEFORE any user-store
 * access: a non-approved account leaves no record (FR-003, research R7).
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
    if (!isApprovedEmail(verified.email, parseApprovedEmails(approvedEmails()))) {
      return { ok: false, reason: "not-approved" };
    }
    const record = await createUserStore().resolveUser(verified.email);
    const sealed = sealSession({ uid: record.id, iat: Date.now() });
    (await cookies()).set(SESSION_COOKIE_NAME, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return { ok: true, uid: record.id, label: displayLabel(record) };
  } catch (err) {
    // Missing/malformed secret configuration is an operator error (FR-011):
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
 * The uid is derived from the session cookie — the client can no longer
 * choose the identity (US2, FR-005). The recorded `user` value is the
 * opaque internal user id (22-char base64url).
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
    const uid = await getCurrentUid();
    if (uid === null) {
      return { ok: false, error: "Abgelaufen — bitte neu anmelden." };
    }
    await recordVote({ winner, loser, user: uid });
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
