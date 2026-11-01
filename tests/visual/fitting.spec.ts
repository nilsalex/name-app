// US1 fitting chain (feature 011, T011): one line, no ellipsis, dominant
// type at the portrait profiles (FR-004), plus the desktop 40 px cap
// engagement check (010 M1.4).
import { test, expect } from "@playwright/test";
import { measureSettled, screenshot } from "./harness";
import {
  PHONE_320,
  PHONE_375,
  PHONE_430,
  DESKTOP_1280,
  type Profile,
} from "./profiles";
import { oneLineNoEllipsis, dominantType, desktopCapEngaged, noHorizontalScroll } from "./guarantees";

const FITTING_PROFILES: readonly Profile[] = [PHONE_320, PHONE_375, PHONE_430];

for (const profile of FITTING_PROFILES) {
  test.describe(`fitting chain at ${profile.name}`, () => {
    test.use({ viewport: { width: profile.width, height: profile.height } });

    test("pair names: one line, no ellipsis, dominant type", async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[class*="nameButton"]').first()).toBeVisible({ timeout: 30_000 });

      // Verify the chain across several consecutive pairs (different name
      // lengths flow through the fitting logic).
      for (let round = 0; round < 5; round++) {
        const m = await measureSettled(page);
        oneLineNoEllipsis(m, profile);
        dominantType(m, profile);
        noHorizontalScroll(m, profile);
        await page.locator('[class*="nameButton"]').first().click();
      }
      await screenshot(page, `fitting-${profile.name}`);
    });
  });
}

test.describe("desktop cap engagement at 1280", () => {
  test.use({ viewport: { width: DESKTOP_1280.width, height: DESKTOP_1280.height } });

  test("40 px cap engages: name font-size ≥ 39 px", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[class*="nameButton"]').first()).toBeVisible({ timeout: 30_000 });
    const m = await measureSettled(page);
    oneLineNoEllipsis(m, DESKTOP_1280);
    dominantType(m, DESKTOP_1280);
    desktopCapEngaged(m, DESKTOP_1280);
    await screenshot(page, `fitting-${DESKTOP_1280.name}`);
  });
});
