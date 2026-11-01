// Playwright configuration for the visual verification suite (feature 011,
// research R1/R6, contracts C1.1/C1.3). Invoked via:
//   npm run visual  →  playwright test --config tests/visual/playwright.config.ts
//
// Not part of `npm test` (the 141-test unit/integration gate stays
// untouched). Excluded from the repo tsconfig's build via its own include
// set — `npx tsc --noEmit` type-checks these files like all other code.
import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// NixOS: Playwright's downloaded chromium-headless-shell is a dynamically
// linked generic-Linux binary and cannot run (stub-ld). When a Nix-built
// chromium is available, use it via executablePath.
const NIX_CHROMIUM =
  "/nix/store/66fwidpz045aq5s9szdkg7znc4skgdwx-chromium-143.0.7499.169/bin/chromium";
const executablePath = existsSync(NIX_CHROMIUM) ? NIX_CHROMIUM : undefined;

// Font parity (NixOS): the app's fitting math (features 009/010) assumes
// Arial metrics (globals.css font-family). This host only ships DejaVu
// Sans (≈10% wider), which breaks the fitting guarantees spuriously.
// Liberation Sans is metric-compatible with Arial; when it is present, a
// suite-private fontconfig maps Arial/Helvetica to it and browsers get it
// via FONTCONFIG_FILE (launchOptions.env).
const LIBERATION_SANS =
  "/nix/store/szyh5qg39v1cm1a13lwzqxgdwp0vaprv-liberation-fonts-2.1.5/share/fonts/truetype/LiberationSans-Regular.ttf";

function liberationFontconfigEnv(): Record<string, string> {
  if (!existsSync(LIBERATION_SANS)) return {};
  const dir = path.dirname(LIBERATION_SANS);
  const confDir = path.join(__dirname, ".fontconfig");
  const { mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  mkdirSync(confDir, { recursive: true });
  writeFileSync(
    path.join(confDir, "fonts.conf"),
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${confDir}/cache</cachedir>
  <match target="pattern">
    <test qual="any" name="family"><string>Arial</string></test>
    <edit name="family" mode="assign" binding="same"><string>Liberation Sans</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>Helvetica</string></test>
    <edit name="family" mode="assign" binding="same"><string>Liberation Sans</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="assign" binding="same"><string>Liberation Sans</string></edit>
  </match>
</fontconfig>
`,
    "utf8"
  );
  return { FONTCONFIG_FILE: path.join(confDir, "fonts.conf") };
}
const fontEnv = liberationFontconfigEnv();

// baseURL for the scenarios (they navigate to `${baseURL}/`): the suite
// port comes from .env.visual (same file the global setup parses).
const ENV_FILE = path.join(__dirname, "..", "..", ".env.visual");
function suitePort(): number {
  if (existsSync(ENV_FILE)) {
    const m = readFileSync(ENV_FILE, "utf8").match(/^PORT=(\d+)$/m);
    if (m) return Number(m[1]);
  }
  return 3111;
}

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
    baseURL: `http://127.0.0.1:${suitePort()}`,
    // Shared sign-in session (research R2): the global setup signs the
    // suite identity in once per boot and saves the storage state here;
    // every scenario context starts signed-in (the logged-out scenario
    // clears cookies explicitly). Fails softly to logged-out when the
    // file is absent (e.g. first bring-up debugging).
    storageState: existsSync(path.join(__dirname, ".auth-state.json"))
      ? path.join(__dirname, ".auth-state.json")
      : undefined,
    ...(executablePath
      ? { launchOptions: { executablePath, env: { ...fontEnv } } }
      : {}),
  },
  globalSetup: path.join(__dirname, "global-setup.ts"),
  globalTeardown: path.join(__dirname, "global-teardown.ts"),
  projects: [
    // A single shared worker reuses one sign-in session (research R2).
    { name: "visual", use: { ...devices["Desktop Chrome"] } },
  ],
});
