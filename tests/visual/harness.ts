// Shared harness for the visual verification suite (feature 011, contract
// C1.2–C1.3, research R2/R4). Provides:
//   - loadVisualEnv(): parse + validate .env.visual (fail fast, C3.2)
//   - bootDevServer(): start `next dev` on the .env.visual port
//   - signInAndSaveState(): real Google sign-in once per run → storage state
//   - tryReuseAuthState(): reuse a warm sealed session (research R2)
//   - settle(): deterministic render/font settle protocol (research R4)
//   - measure(): typed numeric layout readings in ONE page.evaluate
//   - screenshot(): full-page capture into tests/visual/screenshots/ (C4.1)
//
// The suite is an external observer: it never imports app internals —
// CSS-module classes are addressed via substring attribute selectors
// ([class*="nameButton"]) because CSS Modules hashes class names.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { GEOMETRY_TOLERANCE_PX, PHONE_320, type Profile } from "./profiles";

// --- Paths ----------------------------------------------------------------

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const ENV_FILE = path.join(REPO_ROOT, ".env.visual");
export const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");
export const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

/** Environment variables required by the suite (contract C1.2). */
const REQUIRED_ENV_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "STORE_KEY_PREFIX",
  "GOOGLE_CLIENT_ID",
  "APPROVED_EMAILS",
  "SESSION_SECRET",
  "VISUAL_TEST_EMAIL",
  "VISUAL_TEST_PASSWORD",
] as const;

export interface VisualEnv {
  port: number;
  baseUrl: string;
  /** Raw variable map from .env.visual (secrets never logged). */
  vars: Record<string, string>;
}

/**
 * Parses .env.visual (gitignored) and validates every required variable,
 * failing fast with a message naming the missing variable (C1.2/C3.2).
 * Sets the parsed values into process.env so the dev server and all
 * helpers inherit them (process.env wins over any stray .env.local).
 */
export function loadVisualEnv(): VisualEnv {
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      "[visual-setup] Missing environment file .env.visual. " +
        "Fix: create it with PORT=3111, UPSTASH_REDIS_REST_URL/TOKEN, " +
        "STORE_KEY_PREFIX=namewahl-visual-test, GOOGLE_CLIENT_ID, " +
        "APPROVED_EMAILS, SESSION_SECRET, VISUAL_TEST_EMAIL, " +
        "VISUAL_TEST_PASSWORD (see quickstart.md A)."
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
        "Fix: fill in every required variable (see .env.example and quickstart.md)."
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

// --- Dev server (contract C1.3) -------------------------------------------

let serverProcess: ChildProcess | null = null;
let serverLogs: string[] = [];

/** True when something already listens on the port. */
async function portResponds(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    void res;
    return true;
  } catch {
    return false;
  }
}

/**
 * Boots `next dev` on the .env.visual port with the visual environment.
 * Fails fast (C3.2) when the port is already occupied — the suite owns
 * its port; a pre-existing server would point at unknown state.
 */
