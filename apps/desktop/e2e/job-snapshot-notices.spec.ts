// A recovered terminal job is visible and reaches the live region without duplicate notices.
import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "./fixtures";

test("snapshot job outcomes produce one visible and accessible notice", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await server.api.settled();
  const base = await server.api.state();
  let acceptSocket: (socket: WebSocketRoute) => void = () => {};
  const connected = new Promise<WebSocketRoute>((resolve) => {
    acceptSocket = resolve;
  });
  await page.routeWebSocket(
    (url) => url.pathname === "/ws",
    (socket) => acceptSocket(socket),
  );
  await openApp(server);
  const socket = await connected;
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await expect(page.locator('.sr-only[role="status"]')).toBeEmpty();
  await expect(page.locator('.sr-only[role="alert"]')).toBeEmpty();

  const running = {
    id: "synthetic-export",
    kind: "export",
    label: "Export",
    progress: 0.4,
    status: "running",
  };
  const preparing = {
    id: "synthetic-proxy",
    kind: "proxy",
    label: "Preparing",
    progress: 0.2,
    status: "running",
  };
  const done = { ...running, progress: 1, status: "done", result: "/tmp/out.mp4" };
  const failed = { ...preparing, status: "error", error: "Synthetic media failure" };
  socket.send(
    JSON.stringify({ type: "state", state: { ...base, jobs: [...base.jobs, running, preparing] } }),
  );
  await expect(page.getByRole("button", { name: "Exporting, 40 percent" })).toBeVisible();
  socket.send(
    JSON.stringify({ type: "state", state: { ...base, jobs: [...base.jobs, done, failed] } }),
  );
  await expect(page.locator('.sr-only[role="status"]')).toContainText("Exported out.mp4.");
  await expect(page.locator('.sr-only[role="alert"]')).toContainText("Synthetic media failure");
  await expect(page.locator(".toast__text").filter({ hasText: "Exported out.mp4." })).toHaveCount(
    1,
  );
  await expect(
    page.locator(".toast__text").filter({ hasText: "Synthetic media failure" }),
  ).toHaveCount(1);
  socket.send(JSON.stringify({ type: "job", job: done }));
  socket.send(JSON.stringify({ type: "job", job: failed }));
  socket.send(JSON.stringify({ type: "job", job: running }));
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await expect(page.locator(".toast__text").filter({ hasText: "Exported out.mp4." })).toHaveCount(
    1,
  );
});
