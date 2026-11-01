// The disconnected compact workspace must retain its recovery action and editing surfaces.
import { expect, test } from "./fixtures";

test("a disconnected compact workspace keeps its retry action and open dock usable", async ({
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
  await expect(page.getByRole("button", { name: "Close tools panel" })).toBeVisible();
  await server.stop();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Can't reach the editor engine");
  const retry = alert.getByRole("button", { name: "Retry now" });
  await retry.focus();
  await expect(retry).toBeFocused();
  const preview = await page.getByRole("region", { name: "Preview" }).boundingBox();
  const timeline = await page.getByRole("region", { name: "Timeline" }).boundingBox();
  const dock = await page.getByLabel("Tools panel dock").boundingBox();
  expect(preview?.height ?? 0).toBeGreaterThanOrEqual(160);
  expect(timeline?.height ?? 0).toBeGreaterThanOrEqual(150);
  expect((dock?.y ?? 700) + (dock?.height ?? 0)).toBeLessThanOrEqual(700);
  await shot("s01-05-disconnected-compact-dock");
  await retry.click();
  await server.start();
  await expect(alert).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Close tools panel" })).toBeVisible();
});
