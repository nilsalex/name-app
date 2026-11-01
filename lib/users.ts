// Approved-address configuration (spec 005 FR-011, research.md R4).
// Server-only: the value comes from a secret environment variable, never
// committed, never logged. One comma-separated variable replaces 004's
// per-alias pair; adding a user means editing the value — no code change,
// no data migration (SC-006).
import { approvedEmails } from "./env";

/**
 * Parses the raw APPROVED_EMAILS value into a normalized list
 * (trim + lowercase per element, empty segments dropped, deduped).
 * Throws with the variable name when nothing parsable remains
 * (fail-fast, FR-011 / research R4).
 */
export function parseApprovedEmails(
  raw: string | undefined
): string[] {
  const parsed = [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((segment) => segment.trim().toLowerCase())
        .filter((segment) => segment !== "")
    ),
  ];
  if (parsed.length === 0) {
    throw new Error(
      "Approved-address configuration is missing or empty: " +
        "APPROVED_EMAILS must list at least one address, " +
        "comma-separated (e.g. APPROVED_EMAILS=person.a@gmail.com,person.b@gmail.com)."
    );
  }
  return parsed;
}

/**
 * Checks a candidate email against a normalized approved list.
 * The candidate is normalized the same way at the call site boundary.
 */
export function isApprovedEmail(
  email: string,
  approved: string[]
): boolean {
  return approved.includes(email.trim().toLowerCase());
}

/**
 * Fail-fast guard for the sign-in path: throws a clear, operator-focused
 * message when the approved-address configuration is missing or empty.
 */
export function assertAuthConfigured(raw?: string): void {
  parseApprovedEmails(raw ?? safeApproved());
}

function safeApproved(): string | undefined {
  try {
    return approvedEmails();
  } catch {
    return undefined; // error surfaces via parseApprovedEmails above
  }
}
