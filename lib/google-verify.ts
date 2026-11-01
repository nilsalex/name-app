// Google ID token verification (spec 004, research.md R2). Server-only.
//
// Verifies a Google-issued ID token via Google's tokeninfo endpoint —
// Google itself confirms signature validity, so no JWT library is needed
// (one HTTPS call per sign-in, a rare event). Checks aud, email_verified
// and exp per Google's "verify the ID token" guidance. The email is
// returned only to the caller for allowlist matching and never stored or
// logged (FR-008).
import "server-only";
import { googleClientId } from "./env";

export interface GoogleTokenClaims {
  aud?: string;
  email?: string;
  email_verified?: string;
  /** Google's tokeninfo returns this as a STRING (all fields are strings);
   *  Number() coercion happens in the exp check. */
  exp?: number | string;
}

export type GoogleVerifyResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason: "invalid-token" | "server-config";
      /** Safe diagnostic tag for operator debugging (spec 005 probe);
       *  never contains token contents, only which check failed. */
      stage?:
        | "aud-mismatch"
        | "email-unverified"
        | "email-missing"
        | "expired"
        | "fetch-failed"
        | "token-rejected";
    };

export interface VerifyDeps {
  clientId?: string;
  fetchTokenInfo?: typeof fetch;
  now?: () => number;
}

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/**
 * Verifies a Google ID token and returns the verified email, or a
 * discriminated failure. All security-relevant checks happen here, close
 * to the decision (Next.js auth guide: Data Access Layer pattern).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  deps?: VerifyDeps
): Promise<GoogleVerifyResult> {
  let clientId: string;
  try {
    clientId = deps?.clientId ?? googleClientId();
  } catch {
    return { ok: false, reason: "server-config" };
  }

  if (typeof idToken !== "string" || idToken.trim() === "") {
    return { ok: false, reason: "invalid-token" };
  }

  let response: Response;
  try {
    const doFetch = deps?.fetchTokenInfo ?? fetch;
    response = await doFetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  } catch {
    return { ok: false, reason: "invalid-token", stage: "fetch-failed" };
  }
  if (!response.ok) {
    return { ok: false, reason: "invalid-token", stage: "token-rejected" };
  }

  let claims: unknown;
  try {
    claims = await response.json();
  } catch {
    return { ok: false, reason: "invalid-token" };
  }
  const c = (claims ?? {}) as GoogleTokenClaims;
  if (typeof c !== "object" || Array.isArray(claims)) {
    return { ok: false, reason: "invalid-token" };
  }

  if (c.aud !== clientId)
    return { ok: false, reason: "invalid-token", stage: "aud-mismatch" };
  if (c.email_verified !== "true")
    return { ok: false, reason: "invalid-token", stage: "email-unverified" };
  if (typeof c.email !== "string" || c.email.trim() === "") {
    return { ok: false, reason: "invalid-token", stage: "email-missing" };
  }
  const nowSec = Math.floor((deps?.now ? deps.now() : Date.now()) / 1000);
  // Google's tokeninfo endpoint returns ALL fields as JSON strings —
  // including numeric ones like exp (e.g. "exp": "1762342400"; the same
  // reason email_verified is compared against the string "true"). Accept
  // both string and number forms; anything non-numeric is fatal.
  const expSec = Number(c.exp);
  if (!Number.isFinite(expSec) || expSec <= nowSec) {
    return { ok: false, reason: "invalid-token", stage: "expired" };
  }

  return { ok: true, email: c.email.trim() };
}
