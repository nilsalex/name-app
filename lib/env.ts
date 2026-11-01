// Typed access to deployment credentials.
// All variables MUST be set in .env.local (or the deployment environment):
//   UPSTASH_REDIS_REST_URL=https://...upstash.io
//   UPSTASH_REDIS_REST_TOKEN=...
//   GOOGLE_CLIENT_ID=...apps.googleusercontent.com   (004)
//   APPROVED_EMAILS=... comma-separated              (004/005)
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
 * Raw comma-separated approved-address list (spec 005 FR-011):
 * APPROVED_EMAILS=person.a@gmail.com,person.b@gmail.com. Parsing
 * and normalization live in lib/users.ts.
 */
export function approvedEmails(): string {
  return required("APPROVED_EMAILS");
}
