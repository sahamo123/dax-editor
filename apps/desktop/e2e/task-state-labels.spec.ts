// Task state must be readable as text without interpreting color.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures";

test("task queue labels every state and retains targeted cancellation", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await server.stop();
  await writeFile(
    join(server.dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "past-complete",
        title: "Completed example",
        kind: "export",
        mode: "edit",
        status: "completed",
        createdAt: 1,
      },
      {
        id: "past-failed",
        title: "Failed example",
        kind: "export",
        mode: "edit",
        status: "failed",
        createdAt: 2,
        error: "Synthetic error",
      },
      {
        id: "past-cancelled",
        title: "Cancelled example",
        kind: "chat",
        mode: "edit",
        status: "cancelled",
        createdAt: 3,
      },
      {
        id: "past-interrupted",
        title: "Interrupted example",
        kind: "transcribe",
        mode: "edit",
        status: "interrupted",
        createdAt: 4,
      },
    ]),
  );
  await server.start();
  const startModel = await server.api.call("POST", "/api/local-model/start", {});
  expect(startModel.status).toBe(202);
  await expect
    .poll(
      async () =>
        (await server.api.providers()).find((provider) => provider.kind === "local")?.available,
    )
    .toBe(true);
  await openApp(server);
  const input = page.getByLabel("Message to the assistant");
  await input.fill("work slowly active");
  await input.press("Enter");
  const queue = page
    .getByRole("complementary", { name: "Chat with the assistant" })
    .getByRole("list", { name: "Task queue" });
  const active = queue.locator("li").filter({ hasText: "work slowly active" });
  await expect(active.getByText("running", { exact: true })).toBeVisible();
  await input.fill("work slowly queued");
  await input.press("Enter");
  const queued = queue.locator("li").filter({ hasText: "work slowly queued" });
  await expect(queued.getByText("queued", { exact: true })).toBeVisible();
  for (const [title, status] of [
    ["Completed example", "completed"],
    ["Failed example", "failed"],
    ["Cancelled example", "cancelled"],
    ["Interrupted example", "interrupted"],
  ] as const) {
    const row = queue.locator("li").filter({ hasText: title });
    const label = row.getByText(status, { exact: true });
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
    await expect(label).toBeInViewport({ ratio: 1 });
  }
  await shot("s01-06-task-state-history");
  await active.scrollIntoViewIfNeeded();
  await shot("s01-06-task-state-active");
  const details = queue.locator("..");
  await details.locator("summary").focus();
  const before = await details.evaluate((node) => node.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(async () => details.evaluate((node) => node.scrollTop)).toBeGreaterThan(before);
  await queued.getByRole("button", { name: /Cancel task: work slowly queued/ }).click();
  await expect(queued.getByText("cancelled", { exact: true })).toBeVisible();
  await expect(active.getByText("running", { exact: true })).toBeVisible();
  await active.getByRole("button", { name: /Cancel task: work slowly active/ }).click();
  await expect(active.getByText("cancelled", { exact: true })).toBeVisible();
});
