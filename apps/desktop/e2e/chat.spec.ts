// Chat: a streamed assistant run with tool steps, "Undo this change", failures, stopping a run, suggestion chips.

import { chatInput, expect, test } from "./fixtures";

test("a chat run streams text and tool steps, and Undo this change reverts it", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await expect(page.getByTestId("provider-status")).toContainText("Local model is ready");
  // With a video and a ready assistant the suggestion chips appear.
  await expect(page.getByRole("button", { name: "Remove silences" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a title" })).toBeVisible();

  await chatInput(page).fill("Add a title");
  await chatInput(page).press("Enter");

  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("Add a title", { exact: true })).toBeVisible();
  // The assistant's tool call is a compact step with a success mark.
  const step = log.locator("details.tool", { hasText: "Add overlay" });
  await expect(step).toBeVisible();
  await expect(step).toContainText("Succeeded");
  await expect(step).toContainText('Added "My Video"');
  await expect(log.getByText("I added a title at the start.")).toBeVisible();
  expect((await server.project()).timeline.overlays).toHaveLength(1);

  // Steps expand to show exactly what was called.
  await step.locator("summary").click();
  await expect(step).toContainText("title-fade");
  await shot("04-chat-run");

  await page.getByRole("button", { name: "Undo this change" }).click();
  await expect(log.getByText("Change undone.")).toBeVisible();
  expect((await server.project()).timeline.overlays).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeHidden();

  // ... and can be brought back.
  await log.getByRole("button", { name: "Redo" }).click();
  await expect.poll(async () => (await server.project()).timeline.overlays.length).toBe(1);
});

test("a run that makes several edits is undone in one click and keeps manual work safe", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await chatInput(page).fill("Remove silences");
  await chatInput(page).press("Enter");
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.locator("details.tool", { hasText: "Remove silences" })).toContainText(
    "Succeeded",
  );
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeVisible();
  const shortened = (await server.history()).filter((h) => h.source === "ai").length;
  expect(shortened).toBeGreaterThanOrEqual(1);

  // A manual edit after the run means a blanket undo would also discard the user's work: the button goes away.
  await server.command("add_overlay", { preset: "title-pop", start: 0 });
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeHidden();
});

test("a failing tool call shows a cross and no undo button", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await chatInput(page).fill("please fail");
  await page.getByRole("button", { name: "Send message" }).click();

  const log = page.getByRole("log", { name: "Conversation" });
  const step = log.locator("details.tool", { hasText: "Split" });
  await expect(step).toContainText("Failed");
  await expect(step.locator(".tool__summary")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeHidden();
  await shot("05-chat-failed-step");
});

test("Stop cancels a long run", async ({ page, startServer, openApp, sampleVideo }) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await chatInput(page).fill("work slowly please");
  await chatInput(page).press("Enter");
  const stop = page.getByRole("button", { name: "Stop" });
  await expect(stop).toBeVisible();
  await expect(chatInput(page)).toBeDisabled();

  await stop.click();
  await expect(page.getByText("Stopped.")).toBeVisible();
  // The composer is usable again.
  await expect(chatInput(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
});

test("a suggestion chip sends its text", async ({ page, startServer, openApp, sampleVideo }) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await page.getByRole("button", { name: "Cut to 30 seconds" }).click();
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("Cut to 30 seconds", { exact: true })).toBeVisible();
  // The scripted assistant understands "cut to N", which here is longer than the clip, so it keeps all of it.
  await expect(log.locator("details.tool", { hasText: "Keep only" })).toBeVisible();
});

test("with no assistant set up the chat is disabled but editing still works", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer(); // no AI
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await expect(chatInput(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove silences" })).toBeHidden();
  // Manual editing through the same commands is fully available: undo/redo buttons work.
  await server.command("add_overlay", { preset: "title-fade", start: 0 });
  const undo = page.getByRole("banner").getByRole("button", { name: "Undo" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => (await server.project()).timeline.overlays.length).toBe(0);
});
