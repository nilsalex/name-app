// Shared harness for the visual verification suite (feature 011, contract
// C1.2–C1.3, research R2/R4; credential-free since feature 012):
//   - bootDevServer(): start `next dev` on the .env.visual port with the
//     mock-mode child env (loadSuiteEnv/buildServerEnv live in seed.ts)
//   - localSignInAndSaveState(): one localhost POST to the suite's internal
//     sign-in endpoint per run → storage state (feature 012, contract C6.5)
//   - settle(): deterministic render/font settle protocol (research R4)
//   - measure(): typed numeric layout readings in ONE page.evaluate
//   - screenshot(): full-page capture into tests/visual/screenshots/ (C4.1)
//
// The suite is an external observer: it never imports app internals —
// CSS-module classes are addressed via substring attribute selectors
// ([class*="nameButton"]) because CSS Modules hashes class names.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { GEOMETRY_TOLERANCE_PX, PHONE_320, type Profile } from "./profiles";
import { AUTH_STATE_PATH, SCREENSHOTS_DIR, REPO_ROOT } from "./harness-paths";
import {
  loadSuiteEnv,
  buildServerEnv,
  type VisualEnv,
} from "./seed";

export { loadSuiteEnv, buildServerEnv };
export type { VisualEnv };

// --- Paths ----------------------------------------------------------------

export { REPO_ROOT, AUTH_STATE_PATH, SCREENSHOTS_DIR };

/** Environment variables required by the suite: see seed.ts (feature 012) —
 *  mock-mode contract, loaded via loadSuiteEnv(). */

/**
 * Parses .env.visual (committed template) and validates every required
 * variable (contract C1.2, feature 012 shape) — implemented in seed.ts;
 * re-exported here for the harness's existing import surface.
 */

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
 * Boots `next dev` on the .env.visual port with the mock-mode child env
 * (buildServerEnv, feature 012 — every key set explicitly so Next's
 * .env.local auto-loading cannot leak personal credentials into the suite
 * server, research R5). Fails fast (C3.2) when the port is already
 * occupied — the suite owns its port; a pre-existing server would point at
 * unknown state.
 */
export async function bootDevServer(env: VisualEnv, childEnv?: NodeJS.ProcessEnv): Promise<void> {
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
      env: childEnv ?? buildServerEnv(env),
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

// --- Local sign-in (feature 012, research R2/R4, contract C6.5) ------------

/** The suite's internal sign-in endpoint (contract C6.4). */
export const VISUAL_SIGNIN_ENDPOINT = "/internal/visual-signin";

/**
 * Signs the suite identity in ONCE per run via a single localhost POST to
 * `{baseUrl}/internal/visual-signin` — the app's REAL sign-in path minus
 * the Google verification hop (the endpoint calls the injected variant of
 * the real `signIn` action, so `resolveUser` → `sealSession` →
 * `cookies().set` all run for real) — and persists the session cookie as
 * Playwright storage state at the existing AUTH_STATE_PATH.
 *
 * The POST doubles as the mock-boot canary (research R4): it performs a
 * REAL store write + read through the fake, so any misconfiguration of the
 * marker variable or the store injection surfaces here as a named setup
 * error (C3.2) instead of silent layout-less scenarios later.
 *
 * Storage state is ALWAYS overwritten per boot (bounded overwrite — no
 * freshness window, no reuse step; the 011-era Google GIS flow is removed).
 */
export async function localSignInAndSaveState(env: VisualEnv): Promise<void> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${env.baseUrl}${VISUAL_SIGNIN_ENDPOINT}`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[visual-setup] Internal sign-in endpoint unreachable at ` +
        `${env.baseUrl}${VISUAL_SIGNIN_ENDPOINT} — the mock boot canary failed. ` +
        `Fix: check that the dev server booted with VISUAL_MOCK_EXTERNAL=1 in its ` +
        `environment (the marker enables the endpoint). Detail: ${detail}`
    );
  }
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || setCookie === null) {
    throw new Error(
      `[visual-setup] Internal sign-in endpoint returned ${res.status} ` +
        `(expected 200 + Set-Cookie) at ${env.baseUrl}${VISUAL_SIGNIN_ENDPOINT}. ` +
        `Fix: 404 means the dev server env lacks VISUAL_MOCK_EXTERNAL=1 — check ` +
        `buildServerEnv() in tests/visual/seed.ts and the committed .env.visual.`
    );
  }
  // Persist the session as Playwright storage state (same mechanism 011
  // used for the Google session; scenarios load it unchanged).
  const cookieMatch = /([^=]+)=([^;]*)/.exec(setCookie);
  if (cookieMatch === null) {
    throw new Error(
      `[visual-setup] Internal sign-in endpoint returned an unparsable Set-Cookie header. ` +
        `Detail: ${setCookie.slice(0, 40)}…`
    );
  }
  const state = {
    cookies: [
      {
        name: cookieMatch[1],
        value: cookieMatch[2],
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));
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
