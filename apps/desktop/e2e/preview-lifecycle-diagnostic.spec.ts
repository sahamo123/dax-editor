// Opt-in synthetic investigation: record preview lifecycle without logging URLs, paths or credentials.
import { expect, test } from "./fixtures";

test.skip(process.env.DAX_PREVIEW_DIAGNOSTIC !== "1", "Opt-in generated-media investigation");

test("records preview status before and after a forced assertion failure and server shutdown", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  test.setTimeout(90_000);
  const events: { elapsedMs: number; event: string }[] = [];
  const startedAt = Date.now();
  const record = (event: string) => events.push({ elapsedMs: Date.now() - startedAt, event });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/ws") return;
    record("socket-created");
    let lastStatus = "";
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      try {
        const message: unknown = JSON.parse(payload);
        if (
          !message ||
          typeof message !== "object" ||
          !("type" in message) ||
          message.type !== "job"
        )
          return;
        if (!("job" in message) || !message.job || typeof message.job !== "object") return;
        const job = message.job;
        if (!("kind" in job) || job.kind !== "export" || !("status" in job)) return;
        if (job.status !== "running" && job.status !== "done" && job.status !== "error") return;
        if (job.status !== lastStatus) {
          lastStatus = job.status;
          record(`export-${job.status}`);
        }
      } catch {
        record("invalid-job-frame");
      }
    });
    socket.on("close", () => record("socket-closed"));
  });

  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const response = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/command" &&
      item.request().postDataJSON()?.name === "render_preview",
  );
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  expect((await response).ok()).toBe(true);
  record("preview-command-returned");
  const before = await server.api.state();
  const preview = before.jobs.find((job) => job.kind === "export");
  if (!preview) throw new Error("Synthetic preview job not found");
  expect(preview.status, "The synthetic render must still be running for this investigation").toBe(
    "running",
  );

  let forcedFailure = false;
  try {
    await expect(page.getByText("Diagnostic-only missing element 62819")).toBeVisible({
      timeout: 100,
    });
  } catch {
    forcedFailure = true;
    record("forced-assertion-failed");
  }
  expect(forcedFailure).toBe(true);
  const atFailure = await server.api.state();
  expect(atFailure.jobs.find((job) => job.id === preview.id)?.status).toBe("running");
  expect(await page.getByText("Can't reach the editor engine.").count()).toBe(0);
  record("server-connected-render-running");

  record("explicit-server-stop-started");
  await server.stop();
  record("explicit-server-stop-finished");
  await expect(page.getByText("Can't reach the editor engine.")).toBeVisible();
  const review = page.getByRole("dialog", { name: "Rendered effects preview" });
  await expect(review.getByRole("alert")).toHaveText("Cancelled");
  record("disconnect-and-cancel-visible");
  console.info(JSON.stringify({ scenario: "forced-assertion-then-stop", events }));
});

test("records actual preview job and socket timing before any teardown", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  test.setTimeout(120_000);
  const events: { elapsedMs: number; event: string }[] = [];
  const startedAt = Date.now();
  const record = (event: string) => events.push({ elapsedMs: Date.now() - startedAt, event });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/ws") return;
    record("socket-created");
    let lastStatus = "";
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      try {
        const message: unknown = JSON.parse(payload);
        if (
          !message ||
          typeof message !== "object" ||
          !("type" in message) ||
          message.type !== "job"
        )
          return;
        if (!("job" in message) || !message.job || typeof message.job !== "object") return;
        const job = message.job;
        if (!("kind" in job) || job.kind !== "export" || !("status" in job)) return;
        if (job.status !== "running" && job.status !== "done" && job.status !== "error") return;
        if (job.status !== lastStatus) {
          lastStatus = job.status;
          record(`export-${job.status}`);
        }
      } catch {
        record("invalid-job-frame");
      }
    });
    socket.on("close", () => record("socket-closed"));
  });
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  if (process.env.DAX_PREVIEW_SMALL === "1") {
    expect((await server.command("set_format", { width: 640, height: 360 })).ok).toBe(true);
  }
  const timeline = (await server.api.state()).project.timeline;
  record(`format-${timeline.width}x${timeline.height}`);
  await openApp(server);
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rendered effects preview" });
  try {
    await expect(
      dialog.locator(".toast").filter({ hasText: "Effects preview ready." }),
    ).toBeVisible({
      timeout: 30_000,
    });
    record("ready-notice-visible");
  } catch {
    record("ready-assertion-failed");
    const state = await Promise.race([
      server.api.state().then(
        (value) => ({
          available: true,
          statuses: value.jobs.filter((j) => j.kind === "export").map((j) => j.status),
        }),
        () => ({ available: false, statuses: [] }),
      ),
      new Promise<{ available: boolean; statuses: string[] }>((resolve) =>
        setTimeout(() => resolve({ available: false, statuses: [] }), 1000),
      ),
    ]);
    console.info(
      JSON.stringify({ scenario: "natural-preview-30s-timeout-before-teardown", events, state }),
    );
    expect(state.available).toBe(true);
    expect(state.statuses.some((status) => status === "running" || status === "done")).toBe(true);
    await expect(
      dialog.locator(".toast").filter({ hasText: "Effects preview ready." }),
    ).toBeVisible({ timeout: 60_000 });
    record("ready-notice-visible-after-30s-timeout");
  }
  console.info(
    JSON.stringify({ scenario: "natural-preview-eventual-result-before-teardown", events }),
  );
});
