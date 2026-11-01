// Typed access to deployment credentials.
// All variables MUST be set in .env.local (or the deployment environment):
//   UPSTASH_REDIS_REST_URL=https://...upstash.io
//   UPSTASH_REDIS_REST_TOKEN=...
//   GOOGLE_CLIENT_ID=...apps.googleusercontent.com   (004)
//   APPROVED_USER_A_EMAIL=...                        (004)
//   APPROVED_USER_B_EMAIL=...                        (004)
//   SESSION_SECRET=<>= 32 random bytes>              (004)
// Next.js loads .env.local automatically; this module fails fast with a
// clear message when a required value is missing or malformed. Values are
// secrets: never logged, never committed, never sent to the client except
// GOOGLE_CLIENT_ID (public by design, passed as a prop).

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Set ${name} (and the other secrets, see .env.example) ` +
        `in .env.local or your deployment environment.`
    );
  }
  return value.trim();
}

export function upstashUrl(): string {
  return required("UPSTASH_REDIS_REST_URL");
}

export function upstashToken(): string {
  return required("UPSTASH_REDIS_REST_TOKEN");
}

// --- Feature 004 (Gmail login) configuration ---------------------------

/** Google OAuth client ID (public by design; used for the aud check). */
export function googleClientId(): string {
  return required("GOOGLE_CLIENT_ID");
}

/** HMAC key for the session cookie; must be at least 32 bytes. */
export function sessionSecret(): string {
  const value = required("SESSION_SECRET");
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(
      "SESSION_SECRET is too short: it must be at least 32 bytes " +
        "(generate one with `openssl rand -base64 32`)."
    );
  }
  return value;
}

/**
 * Approved Gmail address for the given alias ("A" or "B").
 * The variable suffix IS the alias mapping (spec 004 FR-004):
 * APPROVED_USER_A_EMAIL -> alias "A", APPROVED_USER_B_EMAIL -> alias "B".
 */
export function approvedEmail(alias: "A" | "B"): string {
  return required(
    alias === "A" ? "APPROVED_USER_A_EMAIL" : "APPROVED_USER_B_EMAIL"
  );
}