export async function bootDevServer(env: VisualEnv): Promise<void> {
  if (await portResponds(env.baseUrl)) {
    throw new Error(
      `[visual-setup] Port ${env.port} is already in use — something is listening on ${env.baseUrl}. ` +
        `Fix: stop the process using port ${env.port} (or set another PORT in .env.visual); ` +
        "the visual suite must boot its own dev server with the .env.visual environment."
    );
  }
  serverLogs = [];
  serverProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", String(env.port), "--hostname", "127.0.0.1"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(env.port) },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  serverProcess.stdout?.on("data", (chunk: Buffer) => serverLogs.push(chunk.toString()));
  serverProcess.stderr?.on("data", (chunk: Buffer) => serverLogs.push(chunk.toString()));

  const deadline = Date.now() + 120_000;
  for (;;) {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      throw new Error(
        `[visual-setup] Dev server exited unexpectedly before becoming ready. ` +
          `Last logs:\n${serverLogs.slice(-30).join("")}`
      );
    }
    if (await portResponds(env.baseUrl)) return;
    if (Date.now() > deadline) {
      throw new Error(
        `[visual-setup] Dev server did not become ready on ${env.baseUrl} within 120 s. ` +
          `Last logs:\n${serverLogs.slice(-30).join("")}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Terminates the dev server booted by bootDevServer (global teardown). */
export function shutdownDevServer(): void {
  if (serverProcess !== null && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
}

// --- Google sign-in (research R2) ------------------------------------------

export const AUTH_STATE_EXISTS = (): boolean => existsSync(AUTH_STATE_PATH);

function authStateFresh(): boolean {
  if (!AUTH_STATE_EXISTS()) return false;
  // Sessions live 30 days (lib/session.ts); reuse any state file from the
  // last 24 h — a stale-but-signed state still validates via HTTP below.
  const ageMs = Date.now() - statSync(AUTH_STATE_PATH).mtimeMs;
  return ageMs < 24 * 60 * 60 * 1000;
}

/**
 * Reuses an existing storage state if it still holds a valid signed-in
 * session (research R2: keep the Google session warm between runs).
 * Returns true when reuse succeeded.
 */
export async function tryReuseAuthState(env: VisualEnv): Promise<boolean> {
  if (!authStateFresh()) return false;
  const res: globalThis.Response = await fetch(env.baseUrl, {
    headers: { cookie: cookieHeaderFromState() },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(
      "[visual-setup] Reused visual session could not reach the dev server. " +
        "Fix: delete tests/visual/.auth-state.json and re-run to sign in again."
    );
  }
  const html = await res.text();
  // Signed-in page renders the vote area; signed-out renders the GIS login.
  if (html.includes("nameButton") || html.includes("voteArea")) return true;
  return false;
}

function cookieHeaderFromState(): string {
  const state = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8")) as {
    cookies: Array<{ name: string; value: string }>;
  };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Performs the real Google sign-in once per run through the GIS popup flow
 * (research R2), using VISUAL_TEST_EMAIL / VISUAL_TEST_PASSWORD, and saves
 * the sealed session as Playwright storage state for every scenario.
 * Set VISUAL_HEADED=1 to force a headed browser when Google challenges
 * headless Chromium (C1.4; the environment must have a display).
 */
export async function signInAndSaveState(
  browser: Browser,
  env: VisualEnv
): Promise<void> {
  const email = requireProcessEnv("VISUAL_TEST_EMAIL");
  const password = requireProcessEnv("VISUAL_TEST_PASSWORD");
  const headed = process.env.VISUAL_HEADED === "1";
  let context = await browser.newContext({
    viewport: { width: PHONE_320.width, height: PHONE_320.height },
  });
  let page = await context.newPage();
  try {
    await page.goto(env.baseUrl, { waitUntil: "domcontentloaded" });
    // The GIS button lives in its own iframe; clicking the iframe opens the
    // account-chooser popup.
    const gsiButton = page.locator('iframe[src*="accounts.google.com"]').first();
    await gsiButton.waitFor({ state: "visible", timeout: 30000 });
    await gsiButton.click();
    const popup = await page.context().waitForEvent("page", { timeout: 30000 });
    await popup.waitForLoadState("domcontentloaded");

    // Account chooser: enter the e-mail, then the password.
    const emailInput = popup.locator('input[type="email"]');
    if (await emailInput.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) {
      await emailInput.fill(email);
      await popup.keyboard.press("Enter");
    }
    const passwordInput = popup.locator('input[type="password"]:visible').first();
    await passwordInput.waitFor({ state: "visible", timeout: 30000 });
    await passwordInput.fill(password);
    await popup.keyboard.press("Enter");

    // Possible extra consent step ("I agree" / "Weiter") — best effort.
    for (let i = 0; i < 3; i++) {
      const agree = popup.locator(
        'button:has-text("I agree"), button:has-text("Continue"), ' +
          'button:has-text("Ich stimme zu"), button:has-text("Weiter")'
      );
      if (!(await agree.first().isVisible().catch(() => false))) break;
      await agree.first().click();
      await popup.waitForTimeout(1500);
    }

    // Signed-in: the parent page swaps the login screen for the vote screen.
    await page
      .locator('[class*="voteArea"], [class*="signOut"]')
      .first()
      .waitFor({ state: "visible", timeout: 30000 });

    mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[visual-setup] Google sign-in failed (${headed ? "headed" : "headless"} browser). ` +
        `Google sometimes challenges headless Chromium — re-run with VISUAL_HEADED=1 ` +
        `(a local display is required). Check VISUAL_TEST_EMAIL / VISUAL_TEST_PASSWORD ` +
        `in .env.visual and that the identity is listed in APPROVED_EMAILS. ` +
        `Detail: ${detail}`
    );
  } finally {
    await context.close();
  }
  void page;
}

function requireProcessEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[visual-setup] Missing environment variable ${name} (expected in .env.visual).`
    );
  }
  return value.trim();
}

// --- Settle protocol (research R4) -----------------------------------------

/**
 * Deterministic settle: fonts ready → two rAFs → re-read stability (the
 * document's horizontal metrics must agree within GEOMETRY_TOLERANCE_PX
 * across consecutive frames) — else a few more frames, then fail loudly.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async (tolerance) => {
    const raf = (): Promise<void> =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    await document.fonts.ready;
    await raf();
    const se = document.scrollingElement;
    if (se === null) throw new Error("no scrolling element");
    let prev = { sw: se.scrollWidth, cw: se.clientWidth };
    for (let i = 0; i < 6; i++) {
      await raf();
      const cur = { sw: se.scrollWidth, cw: se.clientWidth };
      if (
        Math.abs(cur.sw - prev.sw) <= tolerance &&
        Math.abs(cur.cw - prev.cw) <= tolerance
      ) {
        return;
      }
      prev = cur;
    }
    throw new Error(
      `settle: layout never stabilized — scrollWidth oscillated beyond ${tolerance} px`
    );
  }, GEOMETRY_TOLERANCE_PX);
}

// --- Measurement (data-model.md "Measurement") ------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BoxMeasurement {
  rect: Rect;
  text: string;
  /** Number of rendered text lines via Range.getClientRects(). */
  lineCount: number;
  /** True when content overflows horizontally (ellipsis territory). */
  ellipsed: boolean;
  fontSize: number;
}

export interface OverlapMeasurement {
  a: string;
  b: string;
  /** Intersection area in px² (both dimensions > tolerance). */
  area: number;
}

export interface Measurement {
  viewport: { width: number; height: number };
  boxes: BoxMeasurement[];
  vsRect: Rect;
  vsFontSize: number;
  hintFontSize: number;
  /** Bounding rect spanning both boxes + separator. */
  row: Rect;
  pageScrollWidth: number;
  pageClientWidth: number;
  overlaps: OverlapMeasurement[];
}

interface EvaluateRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Reads every number the guarantee assertions need in ONE evaluate call
 * (research R4). Call settle(page) first.
 */
export async function measure(page: Page): Promise<Measurement> {
  return page.evaluate((tolerance) => {
    const toRect = (r: DOMRect): EvaluateRect => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    });

    function lineCount(el: Element): number {
      const node = el.firstChild;
      if (node === null || node.nodeType !== Node.TEXT_NODE) return 0;
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = new Set<string>();
      for (const r of range.getClientRects()) tops.add(String(Math.round(r.top)));
      return tops.size;
    }

    const union = (rects: EvaluateRect[]): EvaluateRect => {
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top, left, right, top, bottom };
    };

    const boxes: BoxMeasurement[] = [
      ...document.querySelectorAll<HTMLElement>('[class*="nameButton"]'),
    ].map((el) => {
      const rect = toRect(el.getBoundingClientRect());
      const fontSize = Number.parseFloat(window.getComputedStyle(el).fontSize);
      return {
        rect,
        text: (el.textContent ?? "").trim(),
        lineCount: lineCount(el),
        ellipsed: el.scrollWidth > el.clientWidth + tolerance,
        fontSize,
      };
    });

    const vsEl = document.querySelector<HTMLElement>('[class*="vs"]:not([class*="voteArea"])');
    const vsRect = toRect((vsEl ?? document.body).getBoundingClientRect());
    const vsFontSize = vsEl !== null ? Number.parseFloat(window.getComputedStyle(vsEl).fontSize) : 0;
    const hintEl = document.querySelector<HTMLElement>('[class*="hint"]');
    const hintFontSize = hintEl !== null ? Number.parseFloat(window.getComputedStyle(hintEl).fontSize) : 0;

    const row = boxes.length > 0 ? union([...boxes.map((b) => b.rect as EvaluateRect), vsRect as EvaluateRect]) : toRect(document.body.getBoundingClientRect());

    const se = document.scrollingElement;
    const pageScrollWidth = se ? se.scrollWidth : 0;
    const pageClientWidth = se ? se.clientWidth : 0;

    // Sibling overlap check among the vote area's UI blocks (sign-out
    // button, hint, pair row, notice). Touching edges (≤ tolerance) are not
    // overlaps.
    const overlaps: OverlapMeasurement[] = [];
    const blocks = [
      ...document.querySelectorAll<HTMLElement>('[class*="voteArea"] > *'),
    ];
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i].getBoundingClientRect();
        const b = blocks[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > tolerance && h > tolerance) {
          overlaps.push({
            a: blocks[i].className,
            b: blocks[j].className,
            area: Math.round(w * h),
          });
        }
      }
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      boxes,
      vsRect,
      vsFontSize,
      hintFontSize,
      row,
      pageScrollWidth,
      pageClientWidth,
      overlaps,
    };
  }, GEOMETRY_TOLERANCE_PX);
}

/** Convenience: settle + measure in one call. */
export async function measureSettled(page: Page): Promise<Measurement> {
  await settle(page);
  return measure(page);
}

// --- Screenshots (contract C4.1) --------------------------------------------

/** Full-page screenshot into tests/visual/screenshots/ (gitignored). */
export async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: true,
  });
}

export { GEOMETRY_TOLERANCE_PX, PHONE_320 };
export type { Profile };
