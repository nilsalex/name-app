// Global setup for the visual suite (feature 012, tasks T009/T015):
//   1. load .env.visual via the suite env loader (fail fast, C1.2/C3.2)
//   2. boot the dev server on the .env.visual port with the mock-mode
//      child env (contract C1.3, research R5) — the in-memory fake store
//      comes up with it; per-run reset IS this boot (research R3), so the
//      011-era resetTestStore() step is gone
//   3. sign in via ONE localhost POST to /internal/visual-signin and save
//      the storage state — ALWAYS per boot (bounded overwrite; no Google,
//      no reuse step, contract C6.5)
// Playwright contract: this module exports a single default function.
import {
  bootDevServer,
  localSignInAndSaveState,
} from "./harness";
import { loadSuiteEnv } from "./seed";
import { setVisualEnv } from "./runtime";

export default async function globalSetup(): Promise<void> {
  const env = loadSuiteEnv();
  setVisualEnv(env);
  await bootDevServer(env);
  await localSignInAndSaveState(env);
}
