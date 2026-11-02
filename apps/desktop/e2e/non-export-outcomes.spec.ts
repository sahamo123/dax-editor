// Simulate a speech setup job completing or failing after its endpoint returns an ID.
import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "./fixtures";

for (const status of ["done", "error"] as const) {
  test(`speech setup ${status} is announced once from a recovered snapshot`, async ({
    page,
    startServer,
    openApp,
  }) => {
    const server = await startServer();
    await server.api.settled();
    const base = await server.api.state();
    const project = await server.project();
    let acceptSocket: (socket: WebSocketRoute) => void = () => {};
    const connected = new Promise<WebSocketRoute>((resolve) => {
      acceptSocket = resolve;
    });
    await page.routeWebSocket(
      (url) => url.pathname === "/ws",
      (socket) => acceptSocket(socket),
    );
    await page.route("**/api/speech", (route) =>
      route.fulfill({
        status: 200,
        json: {
          ready: false,
          runtimeInstalled: false,
          modelInstalled: false,
          modelId: "synthetic",
          sizeBytes: 0,
          detail: "Synthetic setup",
        },
      }),
    );
    await page.route("**/api/speech/install", (route) =>
      route.fulfill({ status: 202, json: { jobId: "speech-local" } }),
    );
    await openApp(server);
    const socket = await connected;
    await page.getByRole("tab", { name: "Speech", exact: true }).click();
    const install = page.getByRole("button", { name: "Install offline speech" });
    await expect(install).toBeVisible();
    const refresh = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/state" && response.request().method() === "GET",
    );
    await install.click();
    await refresh;
    const job = {
      id: "speech-local",
      kind: "speech-setup",
      label: "/private/synthetic",
      status,
      progress: 1,
      ...(status === "error" ? { error: "Synthetic setup failure" } : {}),
    };
    socket.send(JSON.stringify({ type: "state", state: { ...base, jobs: [...base.jobs, job] } }));
    const message = status === "done" ? "Offline speech ready." : "Synthetic setup failure";
    const role = status === "done" ? "status" : "alert";
    await expect(page.locator(`.sr-only[role="${role}"]`)).toContainText(message);
    await expect(page.locator(".toast__text").filter({ hasText: message })).toHaveCount(1);
    socket.send(JSON.stringify({ type: "job", job }));
    await expect(page.locator(".toast__text").filter({ hasText: message })).toHaveCount(1);
    expect(await server.project()).toEqual(project);
  });
}

test("local model job notices follow the live engine with a fake runtime", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer({ modelStepMs: 80 });
  await openApp(server);
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /Download \(2\.0 GB\)/ }).click();
  await expect(page.locator('.sr-only[role="status"]')).toContainText("Local model downloaded.");
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Stopped");
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(page.locator('.sr-only[role="status"]')).toContainText("Local model started.");
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Running");
  const state = await server.api.state();
  expect(
    state.jobs.filter((job) => job.kind === "model-download" && job.status === "done"),
  ).toHaveLength(1);
  expect(
    state.jobs.filter((job) => job.kind === "model-start" && job.status === "done"),
  ).toHaveLength(1);
});
