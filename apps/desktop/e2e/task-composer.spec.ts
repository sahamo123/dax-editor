// A narrow assistant panel must keep messages readable and its active-run actions separate.
import { chatInput, expect, test } from "./fixtures";

test("narrow composer keeps queue, steering and stop usable without interrupting the active task", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(server);
  const splitter = page.getByRole("separator", { name: "Resize chat panel" });
  await splitter.focus();
  await page.keyboard.press("Home");
  const input = chatInput(page);
  await input.fill("work slowly please");
  await input.press("Enter");
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();
  await page.getByLabel("Chat mode", { exact: true }).selectOption("plan");
  await input.fill("Plan the later title");
  const queue = page.getByRole("button", { name: "Queue message", exact: true });
  await queue.click();
  const task = page
    .getByRole("list", { name: "Task queue" })
    .locator("li")
    .filter({ hasText: "Plan the later title" });
  await expect(task).toContainText("Queue #1");
  await input.fill("Keep the title short");
  const steer = page.getByRole("button", { name: "Steer task", exact: true });
  const inputBox = await input.boundingBox();
  const stopBox = await stop.boundingBox();
  const queueBox = await queue.boundingBox();
  const steerBox = await steer.boundingBox();
  expect(inputBox?.width ?? 0).toBeGreaterThanOrEqual(150);
  expect((stopBox?.x ?? 0) + (stopBox?.width ?? 0)).toBeLessThanOrEqual(steerBox?.x ?? 0);
  expect((steerBox?.x ?? 0) + (steerBox?.width ?? 0)).toBeLessThanOrEqual(queueBox?.x ?? 0);
  await steer.focus();
  await expect(steer).toBeFocused();
  await shot("s01-05-narrow-composer");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Steering added. The current task continues from its present state."),
  ).toBeVisible();
  await expect(stop).toBeVisible();
  await expect(task).toContainText("queued");
  await stop.click();
  await expect(page.getByText("Stopped.")).toBeVisible();
});
