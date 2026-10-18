// Resilience: the engine can be down at launch or vanish mid-session. The UI must say so clearly, stay stable,
// and recover by itself.

import { expect, test } from "./fixtures";

test("shows a reconnect banner when the engine disappears and recovers when it returns", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await expect(page.getByRole("banner").getByRole("button", { name: "Import" })).toBeEnabled();

  await server.stop();
  const banner = page.getByRole("alert").filter({ hasText: "Can't reach the editor engine" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Editing is paused");
  // Anything that needs the engine is disabled, the last known project stays on screen.
  await expect(page.getByRole("banner").getByRole("button", { name: "Import" })).toBeDisabled();
  await expect(page.getByLabel("Message to the assistant")).toBeDisabled();
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  await shot("10-offline-banner");

  await server.start();
  await banner.getByRole("button", { name: "Retry now" }).click();
  await expect(banner).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("banner").getByRole("button", { name: "Import" })).toBeEnabled();

  // And the state is live again: a change made on the engine shows up.
  await server.command("add_overlay", { preset: "title-fade", start: 0 });
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Add Title: fade/ })).toBeVisible();
});

test("reconnects on its own without pressing anything", async ({ page, startServer, openApp }) => {
  const server = await startServer();
  await openApp(server);
  await server.stop();
  const banner = page.getByRole("alert").filter({ hasText: "Can't reach the editor engine" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Trying again in \d+s|Reconnecting/);

  await server.start();
  await expect(banner).toBeHidden({ timeout: 20_000 });
});

test("an engine that is down at launch shows the banner and a waiting screen, not a crash", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await server.stop();
  await openApp(server);

  await expect(
    page.getByRole("alert").filter({ hasText: "Can't reach the editor engine" }),
  ).toBeVisible();
  await expect(page.getByText("Waiting for the editor engine...")).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Undo" })).toBeDisabled();
  await shot("11-down-at-launch");

  await server.start();
  await page.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible({
    timeout: 15_000,
  });
});

test("a wrong token is reported instead of hanging", async ({ page, startServer }) => {
  const server = await startServer();
  const qs = new URLSearchParams({ server: server.url, token: "wrong" });
  await page.goto(`/?${qs.toString()}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Can't reach the editor engine" }),
  ).toBeVisible();
});

test("without ?server and ?token the browser build asks for them", async ({
  page,
  startServer,
}) => {
  const server = await startServer();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect to the editor engine" })).toBeVisible();
  await page.getByLabel("Server address").fill(server.url);
  await page.getByLabel("Token").fill(server.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();

  // A reload keeps the connection for this tab.
  await page.reload();
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();
});
