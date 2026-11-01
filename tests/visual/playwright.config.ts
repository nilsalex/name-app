// Playwright configuration for the visual verification suite (feature 011,
// research R1/R6, contracts C1.1/C1.3). Invoked via:
//   npm run visual  →  playwright test --config tests/visual/playwright.config.ts
//
// Not part of `npm test` (the 141-test unit/integration gate stays
// untouched). Excluded from the repo tsconfig's build via its own include
// set — `npx tsc --noEmit` type-checks these files like all other code.
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export const VISUAL_CONFIG_PATH = __filename;

export default defineConfig({
  testDir: path.join(__dirname),
  // Setup project (store reset) + the scenarios themselves. Excludes the
  // harness/profile/seed/guarantee modules (no tests inside).
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  // Determinism (SC-004): no retries — a flake must surface and be fixed
  // via the settle protocol, not retried away.
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(__dirname, ".test-results"),
  use: {
    headless: process.env.VISUAL_HEADED !== "1",
    screenshot: "off",
    trace: "off",
    actionTimeout: 15_000,
  },
  globalSetup: path.join(__dirname, "global-setup.ts"),
  globalTeardown: path.join(__dirname, "global-teardown.ts"),
  projects: [
    // A single shared worker reuses one sign-in session (research R2).
    { name: "visual", use: { ...devices["Desktop Chrome"] } },
  ],
});
