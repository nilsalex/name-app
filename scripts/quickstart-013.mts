// Feature 013 quickstart walk-through (V1–V7) — MANUAL/DEV-ONLY helper,
// NOT part of npm test. Run via `npx tsx scripts/quickstart-013.mts`
// against the mock-mode dev server (VISUAL_MOCK_EXTERNAL=1 AND
// VISUAL_SEED_NOMINATIONS=0, see specs/013-name-nomination-round/quickstart.md):
//
//   1. start the mock dev server with a FRESH in-memory store and the
//      seeding switch off:
//        set -a; source .env.visual; set +a
//        VISUAL_SEED_NOMINATIONS=0 npm run dev   (PORT already in env)
//   2. in a second terminal:
//        PORT=<port> npx tsx scripts/quickstart-013.mts
//
// The script signs the suite identity in via the internal endpoint, then
// drives the real UI (HTML + buttons) through the nomination flow and
// asserts each quickstart pass condition. Everything is in-process in the
// dev server (fake store): no external egress.
//
// Scenarios (quickstart.md):
//   V1  gate shows ONE name, "0 von 200", no pair reachable
//   V2  taps swap instantly + counter increments; reload resumes intact
//   V3  counter format decided/total
//   V4  completing a round (≥2 in) lands directly in voting; reload → voting
//   V5  pool restriction: covered structurally (all pairs drawn from the
//       pool) here; the excluded-name property is pinned by the T016
//       integration test (2-uid isolation) + T012 unit tests
//   V7  decisions final: no UI path changes them after completion
//
// V6 (locked state, <2 included) needs its own fresh boot; run
// scripts/quickstart-013-v6.mts after a server restart (per-run reset IS
// the server lifecycle — the fake store lives in dev-server memory).
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

const includeBtn = page.locator('[class*="nominate-client"]').first; // unused helper guard
void includeBtn;

// --- V1: gate -------------------------------------------------------------
console.log("V1 — Nomination gate blocks voting");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "one name shown, no pair",
  (await page.locator('[class*="nameButton"]').count()) === 0 &&
    (await page.locator('[class*="nameCard"]').count()) === 1
);
check(
  "counter reads 0 von 200",
  (await page.textContent('[class*="counter"]'))?.trim() === "0 von 200"
);
check(
  "buttons Aufnehmen/Ausschließen",
  (await page.getByRole("button", { name: "Aufnehmen" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Ausschließen" }).count()) === 1
);

// --- V2: one-by-one flow ---------------------------------------------------
console.log("V2 — One-by-one flow and persistence");
for (let i = 0; i < 10; i++) {
  await (i % 2 === 0
    ? page.getByRole("button", { name: "Aufnehmen" }) // include
    : page.getByRole("button", { name: "Ausschließen" }) // exclude
  ).click();
}
check(
  "after 10 decisions counter reads 10 von 200",
  (await page.textContent('[class*="counter"]'))?.trim() === "10 von 200"
);
await page.reload({ waitUntil: "domcontentloaded" });
await page
  .locator('button:has-text("Aufnehmen")')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "reload resumes at 10 von 200 (all decisions intact)",
  (await page.textContent('[class*="counter"]'))?.trim() === "10 von 200"
);
check(
  "no repeat of the first name",
  (await page.textContent('[class*="nameCard"]'))?.trim() !== "Noah"
);

// --- V3: 36-decided counter format ----------------------------------------
console.log("V3 — Progress counter (decided/total)");
for (let i = 0; i < 26; i++) {
  await page.getByRole("button", { name: "Aufnehmen" }).click();
}
check(
  "counter reads 36 von 200 on the 37th screen",
  (await page.textContent('[class*="counter"]'))?.trim() === "36 von 200"
);

// --- V4: completion → straight into voting --------------------------------
console.log("V4 — Completion transitions straight into voting");
for (let i = 0; i < 164; i++) {
  await page.getByRole("button", { name: "Aufnehmen" }).click();
}
await page
  .locator('[class*="nameButton"]')
  .first()
  .waitFor({ timeout: 30_000 });
check("landed in the vote screen (no waiting screen)", true);
check(
  "signOut (Abmelden) visible — real vote UI",
  (await page.getByText("Abmelden").count()) >= 1
);
await page.reload({ waitUntil: "domcontentloaded" });
await page
  .locator('[class*="nameButton"]')
  .first()
  .waitFor({ timeout: 30_000 });
check("re-open lands directly in voting (FR-013)", true);

// --- V5/V7: pool restriction + finality -----------------------------------
console.log("V5/V7 — Pool-consistent pairs and finality");
let pairsOk = true;
const voteNames = new Set<string>();
for (let i = 0; i < 25; i++) {
  const btns = page.locator('[class*="nameButton"]');
  const a = (await btns.nth(0).textContent())!.trim();
  const b = (await btns.nth(1).textContent())!.trim();
  if (a === b) pairsOk = false;
  voteNames.add(a);
  voteNames.add(b);
  await btns.nth(0).click();
}
check(
  `voted through 25 pairs (${voteNames.size} distinct names)`,
  voteNames.size >= 20 && pairsOk
);
check(
  "no nomination controls on the vote screen (V7)",
  (await page.getByRole("button", { name: "Aufnehmen" }).count()) === 0
);

await browser.close();

console.log(
  `\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}.`
);
console.log(
  "V6 (locked state, <2 included): restart the dev server for a fresh\n" +
    "in-memory store, then run scripts/quickstart-013-v6.mts."
);
