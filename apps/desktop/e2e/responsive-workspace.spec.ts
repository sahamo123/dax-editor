// Responsive layout keeps editing surfaces and task controls reachable without changing the project.
import { expect, test } from "./fixtures";

test("compact setup can open project options and return to editing", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  await expect(page.getByRole("button", { name: "Show side panel" })).toBeVisible();
  await page.getByRole("button", { name: "Project options" }).click();
  await expect(page.getByRole("tab", { name: "Tools", exact: true })).toBeFocused();
  await expect(page.getByLabel("Output format", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close tools panel" }).click();
  await page.getByRole("button", { name: "Start editing" }).click();
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
});

test("compact editing docks the inspector and switches to the assistant without losing selection", async ({
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
  const clip = page.getByRole("region", { name: "Timeline" }).getByTestId("clip").first();
  await clip.click();
  const preview = await page.getByRole("region", { name: "Preview" }).boundingBox();
  const timeline = await page.getByRole("region", { name: "Timeline" }).boundingBox();
  const panel = await page.getByLabel("Side panel", { exact: true }).boundingBox();
  expect(preview?.height ?? 0).toBeGreaterThanOrEqual(160);
  expect(timeline?.height ?? 0).toBeGreaterThanOrEqual(150);
  expect(panel?.y ?? 0).toBeGreaterThanOrEqual((timeline?.y ?? 0) + (timeline?.height ?? 0));
  const dockSplitter = page.getByRole("separator", { name: "Resize tools panel" });
  const dockBefore = Number(await dockSplitter.getAttribute("aria-valuenow"));
  await dockSplitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(dockSplitter).toHaveAttribute("aria-valuenow", String(dockBefore + 16));
  const sourceIn = page.getByTestId("clip-source-in");
  await sourceIn.focus();
  await expect(sourceIn).toBeInViewport();
  await expect
    .poll(() => page.getByTestId("video-a").evaluate((node: HTMLVideoElement) => node.readyState))
    .toBeGreaterThanOrEqual(2);
  await shot("s01-04-compact-inspector-1000x700");
  await expect(page.getByLabel("Work status")).toBeVisible();
  await page.getByRole("button", { name: "Assistant view" }).click();
  await expect(page.getByLabel("Message to the assistant")).toBeVisible();
  await expect(page.getByLabel("Work status")).toBeVisible();
  await page.getByRole("button", { name: "Show side panel" }).click();
  await expect(page.getByRole("button", { name: "Edit view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Inspector" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Close tools panel" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Side panel", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Show side panel" })).toBeFocused();
  const history = page.getByRole("button", { name: "History", exact: true });
  await history.click();
  await expect(history).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Assistant view" }).click();
  await expect(history).toHaveAttribute("aria-pressed", "false");
  await history.click();
  await expect(history).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: "History", exact: true })).toBeVisible();
});

test("resizing during playback keeps the editor and its history intact", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  const before = await server.project();
  const history = await server.history();
  const video = page.getByTestId("video-a");
  await page.getByTestId("stage").getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(0.1);
  const time = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
  await page.setViewportSize({ width: 1050, height: 740 });
  await expect(
    page.getByTestId("stage").getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThanOrEqual(
    time,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByTestId("stage").getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByRole("button", { name: "Assistant view" }).click();
  await page.getByRole("button", { name: "Edit view" }).click();
  await expect(
    page.getByTestId("stage").getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThanOrEqual(
    time,
  );
  expect(await server.project()).toEqual(before);
  expect(await server.history()).toEqual(history);
});

test("compact view switching keeps running and queued assistant work accessible", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  await page.getByRole("button", { name: "Assistant view" }).click();
  const input = page.getByLabel("Message to the assistant");
  await input.fill("work slowly please");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByLabel("Chat mode", { exact: true }).selectOption("plan");
  await input.fill("Plan the later title");
  await input.press("Enter");
  await expect(page.getByLabel("Work status")).toContainText("2 active/queued");
  await page.setViewportSize({ width: 1050, height: 740 });
  await expect(page.getByLabel("Work status")).toContainText("2 active/queued");
  await page.getByRole("button", { name: "Edit view" }).click();
  await page.getByLabel("Work status").click();
  const work = page.getByRole("banner").getByRole("list", { name: "Task queue" });
  await expect(work).toContainText("Plan the later title");
  await expect(work).toContainText("Queue #1");
  await page.getByRole("button", { name: "Assistant view" }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

for (const size of [
  { width: 600, height: 700 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`primary editing surfaces fit at ${size.width}x${size.height}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    await page.setViewportSize(size);
    await openApp(server);
    const preview = await page.getByRole("region", { name: "Preview" }).boundingBox();
    const timeline = await page.getByRole("region", { name: "Timeline" }).boundingBox();
    expect(preview?.width ?? 0).toBeGreaterThanOrEqual(320);
    expect(preview?.height ?? 0).toBeGreaterThanOrEqual(160);
    expect(timeline?.height ?? 0).toBeGreaterThanOrEqual(150);
    for (const name of ["Project setup", "Import", "Export", "Settings"]) {
      const button = page.getByRole("banner").getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect((box?.x ?? size.width) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
    await expect
      .poll(() => page.getByTestId("video-a").evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(2);
    await shot(`s01-04-${size.width}x${size.height}`);
  });
}
