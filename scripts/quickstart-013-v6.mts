// Feature 013 quickstart V6 — locked state with <2 included names (FR-008).
// MANUAL/DEV-ONLY helper, NOT part of npm test. Run against a FRESH server
// (fresh in-memory store) with VISUAL_SEED_NOMINATIONS=0:
//
//   set -a; source .env.visual; set +a
//   VISUAL_SEED_NOMINATIONS=0 npx next start -p <port>   (or npm run dev)
//   PORT=<port> npx tsx scripts/quickstart-013-v6.mts
//
// Scenario (quickstart.md V6): fresh user Z completes a round excluding
// 199 of 200 names (1 "in") → locked message, no pair voting.
//
// Note: the locked screen's streamed branch can crash the Nix chromium
// renderer nondeterministically in a second tab/context; the FR-013
// persistence check therefore uses a plain HTTP fetch of the server-render
// (same cookie), not a second browser tab.
import { chromium } from "@playwright/test";

const NIX_CHROMIUM =
  "/nix/store/66fwidpz045aq5s9szdkg7znc4skgdwx-chromium-143.0.7499.169/bin/chromium";

const PORT = process.env.PORT ?? "3111";
const BASE = `http://127.0.0.1:${PORT}`;

// Fresh identity → fresh per-user nomination hash (empty store after restart).
const res = await fetch(`${BASE}/internal/visual-signin`, { method: "POST" });
const sc = res.headers.get("set-cookie") ?? "";
const m = /([^=]+)=([^;]*)/.exec(sc);
if (!m) throw new Error("visual-signin failed");
const cookie = `${m[1]}=${m[2]}`;

const browser = await chromium.launch({ executablePath: NIX_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
await page.context().addCookies([
  { name: m[1], value: m[2], domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
]);

await page.goto(`${BASE}/`, { waitUntil: "load" });

// Exclude 199 names (re-query the button each tap — the DOM swaps per
// decision), then include the 200th.
let excluded = 0;
for (let i = 0; i < 199; i++) {
  await page.getByRole("button", { name: "Ausschließen" }).click({ timeout: 15000 });
  excluded++;
}
await page.getByRole("button", { name: "Aufnehmen" }).click({ timeout: 15000 });
await page.waitForTimeout(1000);

const text = (await page.textContent("body", { timeout: 5000 }).catch(() => null)) ?? "";
const lockedVisible =
  text.includes("Zu wenige Namen übrig (1)") && text.includes("Abstimmung nicht möglich");
const noVoteUI =
  (await page.locator('[class*="nameButton"]').count()) === 0 && !text.includes("Abmelden");
console.log(`V6 — Locked state (<2 included)`);
console.log(`  ${excluded === 199 ? "✔" : "✘"} excluded 199 names, included the 200th`);
console.log(`  ${lockedVisible ? "✔" : "✘"} locked message shown after 1 included name`);
console.log(`  ${noVoteUI ? "✔" : "✘"} no vote controls reachable`);
await browser.close();

// FR-013 persistence: a fresh server render for the same cookie must show
// the identical locked state (raw HTTP — no renderer involved).
const fresh = await fetch(`${BASE}/`, { headers: { cookie } });
// The streamed SSR HTML interleaves `<!-- -->` comment nodes inside the
// counter text ("(<!-- -->1<!-- -->)"); strip comments before matching.
const freshHtml = (await fresh.text()).replaceAll(/<!--.*?-->/g, "");
const lockedAfter = freshHtml.includes("Zu wenige Namen übrig (1)");
console.log(
  `  ${lockedAfter ? "✔" : "✘"} locked state persists across re-open (FR-013)`
);

const allOk = excluded === 199 && lockedVisible && noVoteUI && lockedAfter;
console.log(allOk ? "\nV6 passed." : "\nV6 FAILED.");
process.exit(allOk ? 0 : 1);
