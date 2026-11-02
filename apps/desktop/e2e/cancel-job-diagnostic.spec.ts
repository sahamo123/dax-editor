// Confirm cancellation outcomes with a real engine and generated or fake work.
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

test("cancelled speech setup is a polite notice and a cancelled task", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer({ speechWaitForCancel: true });
  await openApp(server);
  await page.getByRole("tab", { name: "Speech", exact: true }).click();
  await page.getByRole("button", { name: "Install offline speech" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Speech progress", exact: true }),
  ).toBeVisible();
  const running = await server.api.state();
  const task = running.tasks?.find(
    (item) => item.title === "Install offline speech" && item.status === "running",
  );
  expect(task).toBeDefined();
  await page.getByRole("button", { name: "Cancel speech job" }).click();
  await expect
    .poll(
      async () => (await server.api.state()).tasks?.find((item) => item.id === task?.id)?.status,
    )
    .toBe("cancelled");
  await expect(page.locator('.sr-only[role="status"]')).toContainText(
    "Offline speech setup cancelled.",
  );
  await expect(
    page.locator(".toast--info").filter({ hasText: "Offline speech setup cancelled." }),
  ).toHaveCount(1);
  await expect(page.locator('.sr-only[role="alert"]')).toBeEmpty();
});

test("a failure after a cancellation request remains a failure", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer({ speechWaitForCancel: true, speechFailureAfterCancel: true });
  await openApp(server);
  await page.getByRole("tab", { name: "Speech", exact: true }).click();
  await page.getByRole("button", { name: "Install offline speech" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Speech progress", exact: true }),
  ).toBeVisible();
  const running = await server.api.state();
  const task = running.tasks?.find(
    (item) => item.title === "Install offline speech" && item.status === "running",
  );
  expect(task).toBeDefined();
  await page.getByRole("button", { name: "Cancel speech job" }).click();
  await expect
    .poll(
      async () => (await server.api.state()).tasks?.find((item) => item.id === task?.id)?.status,
    )
    .toBe("failed");
  await expect(page.locator('.sr-only[role="alert"]')).toContainText("Cancelled");
});

test("cancelled generated-media export has a typed job and a cancelled task", async ({
  startServer,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  const format = await server.command("set_format", { preset: "landscape-1080p" });
  expect(format.ok).toBe(true);
  const exportResult = await server.command("export_video", {
    path: join(dirname(sampleVideo), "cancel-test.mp4"),
  });
  expect(exportResult.ok).toBe(true);
  if (
    !exportResult.ok ||
    typeof exportResult.data !== "object" ||
    exportResult.data === null ||
    !("jobId" in exportResult.data) ||
    typeof exportResult.data.jobId !== "string"
  )
    throw new Error("Generated export did not return a job ID");
  const id = exportResult.data.jobId;
  const cancellation = await server.api.call("POST", `/api/tasks/${id}/cancel`, {});
  expect(cancellation.body).toEqual({ cancelled: true });
  await expect
    .poll(async () => (await server.api.state()).jobs.find((item) => item.id === id)?.status)
    .not.toBe("running");
  const state = await server.api.state();
  const job = state.jobs.find((item) => item.id === id);
  const task = state.tasks?.find((item) => item.id === id);
  expect(job).toMatchObject({ status: "error", error: "Cancelled", cancelled: true });
  expect(task?.status).toBe("cancelled");
});

test("cancelled local model download remains a neutral state in Settings", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer({ modelStepMs: 300 });
  await openApp(server);
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /Download/ }).click();
  await expect(
    dialog.getByRole("progressbar", { name: "Downloading the local model" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel download" }).click();
  await expect(dialog.getByText("Local model download cancelled.")).toHaveClass(/note--info/);
  await expect(page.locator('.sr-only[role="status"]')).toContainText(
    "Local model download cancelled.",
  );
  await expect(page.locator('.sr-only[role="alert"]')).toBeEmpty();
  const state = await server.api.state();
  expect(state.jobs.find((job) => job.kind === "model-download")).toMatchObject({
    status: "error",
    cancelled: true,
  });
  await shot("cancelled-model-neutral");
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(dialog.getByText("Local model download cancelled.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await shot("cancelled-model-neutral-compact");
});
