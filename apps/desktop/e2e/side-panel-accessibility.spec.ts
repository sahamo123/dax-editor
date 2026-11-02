// The side-panel tabs expose their content to keyboard and assistive technology users.
import { expect, test } from "./fixtures";

test("keyboard users can reach text-only inspector content and return to its tab", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const tab = page.getByRole("tab", { name: "Inspector" });
  await tab.click();
  const panel = page.getByRole("tabpanel", { name: "Inspector" });
  await expect(panel.getByText(/Select a clip or a text overlay/)).toBeVisible();
  await expect(tab).toBeFocused();
  await page.keyboard.press("Tab");
  await shot("side-panel-inspector-keyboard");
  await expect(panel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(tab).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Presets" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "Presets" })).toBeFocused();
});

test("tabs retain labelled panels and keyboard selection does not steal focus", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("tab", { name: "Inspector" }).click();
  const controls = await page.getByRole("tab").evaluateAll((tabs) =>
    tabs.map((tab) => {
      const id = tab.getAttribute("aria-controls");
      const panel = id ? document.getElementById(id) : null;
      return Boolean(panel && panel.getAttribute("aria-labelledby") === tab.id);
    }),
  );
  expect(controls.length).toBeGreaterThan(0);
  expect(controls.every(Boolean)).toBe(true);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(
    await page
      .locator('[role="tabpanel"][hidden]')
      .evaluateAll((panels) => panels.every((panel) => panel.childElementCount === 0)),
  ).toBe(true);
  const clip = page.getByRole("region", { name: "Timeline" }).getByTestId("clip").first();
  await clip.focus();
  await page.keyboard.press("Enter");
  await expect(clip).toBeFocused();
  await expect(page.getByTestId("inspector")).toContainText(/Volume|Fade/);
  const tab = page.getByRole("tab", { name: "Inspector" });
  await tab.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "Inspector" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("clip-source-in")).toBeFocused();
});

test("compact dock keeps panel instructions and Escape reachable", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  await page.getByRole("button", { name: "Show side panel" }).click();
  const tab = page.getByRole("tab", { name: "Inspector" });
  await tab.click();
  await page.keyboard.press("Tab");
  const panel = page.getByRole("tabpanel", { name: "Inspector" });
  await expect(panel).toBeFocused();
  await expect(panel.getByText(/Select a clip or a text overlay/)).toBeVisible();
  await shot("side-panel-compact-keyboard");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Show side panel" })).toBeFocused();
});
