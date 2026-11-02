// Reduced motion removes incidental transitions while keeping clear working-state feedback.
import { expect, test } from "./fixtures";

for (const preference of ["reduce", "no-preference"] as const) {
  test(`respects ${preference} for controls and working feedback`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.emulateMedia({ reducedMotion: preference });
    const server = await startServer({ aiReady: true });
    await server.importPaths([sampleVideo]);
    await openApp(server);
    const importButton = page
      .getByRole("banner")
      .getByRole("button", { name: "Import", exact: true });
    const settings = page.getByRole("button", { name: "Settings", exact: true });
    const splitter = page.getByRole("separator", { name: "Resize timeline" });
    const durations = [
      await importButton.evaluate((element) => getComputedStyle(element).transitionDuration),
      await settings.evaluate((element) => getComputedStyle(element).transitionDuration),
      await splitter.evaluate((element) => getComputedStyle(element, "::after").transitionDuration),
    ];
    const seconds = durations.flatMap((value) =>
      value.split(",").map((part) => Number.parseFloat(part)),
    );
    const trimSeconds = await page
      .getByTestId("trim-start")
      .first()
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element, "::after").transitionDuration),
      );
    if (preference === "reduce") {
      expect(seconds.every((value) => value === 0)).toBe(true);
      expect(trimSeconds).toBe(0);
    } else {
      expect(seconds.some((value) => value > 0)).toBe(true);
      expect(trimSeconds).toBeGreaterThan(0);
    }

    const input = page.getByLabel("Message to the assistant");
    await input.fill("work slowly please");
    await input.press("Enter");
    const spinner = page.locator(".spinner").first();
    await expect(spinner).toBeVisible();
    const spinSeconds = await spinner.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).animationDuration),
    );
    expect(spinSeconds).toBeGreaterThan(preference === "reduce" ? 1 : 0);
    if (preference === "no-preference") expect(spinSeconds).toBeLessThan(1);
    await expect(page.getByText("Working on it...", { exact: true })).toBeVisible();
    await shot(`s01-06-motion-${preference}`);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  });
}
