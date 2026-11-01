// Typed access to Upstash REST credentials.
// Both variables MUST be set in .env.local (or the deployment environment):
//   UPSTASH_REDIS_REST_URL=https://...upstash.io
//   UPSTASH_REDIS_REST_TOKEN=...
// Next.js loads .env.local automatically; this module fails fast with a
// clear message when either value is missing.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Set ${name} (and UPSTASH_REDIS_REST_TOKEN / UPSTASH_REDIS_REST_URL) ` +
        `in .env.local or your deployment environment.`
    );
  }
  return value;
}

export function upstashUrl(): string {
  return required("UPSTASH_REDIS_REST_URL");
}

export function upstashToken(): string {
  return required("UPSTASH_REDIS_REST_TOKEN");
}
