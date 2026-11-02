// Reconcile a local export ID and a synthetic terminal snapshot in either arrival order.
import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "./fixtures";

for (const order of ["reply-first", "snapshot-first"] as const) {
  test(`local export outcome is reported when ${order}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
  }) => {
    const server = await startServer();
    await server.importPaths([sampleVideo]);
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
    let release = () => {};
    let started = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route("**/api/command", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { name?: unknown };
      if (body.name !== "export_video") {
        await route.continue();
        return;
      }
      started();
      await held;
      await route.fulfill({
        status: 200,
        json: { ok: true, summary: "Synthetic export started", data: { jobId: "local-job" } },
      });
    });
    try {
      await openApp(server);
      const socket = await connected;
      const exportButton = page.getByRole("button", { name: "Export", exact: true });
      await expect(exportButton).toBeEnabled();
      await exportButton.click();
      const dialog = page.getByRole("dialog", { name: "Export video" });
      await dialog.getByRole("button", { name: "Export", exact: true }).click();
      await requested;
      const done = {
        id: "local-job",
        kind: "export",
        label: "Export",
        progress: 1,
        status: "done",
        result: "/tmp/out.mp4",
      };
      const sendDone = () =>
        socket.send(
          JSON.stringify({
            type: "state",
            state: {
              ...base,
              project: { ...base.project, name: "Synthetic snapshot observed" },
              jobs: [...base.jobs, done],
            },
          }),
        );
      if (order === "snapshot-first") {
        sendDone();
        await expect(page.locator("header h1")).toHaveText("Synthetic snapshot observed");
        release();
      } else {
        release();
        await expect(dialog).toBeHidden();
        sendDone();
      }
      await expect(page.locator('.sr-only[role="status"]')).toContainText("Exported out.mp4.");
      await expect(
        page.locator(".toast__text").filter({ hasText: "Exported out.mp4." }),
      ).toHaveCount(1);
      expect(await server.project()).toEqual(project);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}
