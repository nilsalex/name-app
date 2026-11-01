"use server";

// Server actions for the voting app (contracts/contracts.md).
import { COLOGNE_200_BOY_NAMES } from "@/lib/names";
import {
  recordVote,
  scores,
  userScores,
  userSeen,
  bumpUserSeen,
} from "@/lib/store";
import { rankNames } from "@/lib/ranking";
import type { RankedName } from "@/lib/ranking";
import {
  sealSession,
  verifySession,
  getCurrentUid,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import {
  verifyGoogleIdToken,
  type VerifyDeps,
  type GoogleVerifyResult,
} from "@/lib/google-verify";
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
      /** Safe, operator-facing diagnostic (spec 005 debugging aid);
       *  present only on failures. NEVER contains secret or token values
       *  — only variable names or which token check failed. */
      detail?: string;
      /** Present only when reason comes from token verification. */
      stage?: "aud-mismatch" | "email-unverified" | "email-missing" | "expired" | "fetch-failed" | "token-rejected";
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
 * The verified-identity dependency (feature 012, research R2): the ONLY
 * external step of the real sign-in path, abstracted so the suite's
 * internal route can inject a pre-verified identity. The production shape
 * is exactly `verifyGoogleIdToken(idToken, deps?)` — the default below —
 * so the production call path is byte-identical to pre-012 (FR-004/C6.6).
 */
export type VerifiedIdentityProvider = (
  idToken: unknown,
  verifyDeps?: Parameters<typeof verifyGoogleIdToken>[1]
) => Promise<GoogleVerifyResult>;

/** Default: the real Google verifier (production path, unchanged). */
function defaultVerify(
  idToken: unknown,
  verifyDeps?: Parameters<typeof verifyGoogleIdToken>[1]
): Promise<GoogleVerifyResult> {
  // The verifier re-checks the token shape defensively (unchanged behavior).
  return verifyGoogleIdToken(
    typeof idToken === "string" ? idToken : "",
    verifyDeps
  );
}

/**
 * The optional verified-identity dependency (feature 012 T012, research
 * R2): when omitted — every production and manual-dev caller — the real
 * `verifyGoogleIdToken` runs and NOTHING else changes. Only the suite's
 * internal route (app/internal/visual-signin) passes the injection, which
 * skips token verification and feeds the fixed suite identity straight
 * into the UNCHANGED remainder of the real sign-in path below:
 * assertAuthConfigured → approved-email check → resolveUser (persistent
 * record) → sealSession (real cookie format, suite SESSION_SECRET) →
 * cookies().set. No other logic moved (US2 acceptance scenario 2).
 */
export async function signIn(
  idToken: unknown,
  verifyDeps?: Parameters<typeof verifyGoogleIdToken>[1],
  verifiedIdentity: VerifiedIdentityProvider = defaultVerify
): Promise<SignInResult> {
  try {
    if (typeof idToken !== "string" || idToken.trim() === "") {
      return { ok: false, reason: "invalid-token" };
    }
    const verified = await verifiedIdentity(idToken, verifyDeps);
    if (!verified.ok) {
      if (verified.reason === "server-config") {
        return {
          ok: false,
          reason: "server-config",
          detail:
            "Environment check failed for GOOGLE_CLIENT_ID (name only, never its value).",
        };
      }
      return { ok: false, reason: verified.reason, stage: verified.stage };
    }
    assertAuthConfigured();
    if (!isApprovedEmail(verified.email, parseApprovedEmails(approvedEmails()))) {
      return { ok: false, reason: "not-approved" };
    }
    // Feature 007: forward the verified first name; resolveUser stores it
    // only on record creation and never updates an existing record (R4).
    const record = await createUserStore().resolveUser(verified.email, verified.firstName);
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
    // Missing/malformed secret configuration is an operator error (FR-011).
    console.error("signIn failed:", err);
    // Safe diagnostic: expose only which variable is misconfigured (name
    // only, never its value) so deployment issues are debuggable without
    // runtime-log access. Anything else (file paths, stack frames, token
    // fragments) is suppressed.
    const msg = err instanceof Error ? err.message : String(err);
    const varMatch = /(?:variable|MISSING)\s+([A-Z_]{3,})|([A-Z_]{3,})\s+(?:is|must|exists)/.exec(
      msg
    );
    const namedVar = varMatch?.[1] ?? varMatch?.[2];
    return {
      ok: false,
      reason: "server-config",
      detail: namedVar
        ? `Environment check failed for ${namedVar} (name only, never its value).`
        : "Unknown server configuration problem.",
    };
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

/**
 * The signed-in user's personal ranking of all 200 names (feature 006 US1,
 * FR-001/FR-002): computed EXCLUSIVELY from the user's own vote tally.
 * Returns null when signed out — callers render a login prompt (research R6);
 * no global fallback, and zero store reads happen in that case (INV-1).
 */
export async function getRanking(): Promise<RankedName[] | null> {
  const uid = await getCurrentUid();
  if (uid === null) return null;
  const current = await userScores(uid);
  return rankNames(COLOGNE_200_BOY_NAMES, current);
}

/**
 * The signed-in user's personal win tally AND seen-frequency (feature 006
 * US2, contracts.md). Throwing when signed out is intentional: the vote
 * screen's only caller redirects to login on failure (unchanged behavior).
 *
 * With `freshBatch` (refill call): bumps the batch's name-slots in the
 * user's seen zset — the SINGLE writer of seen-frequency (research R4).
 * The bump happens after the read and its failure is logged, never thrown
 * (contracts.md: seen-frequency is heuristic, availability wins).
 * Without `freshBatch` (mount call): read-only.
 */
export async function getScores(
  freshBatch?: readonly string[]
): Promise<{ scores: Record<string, number>; seen: Record<string, number> }> {
  const uid = await getCurrentUid();
  if (uid === null) {
    throw new Error("Not signed in");
  }
  const [personalScores, personalSeen] = await Promise.all([
    userScores(uid),
    userSeen(uid),
  ]);
  if (freshBatch && freshBatch.length > 0) {
    try {
      await bumpUserSeen(uid, freshBatch);
    } catch (err) {
      // bumpUserSeen already swallows its own errors; this is belt-and-braces.
      console.error("seen bump failed (non-fatal):", err);
    }
  }
  return { scores: personalScores, seen: personalSeen };
}

/**
 * The name(s) at personal rank 1, including ties (feature 006 US1/FR-003).
 * Signed out → { ok: false } (UI shows the login prompt, INV-1).
 * Signed in with zero personal votes → { ok: true, winners: [] }.
 */
export async function getWinners(): Promise<WinnersResult> {
  try {
    const ranking = await getRanking();
    if (ranking === null) return { ok: false, error: "Nicht angemeldet." };
    // Zero personal votes → no winners yet (UI: "Noch keine Stimmen — alle
    // Namen führen!"); with any vote cast, rank-1 names all have score ≥ 1,
    // so the score guard only affects the empty-tally state.
    const winners = ranking
      .filter((r) => r.rank === 1 && r.score > 0)
      .map((r) => r.name);
    return { ok: true, winners };
  } catch (err) {
    console.error("getWinners failed:", err);
    return { ok: false, error: "Rangliste konnte nicht geladen werden." };
  }
}
