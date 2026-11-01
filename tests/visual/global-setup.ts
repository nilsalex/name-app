// Global setup for the visual suite (feature 011, T008):
//   1. load .env.visual (fail fast on missing variables, contract C1.2/C3.2)
//   2. reset the namewahl-visual-test:* namespace (research R3, SC-004)
//   3. boot the dev server on the .env.visual port (contract C1.3)
//   4. sign in once via the real Google flow (research R2) and cache the
//      storage state for the shared worker
// Playwright contract: this module exports a single default function.
import { chromium } from "@playwright/test";
import {
  bootDevServer,
  loadVisualEnv,
  signInAndSaveState,
  tryReuseAuthState,
  type VisualEnv,
} from "./harness";
import { resetTestStore } from "./seed";
import { setVisualEnv } from "./runtime";

export default async function globalSetup(): Promise<void> {
  const env: VisualEnv = loadVisualEnv();
  setVisualEnv(env);
  await resetTestStore();
  await bootDevServer(env);

  if (!(await tryReuseAuthState(env))) {
    const browser = await chromium.launch({
      headless: process.env.VISUAL_HEADED !== "1",
    });
    try {
      await signInAndSaveState(browser, env);
    } finally {
      await browser.close();
    }
  }
}
