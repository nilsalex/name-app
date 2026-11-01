// Path constants shared by the visual suite's setup modules (feature 012).
// Split from harness.ts so seed.ts can import ENV_FILE without a cycle
// (harness.ts imports seed.ts for the env loader).
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const ENV_FILE = path.join(REPO_ROOT, ".env.visual");
export const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");
export const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
