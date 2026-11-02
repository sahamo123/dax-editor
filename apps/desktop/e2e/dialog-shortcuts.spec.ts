// Dialog keyboard input must not edit the project behind the dialog.
import { expect, test } from "./fixtures";

test("modal keys leave the timeline unchanged and shortcuts resume after closing", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const clips = page.getByRole("region", { name: "Timeline" }).getByTestId("clip");
  await expect(clips).toHaveCount(1);
  await clips.first().click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Close" }).focus();
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/command") {
      commands.push(request.postData() ?? "");
    }
  });
  await page.keyboard.press("s");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  expect(commands).toEqual([]);
  await expect(clips).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("s");
  await expect.poll(async () => clips.count()).toBe(2);
});

test("a disabled focused dialog button cannot expose background editing shortcuts", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const clips = page.getByRole("region", { name: "Timeline" }).getByTestId("clip");
  await clips.first().click();
  await page.keyboard.press("Shift+ArrowRight");

  let releaseSave = () => {};
  let markSaveStarted = () => {};
  const saveBlocked = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      markSaveStarted();
      await saveBlocked;
    }
    await route.continue();
  });
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/command") {
      commands.push(request.postData() ?? "");
    }
  });

  try {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await save.focus();
    await page.keyboard.press("Enter");
    await saveStarted;
    await expect(dialog.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    const close = dialog.getByRole("button", { name: "Close" });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("s");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    expect(commands).toEqual([]);
    await expect(clips).toHaveCount(1);
    await shot("modal-save-disabled");
  } finally {
    releaseSave();
    await page.unrouteAll({ behavior: "wait" });
  }
});
