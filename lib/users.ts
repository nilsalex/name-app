// Approved-address -> alias mapping (spec 004 FR-004, research.md R4).
// Server-only: values come from secret environment variables, never
// committed, never logged. The variable suffix IS the alias mapping:
//   APPROVED_USER_A_EMAIL -> "A", APPROVED_USER_B_EMAIL -> "B"
// This module replaces lib/user.ts (localStorage identity picker), which is
// removed once US2 switches submitVote to session-derived identities.
// (Kept dependency-light and import-safe for tests: the fail-fast env
// accessors in lib/env.ts are used by assertAuthConfigured, while
// aliasForEmail itself takes an injectable env record.)
import { approvedEmail } from "./env";

export type Alias = "A" | "B";

export interface UsersEnv {
  APPROVED_USER_A_EMAIL?: string;
  APPROVED_USER_B_EMAIL?: string;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Resolves a verified email to its fixed alias, or null when the address is
 * not approved. Case-insensitive and whitespace-tolerant; the email itself
 * is never stored or returned (FR-008).
 */
export function aliasForEmail(email: string, env?: UsersEnv): Alias | null {
  const a = normalize(env?.APPROVED_USER_A_EMAIL ?? safeApproved("A"));
  const b = normalize(env?.APPROVED_USER_B_EMAIL ?? safeApproved("B"));
  const candidate = normalize(email);
  if (candidate !== "" && candidate === a) return "A";
  if (candidate !== "" && candidate === b) return "B";
  return null;
}

function safeApproved(alias: Alias): string | undefined {
  try {
    return approvedEmail(alias);
  } catch {
    return undefined; // missing config surfaces via assertAuthConfigured
  }
}

/**
 * Fail-fast guard for the sign-in path (FR-004): throws with a clear,
 * operator-focused message when the approved-address configuration is
 * missing or malformed (e.g., both aliases mapped to the same address).
 */
export function assertAuthConfigured(): void {
  const a = approvedEmail("A");
  const b = approvedEmail("B");
  if (a.trim() === "" || b.trim() === "") {
    throw new Error(
      "Approved-address configuration is malformed: APPROVED_USER_A_EMAIL " +
        "and APPROVED_USER_B_EMAIL must both be non-empty."
    );
  }
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) {
    throw new Error(
      "Approved-address configuration is malformed: both aliases map to the " +
        "same address; each approved address must be distinct."
    );
  }
}
