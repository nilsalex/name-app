// Runtime state shared between the global setup and the scenario files:
// the parsed .env.visual (port, baseUrl) set once by globalSetup.
import type { VisualEnv } from "./harness";

let env: VisualEnv | undefined;

/** Stores the parsed environment (called by globalSetup). */
export function setVisualEnv(value: VisualEnv): void {
  env = value;
}

/** The parsed environment; throws when globalSetup has not run. */
export function visualEnv(): VisualEnv {
  if (env === undefined) {
    throw new Error(
      "[visual-setup] Global setup has not run — no environment available. " +
        "Run the suite via `npm run visual` (never a bare spec file)."
    );
  }
  return env;
}
