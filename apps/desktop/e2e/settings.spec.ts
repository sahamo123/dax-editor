// Settings: choosing and configuring an assistant, the local model card with progress, CLI sign-in status,
// and the rule that an API key is never shown again.

import { chatInput, expect, test } from "./fixtures";

test("saves an OpenAI-compatible provider and never shows the key again", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await openApp(server);

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /OpenAI-compatible API/ }).click();
  await dialog.getByLabel("Base URL").fill("https://llm.example.test/v1");
  await dialog.getByLabel("Model").fill("tiny-model");
  await dialog.getByLabel("API key").fill("sk-secret-123");
  await dialog.getByLabel(/Use OpenAI-compatible API for chat/).check();
  await shot("08-settings-api");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(server.settings.activeProvider).toBe("openai-compatible");
  expect(server.settings.providers["openai-compatible"]).toEqual({
    baseUrl: "https://llm.example.test/v1",
    model: "tiny-model",
  });
  expect(server.secrets["openai-compatible"]).toBe("sk-secret-123");
  // The assistant is now ready, so the chat unlocks.
  await expect(page.getByTestId("provider-status")).toContainText("is ready");
  await expect(chatInput(page)).toBeEnabled();

  // Reopening: the key box is empty and says a key is saved; the key is nowhere in the page.
  await page.getByRole("button", { name: "Settings" }).click();
  const again = page.getByRole("dialog", { name: "Settings" });
  await expect(again.getByLabel("API key")).toHaveValue("");
  await expect(again.getByText("Key saved")).toBeVisible();
  expect(await page.content()).not.toContain("sk-secret-123");
});

test("rejects a malformed base URL before saving", async ({ page, startServer, openApp }) => {
  const server = await startServer();
  await openApp(server);

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /OpenAI-compatible API/ }).click();
  await dialog.getByLabel("Base URL").fill("not a url");
  await expect(dialog.getByText(/Enter a full address/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("downloads, starts and uses the local model", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);

  // The setup card in the chat leads straight to the local model.
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Not downloaded");
  await expect(dialog.getByText("Mock Small 3B (Q4)")).toBeVisible();

  await dialog.getByRole("button", { name: /Download \(2\.0 GB\)/ }).click();
  const bar = dialog.getByRole("progressbar", { name: "Downloading the local model" });
  await expect(bar).toBeVisible();
  await shot("09-local-model-download");
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Stopped", { timeout: 15_000 });

  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(dialog.getByTestId("local-model-status")).toHaveText("Running", { timeout: 15_000 });
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("provider-status")).toContainText("Local model is ready");
  await chatInput(page).fill("Add a title");
  await chatInput(page).press("Enter");
  await expect(page.getByText("I added a title at the start.")).toBeVisible();
});

test("shows CLI sign-in status from the engine and rechecks on demand", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await openApp(server);

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /Claude Code/ }).click();
  await expect(dialog.locator(".status-pill")).toHaveText("Not found");
  await expect(dialog.getByText("claude is not installed")).toBeVisible();

  server.setCli("cli-claude", "out");
  await dialog.getByRole("button", { name: "Check again" }).click();
  await expect(dialog.locator(".status-pill")).toHaveText("Not signed in");

  server.setCli("cli-claude", "in");
  await dialog.getByRole("button", { name: "Check again" }).click();
  await expect(dialog.locator(".status-pill")).toHaveText("Signed in");
});

test("the chat header switches assistants without opening Settings", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer({ aiReady: true });
  server.setCli("cli-codex", "in");
  await openApp(server);

  await page.getByLabel("Assistant", { exact: true }).selectOption("cli-codex");
  await expect.poll(async () => (await server.api.settings()).activeProvider).toBe("cli-codex");
  await expect(page.getByTestId("provider-status")).toContainText("Codex CLI is ready");
});

test("Escape closes Settings and focus returns to the button that opened it", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await openApp(server);

  const opener = page.getByRole("button", { name: "Settings" });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(opener).toBeFocused();
});
