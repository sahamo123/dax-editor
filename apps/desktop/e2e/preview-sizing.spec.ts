// The video frame uses the available preview width and panel sizes recover from stale values.
import { expect, test } from "./fixtures";

test("preview and panel dimensions remain usable with extreme saved values", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    localStorage.setItem("dax.chatWidth", "-9000");
    localStorage.setItem("dax.drawerWidth", "9000");
    localStorage.setItem("dax.timelineHeight", "-9000");
  });
  await openApp(server);
  const chat = page.getByRole("separator", { name: "Resize chat panel" });
  await expect(chat).toHaveAttribute("aria-valuenow", "260");
  const timeline = page.getByRole("separator", { name: "Resize timeline" });
  expect(Number(await timeline.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(150);
  const preview = await page.getByRole("region", { name: "Preview" }).boundingBox();
  const stage = await page.getByTestId("stage").boundingBox();
  expect(stage?.width ?? 0).toBeGreaterThan((preview?.width ?? 0) - 35);
  await expect(page.getByRole("button", { name: "Review effects" })).toBeVisible();
  await chat.focus();
  await page.keyboard.press("End");
  const atEnd = Number(await chat.getAttribute("aria-valuenow"));
  const bar = await chat.boundingBox();
  if (!bar) throw new Error("Chat splitter is not visible");
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x - 30, bar.y + bar.height / 2);
  await page.mouse.up();
  expect(Number(await chat.getAttribute("aria-valuenow"))).toBeLessThan(atEnd);
  await page.setViewportSize({ width: 1366, height: 620 });
  await timeline.focus();
  await page.keyboard.press("End");
  const maxAt620 = Number(await timeline.getAttribute("aria-valuenow"));
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect
    .poll(async () => Number(await timeline.getAttribute("aria-valuemax")))
    .toBeGreaterThan(maxAt620);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
});
