// Suite environment loader (feature 012, research R3/R5, contract C1.2).
//
// Feature 012 removed the suite's external dependencies entirely: there is
// no Upstash client here any more — the suite's server runs against the
// in-process fake store (app/fake-store.ts), so per-run reset is the dev
// server's process lifecycle and no store credentials are needed. This
// module only parses/validates the committed `.env.visual` template
// (fail-fast `[visual-setup]` reporting, contract C3.2) and builds the
// explicit child env for the suite's dev server.
//
// Exports (contract C6.5 shape; used by harness.ts):
//   loadSuiteEnv()  — parse + validate .env.visual (fail fast, C3.2)
//   buildServerEnv(env) — the dev-server child env: every key set
//                         explicitly (Next gives real environment
//                         variables precedence over .env.local, so the
//                         suite's values always win — research R5)
import { existsSync, readFileSync } from "node:fs";
import { ENV_FILE } from "./harness-paths";

export const VISUAL_TEST_PREFIX = "namewahl-visual-test";

/** The suite identity (data-model.md "Suite test identity"). */
export const SUITE_EMAIL = "visual-suite@nameapp.invalid";
/** Fixed first name captured by resolveUser at each run's first boot. */
export const SUITE_FIRST_NAME = "Visueller Tester";

/** Environment variables required in .env.visual (contract C1.2, amended). */
const REQUIRED_ENV_VARS = [
  "VISUAL_MOCK_EXTERNAL",
  "APPROVED_EMAILS",
  "SESSION_SECRET",
] as const;

/** Environment variables required by the suite; missing ones fail fast
 *  with a message naming the variable (contract C1.2/C3.2). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[visual-setup] Missing environment variable ${name}. ` +
        `Fix: set ${name} in .env.visual (see quickstart.md).`
    );
  }
  return value.trim();
}

export interface VisualEnv {
  port: number;
  baseUrl: string;
  /** Raw variable map from .env.visual (secrets never logged). */
  vars: Record<string, string>;
}

/**
 * Parses .env.visual (the committed template) and validates every required
 * variable, failing fast with a message naming the missing variable
 * (C1.2/C3.2). Mock mode requires VISUAL_MOCK_EXTERNAL=1 exactly.
 */
export function loadSuiteEnv(): VisualEnv {
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      "[visual-setup] Missing environment file .env.visual. " +
        "Fix: the committed template ships with the repo — restore it " +
        "(`git checkout .env.visual`); it needs no edits (see quickstart.md A)."
    );
  }
  const vars: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  const missing = REQUIRED_ENV_VARS.filter(
    (name) => !vars[name] || vars[name].trim() === ""
  );
  if (missing.length > 0) {
    throw new Error(
      `[visual-setup] Missing environment variable(s) in .env.visual: ${missing.join(", ")}. ` +
        "Fix: restore the committed .env.visual template (`git checkout .env.visual`) — " +
        "it ships complete (see quickstart.md A)."
    );
  }
  if (vars["VISUAL_MOCK_EXTERNAL"] !== "1") {
    throw new Error(
      "[visual-setup] VISUAL_MOCK_EXTERNAL must be 1 for the visual suite " +
        `(found: "${vars["VISUAL_MOCK_EXTERNAL"]}"). ` +
        "Fix: the mock-mode marker enables the in-memory store and the local " +
        "sign-in endpoint; restore the committed template value VISUAL_MOCK_EXTERNAL=1."
    );
  }
  if (Buffer.byteLength(vars["SESSION_SECRET"], "utf8") < 32) {
    throw new Error(
      "[visual-setup] SESSION_SECRET in .env.visual is too short: it must be " +
        "at least 32 bytes. Fix: generate one with `openssl rand -base64 32`."
    );
  }
  const port = vars["PORT"] !== undefined && vars["PORT"] !== "" ? Number(vars["PORT"]) : 3111;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`[visual-setup] PORT in .env.visual is not a valid port: "${vars["PORT"]}".`);
  }
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
  return { port, baseUrl: `http://127.0.0.1:${port}`, vars };
}

/**
 * Builds the dev-server child env: everything from .env.visual PLUS the
 * mock-mode contract keys (research R5). Every key is set explicitly —
 * Next gives real environment variables precedence over .env.local, so no
 * personal credentials can leak into the suite server.
 *
 * The dummy Upstash pair satisfies lib/env.ts's fail-fast env contract but
 * is NEVER contacted: the instrumentation hook replaces the store client
 * with the in-process fake before the first request (contract C6.2).
 */
export function buildServerEnv(env: VisualEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Suite inputs from .env.visual (already merged into process.env by
    // loadSuiteEnv; restated for explicitness per research R5).
    PORT: String(env.port),
    VISUAL_MOCK_EXTERNAL: "1",
    APPROVED_EMAILS: env.vars["APPROVED_EMAILS"],
    SESSION_SECRET: env.vars["SESSION_SECRET"],
    // Mock-mode contract keys (fixed constants — never env-driven).
    STORE_KEY_PREFIX: VISUAL_TEST_PREFIX,
    UPSTASH_REDIS_REST_URL: "https://mock.invalid",
    UPSTASH_REDIS_REST_TOKEN: "mock-token",
    // Public GIS client id: lib/env.ts requires it to exist so the login
    // page renders; mock mode never verifies against Google, so the
    // well-formed dummy value from .env.visual is sufficient.
    GOOGLE_CLIENT_ID: env.vars["GOOGLE_CLIENT_ID"],
  };
}
