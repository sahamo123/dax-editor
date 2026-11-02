// Observe a real engine cancellation with fake speech setup; no model or user media is used.
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

test.skip(process.env.DAX_CANCEL_DIAGNOSTIC !== "1", "Opt-in reproduction for issue #251");

test("diagnose cancelled speech task and its notice", async ({ page, startServer, openApp }) => {
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
  await expect(page.locator('.sr-only[role="alert"]')).toContainText("Cancelled");
  await expect(page.locator(".toast--error").filter({ hasText: "Cancelled" })).toHaveCount(1);
});

test("diagnose cancellation of a generated-media export", async ({ startServer, sampleVideo }) => {
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
  console.log(
    JSON.stringify({
      jobStatus: job?.status,
      exactCancellationText: job?.error === "Cancelled",
      taskStatus: task?.status,
    }),
  );
  expect(job?.status).toBe("error");
});
