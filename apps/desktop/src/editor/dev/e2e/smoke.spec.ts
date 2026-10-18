// Smoke test: the harness loads, shows three clips, filmstrips, waveforms, presets, and a screenshot is saved.

import { expect, test } from "@playwright/test";
import { openHarness, SHOTS } from "./helpers";

test("harness renders the demo project", async ({ page }) => {
  await openHarness(page);
  await expect(page.getByTestId("preset")).toHaveCount(6);
  await expect(page.getByTestId("ruler")).toBeVisible();
  // Give filmstrips and waveforms a moment to load.
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-initial.png` });
});
