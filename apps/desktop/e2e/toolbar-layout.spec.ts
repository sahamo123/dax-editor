// Wrapped toolbar rows must occupy space and remain operable above the timeline.
import { expect, test } from "./fixtures";

for (const viewport of [
  { width: 600, height: 700 },
  { width: 720, height: 700 },
  { width: 1000, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`wrapped toolbar controls remain reachable at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    await openApp(server);

    const clip = page.getByRole("listbox", { name: "Timeline" }).getByTestId("clip").first();
    await clip.focus();
    await page.keyboard.press("Enter");

    const toolbar = page.getByRole("toolbar", { name: "Editor" });
    const splitter = page.getByRole("separator", { name: "Resize timeline" });
    await splitter.focus();
    await page.keyboard.press("Home");
    const assertControlsReachable = async () => {
      const controls = toolbar.locator("button, input[type=range]");
      const count = await controls.count();
      expect(count).toBeGreaterThan(10);
      for (let i = 0; i < count; i += 1) {
        const control = controls.nth(i);
        const name = await control.getAttribute("aria-label");
        const geometry = await control.evaluate((element) => {
          const bar = element.closest('[role="toolbar"]');
          if (!bar) throw new Error("Toolbar missing");
          const rect = element.getBoundingClientRect();
          const outer = bar.getBoundingClientRect();
          const hits = [0.2, 0.5, 0.8].flatMap((x) =>
            [0.2, 0.5, 0.8].map((y) => {
              const hit = document.elementFromPoint(
                rect.left + rect.width * x,
                rect.top + rect.height * y,
              );
              return hit !== null && element.contains(hit);
            }),
          );
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            outerLeft: outer.left,
            outerRight: outer.right,
            outerTop: outer.top,
            outerBottom: outer.bottom,
            hits,
          };
        });
        expect(geometry.left, name ?? "").toBeGreaterThanOrEqual(geometry.outerLeft - 0.1);
        expect(geometry.right, name ?? "").toBeLessThanOrEqual(geometry.outerRight + 0.1);
        expect(geometry.top, name ?? "").toBeGreaterThanOrEqual(geometry.outerTop - 0.1);
        expect(geometry.bottom, name ?? "").toBeLessThanOrEqual(geometry.outerBottom + 0.1);
        expect(geometry.hits, name ?? "").toEqual(Array(9).fill(true));
      }
    };
    await assertControlsReachable();

    const timeline = page.getByTestId("timeline-scroll");
    const timelineBounds = await timeline.boundingBox();
    expect(timelineBounds?.height ?? 0).toBeGreaterThan(30);
    const loop = toolbar.getByRole("button", { name: "Loop", exact: true });
    const before = await loop.getAttribute("aria-pressed");
    await loop.focus();
    await page.keyboard.press("Space");
    await expect(loop).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    await expect(loop).toBeFocused();
    const slider = toolbar.getByRole("slider", { name: "Zoom", exact: true });
    await slider.focus();
    await page.keyboard.press("Home");
    const zoomBefore = await slider.inputValue();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toBeFocused();
    expect(await slider.inputValue()).not.toBe(zoomBefore);
    await shot(`toolbar-layout-${viewport.width}`);
    await page.setViewportSize({ width: viewport.width === 1440 ? 1000 : 1440, height: 900 });
    await expect(slider).toBeFocused();
    await assertControlsReachable();
    const hidePanel = page.getByRole("button", { name: "Hide side panel" });
    await hidePanel.click();
    await assertControlsReachable();
    await page.getByRole("button", { name: "Show side panel" }).click();
    await assertControlsReachable();
  });
}
