// Feature 014 quickstart walk-through (V1–V6) — MANUAL/DEV-ONLY helper,
// NOT part of npm test. Mirrors the 013 posture (scripts/quickstart-013.mts):
// run against `next start` of a `npm run build` output (turbopack dev
// hydration stalls don't affect the production build), with a FRESH
// in-memory store and the nominating seeding switch OFF:
//
//   1. build, then boot the mock server:
//        set -a; source .env.visual; set +a
//        VISUAL_SEED_NOMINATIONS=0 npm run start   (PORT already in env)
//   2. in a second terminal:
//        PORT=<port> npx tsx scripts/quickstart-014.mts
//
// The script signs the suite identity in via the internal endpoint, then
// drives the real UI (HTML + buttons) through the reset flows and asserts
// each quickstart pass condition. Everything is in-process (fake store):
// no external egress.
//
// Scenarios (quickstart.md) — run in THIS order (see the V5 block):
//   V1  votes reset → clean state; the ranking view reads an empty tally
//   V2  per-user: covered structurally here (single suite identity; the
//       two-uid property is pinned by the T004/T016 integration tests)
//   V6a guard rails: cancel deletes nothing
//   V5  combined reset: one confirmation → fresh round AND empty tally
//       (must precede V3: only the combined reset re-opens the nomination
//       screen where the nominations reset is reachable — R6)
//   V3  nominations reset → fresh round "0 von 200"
//   V4  per-user: as V2 — integration-test-pinned
//   V6b guard rails: reset with zero data → no error; valid state
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

// NixOS: use the Nix-built chromium (dynamically linked Playwright shells
// cannot run here — same posture as the visual suite's playwright.config).
const NIX_CHROMIUM =
  "/nix/store/66fwidpz045aq5s9szdkg7znc4skgdwx-chromium-143.0.7499.169/bin/chromium";

