// Foundation smoke scenario (T008): the Phase-2 checkpoint. Loads `/`
// logged out at PHONE_320, asserts HTTP 200 and that the settle + measure
// pipeline works end to end.
import { test, expect } from "@playwright/test";
import { measureSettled, screenshot } from "./harness";
import { PHONE_320 } from "./profiles";

test.use({ viewport: { width: PHONE_320.width, height: PHONE_320.height } });

test("smoke: `/` renders and settles at PHONE_320 (logged out)", async ({ page, baseURL }) => {
  const response = await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const m = await measureSettled(page);
  expect(m.viewport.width).toBe(PHONE_320.width);
  expect(m.pageScrollWidth).toBeLessThanOrEqual(m.pageClientWidth + 1);
  await screenshot(page, "logged-out-320x568");
});
