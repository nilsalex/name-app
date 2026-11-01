// US1 core vote-screen guarantees (feature 011, T010): side-by-side
// unwrapped pair + maximality + static equal halves at the three portrait
// profiles. Includes the pair-to-pair staticity protocol: record box
// rects, tap a vote (instant client-side swap), settle, re-measure, assert
// identity within 1 px — ≥10 consecutive pairs (spec US1 scenarios 1–2).
//
// Prerequisite: global setup signed in and saved the storage state.
import { test, expect } from "@playwright/test";
import { measureSettled, screenshot, type Measurement } from "./harness";
import { PHONE_320, PHONE_375, PHONE_430, PORTRAIT_PROFILES, type Profile } from "./profiles";
import {
  sideBySideUnwrapped,
  equalHalves,
  rectIdentity,
  maximalRow,
  noHorizontalScroll,
} from "./guarantees";

const STATIC_PAIRS = 10;

for (const profile of PORTRAIT_PROFILES) {
  test.describe(`vote layout at ${profile.name}`, () => {
    test.use({ viewport: { width: profile.width, height: profile.height } });

    test("signed-in vote screen: side-by-side + maximal + equal halves", async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
      const voteArea = page.locator('[class*="voteArea"]');
      await expect(voteArea).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[class*="nameButton"]').first()).toBeVisible();

      const m = await measureSettled(page);
      sideBySideUnwrapped(m, profile);
      equalHalves(m, profile);
      maximalRow(m, profile);
      noHorizontalScroll(m, profile);
      await screenshot(page, `vote-${profile.name}`);
    });

    test("pair-to-pair staticity across ≥10 consecutive pairs", async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
      const voteArea = page.locator('[class*="voteArea"]');
      await expect(voteArea).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[class*="nameButton"]').first()).toBeVisible();

      let previous: Measurement = await measureSettled(page);
      sideBySideUnwrapped(previous, profile);
      maximalRow(previous, profile);

      const seenNames = new Set<string>();
      for (let i = 0; i < STATIC_PAIRS; i++) {
        const buttons = page.locator('[class*="nameButton"]');
        // Tap the left button (instant client-side swap; vote dispatches
        // asynchronously — presentation never awaits the network).
        await buttons.first().click();
        const current = await measureSettled(page);
        rectIdentity(previous, current, profile, `pair ${i + 1} vs pair ${i}`);
        sideBySideUnwrapped(current, profile);
        maximalRow(current, profile);
        for (const box of current.boxes) seenNames.add(box.text);
        previous = current;
      }
      // Deliberately varied name lengths were encountered (spec US1
      // scenario 2: the staticity must hold across different content).
      expect(seenNames.size).toBeGreaterThan(4);
      await screenshot(page, `vote-staticity-${profile.name}`);
    });
  });
}

// PHONE_375 / PHONE_430 are exercised above via PORTRAIT_PROFILES; the
// explicit references keep the imports honest for profile-specific tweaks.
void PHONE_320;