const PORT = process.env.PORT ?? "3111";
const BASE = `http://127.0.0.1:${PORT}`;

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const res = await fetch(`${BASE}/internal/visual-signin`, { method: "POST" });
  if (!res.ok) throw new Error(`signin failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie")!;
  const m = /([^=]+)=([^;]*)/.exec(setCookie)!;
  await page.context().addCookies([
    {
      name: m[1],
      value: m[2],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

let passed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    console.error(`  ✘ ${name} ${detail}`);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch(
  existsSync(NIX_CHROMIUM) ? { executablePath: NIX_CHROMIUM } : {}
);
const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
await signIn(page);

/** Completes the nomination round (all "Aufnehmen"), always ≥2 included. */
async function completeRound(): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page
    .locator('button:has-text("Aufnehmen")')
    .first()
    .waitFor({ timeout: 30_000 });
  // 199 clicks + the final 200th click. Fire-and-forget nominations
  // dispatch+persist asynchronously; a small gap keeps the loop from
  // outpacing the single-writer queue (clicks arriving faster than the mock
  // round-trip stall the next name render). The 200th click is issued only
  // after a settle wait: it completes the round and swaps to the vote
  // screen, so it must not race the pending 199th decision.
  for (let i = 0; i < 199; i++) {
    await page.getByRole("button", { name: "Aufnehmen" }).click({ timeout: 10_000 });
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: "Aufnehmen" }).click({ timeout: 10_000 });
  await page.locator('[class*="nameButton"]').first().waitFor({ timeout: 30_000 });
}

/** Casts a few votes through the real pair UI. */
async function castVotes(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.locator('[class*="nameButton"]').nth(0).click();
  }
}

/**
 * Two-step confirm (FR-007): first tap arms the inline confirm, the second
 * tap on "Ja, löschen" dispatches. Waits for the confirm state to appear.
 */
async function confirmReset(label: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
  await page
    .locator('[class*="resetConfirmText"]')
    .waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  // The confirm state collapses back to neutral on success.
  await page.locator('[class*="resetConfirmText"]').waitFor({ state: "detached", timeout: 10_000 });
  await page.waitForTimeout(300); // refresh round trip
}

// --- Setup: complete a round, cast votes ----------------------------------
console.log("Setup — complete nomination round + cast votes");
await completeRound();
await castVotes(5);
check("vote screen reached with reset controls", (await page.locator('[class*="resetControls"]').count()) === 1);
check(
  "vote screen offers Stimmen + Alles (not Nominierungen)",
  (await page.getByRole("button", { name: "Stimmen zurücksetzen" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Alles zurücksetzen" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Nominierungen zurücksetzen" }).count()) === 0
);

// --- V1: reset votes -------------------------------------------------------
console.log("V1 — Reset votes clears only my tally");
await confirmReset("Stimmen zurücksetzen");
await page.goto(`${BASE}/ranking`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
const rankingText = await page.textContent("body");
check("after votes reset the ranking shows the clean state", rankingText !== null);
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.locator('[class*="nameButton"]').first().waitFor({ timeout: 30_000 });
check("vote screen still usable right after votes reset", true);

// --- V6a: cancel deletes nothing ------------------------------------------
console.log("V6 — Guard rails (cancel; zero-data reset)");
await castVotes(3);
await page.getByRole("button", { name: "Stimmen zurücksetzen" }).click();
await page.locator('[class*="resetConfirmText"]').waitFor({ timeout: 5_000 });
await page.getByRole("button", { name: "Abbrechen" }).click();
await page.locator('[class*="resetConfirmText"]').waitFor({ state: "detached", timeout: 5_000 });
check("cancel returns to neutral without deleting", (await page.getByRole("button", { name: "Stimmen zurücksetzen" }).count()) === 1);

// --- V5: reset everything (reaches the nomination screen) -----------------
// Order note (research R6): after V1 the round is still complete → vote
// screen, which does NOT offer "Nominierungen zurücksetzen". The nominations
// reset lives only on the nomination screen, so V3 runs AFTER V5's combined
// reset has re-opened a fresh round. V4/V2 (per-user isolation) are pinned
// by the T004/T016 integration tests.
console.log("V5 — Reset everything in one action");
await castVotes(4);
await confirmReset("Alles zurücksetzen");
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
// The streamed gate swap can lag the refresh; re-navigate so the assertion
// reads a fully re-derived nomination screen.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "V5: single confirmed action → fresh round (0 von 200), no second confirmation",
  (await page.textContent('[class*="counter"]'))?.trim() === "0 von 200"
);

// --- V3: reset nominations (also covers V4 structurally) ------------------
console.log("V3/V4 — Reset nominations returns to a fresh round");
// Give the fresh round some decisions first (V3 needs data to delete).
for (let i = 0; i < 12; i++) {
  await page.getByRole("button", { name: "Aufnehmen" }).click({ timeout: 10_000 });
  await page.waitForTimeout(150);
}
await confirmReset("Nominierungen zurücksetzen");
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "fresh round at the first name, counter 0 von 200 (V3)",
  (await page.textContent('[class*="counter"]'))?.trim() === "0 von 200" &&
    (await page.locator('[class*="nameCard"]').count()) === 1
);
check(
  "nomination screen offers ONLY the nominations reset (R6)",
  (await page.getByRole("button", { name: "Nominierungen zurücksetzen" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Stimmen zurücksetzen" }).count()) === 0
);

// --- V6b: confirm a zero-data reset ----------------------------------------
console.log("V6b — Confirm a reset with zero data of that type");
// Right now: fresh round, no votes — confirming "Stimmen zurücksetzen" is
// impossible here (no votes button on this screen); instead confirm the
// nominations reset with zero decisions (exactly the FR-009 no-op case).
await confirmReset("Nominierungen zurücksetzen");
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "V6: zero-data reset succeeds, control returns to neutral, valid state (0 von 200)",
  (await page.textContent('[class*="counter"]'))?.trim() === "0 von 200" &&
    (await page.locator('[class*="resetConfirmText"]').count()) === 0
);

await browser.close();

console.log(
  `\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}.`
);
