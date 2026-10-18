// History panel (restore, checkpoints, who made each state), undo/redo keys, export progress, layout controls.

import { chatInput, expect, test } from "./fixtures";

test("history lists every state with its author, restores on click, and keeps checkpoints", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await server.command("split", { at: 2 });
  await openApp(server);

  // An AI edit, so the list contains both kinds of author.
  await chatInput(page).fill("Add a title");
  await chatInput(page).press("Enter");
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeVisible();

  await page.getByRole("tab", { name: "History" }).click();
  const list = page
    .getByRole("list")
    .filter({ has: page.getByRole("button", { name: /Split at 2s/ }) });
  await expect(list.getByRole("button", { name: /Split at 2s/ })).toContainText("You");
  await expect(list.getByRole("button", { name: /Add Title: fade/ })).toContainText("Assistant");
  await expect(list.getByRole("button", { name: /Import interview\.mp4/ })).toBeVisible();
  // The newest state is the current one.
  await expect(list.getByRole("button", { name: /Add Title: fade/ })).toHaveAttribute(
    "aria-current",
    "step",
  );

  // Name a checkpoint on the current state.
  await page.getByLabel("Checkpoint name").fill("With title");
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.getByRole("button", { name: "Restore checkpoint With title" })).toBeVisible();
  expect(server.session.history().some((h) => h.name === "With title")).toBe(true);

  // Go back to the state before the AI edit.
  await list.getByRole("button", { name: /Split at 2s/ }).click();
  await expect(list.getByRole("button", { name: /Split at 2s/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(server.session.project.timeline.overlays).toHaveLength(0);
  await shot("06-history-restored");

  // Nothing is lost: restore the checkpoint to come back.
  await page.getByRole("button", { name: "Restore checkpoint With title" }).click();
  await expect.poll(() => server.session.project.timeline.overlays.length).toBe(1);
});

test("Ctrl+Z and Shift+Ctrl+Z undo and redo, but not while typing in a text box", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await server.command("add_overlay", { preset: "title-fade", start: 0 });
  await openApp(server);
  await expect(page.getByRole("banner").getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.locator("body").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("Control+z");
  await expect.poll(() => server.session.project.timeline.overlays.length).toBe(0);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => server.session.project.timeline.overlays.length).toBe(1);

  // In a text field the browser's own text undo wins.
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByLabel("Checkpoint name").click();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  expect(server.session.project.timeline.overlays).toHaveLength(1);
});

test("export shows progress on the button and announces the finished file", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ exportPadMs: 2500 });
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  const path = dialog.getByLabel("Save as");
  // The suggested file sits next to the source video and is named after the project.
  await expect(path).toHaveValue(/Untitled\.mp4$/);
  await dialog.getByRole("button", { name: "Export" }).click();

  const busy = page.getByRole("banner").getByRole("button", { name: /Exporting/ });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();
  await shot("07-exporting");
  await expect(page.getByText(/Exported .* to .*Untitled\.mp4/)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
});

test("a bad export path is refused in the dialog before anything is sent", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await dialog.getByLabel("Save as").fill("/tmp/not-an-mp4.txt");
  await expect(dialog.getByRole("button", { name: "Export" })).toBeDisabled();
});

test("panels resize with the keyboard and the side drawer tabs use arrow keys", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);

  const splitter = page.getByRole("separator", { name: "Resize chat panel" });
  const before = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(before + 16));

  await page.getByRole("tab", { name: "Presets" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Inspector" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
});

test("selecting something in the editor opens the Inspector tab", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveAttribute("aria-selected", "true");

  // The editor module reports a selection through useEditor(); the shell reacts by showing the Inspector.
  await page.getByRole("region", { name: "Timeline" }).getByRole("button").first().click();
  await expect(page.getByRole("tab", { name: "Inspector" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the layout holds together in a small window without horizontal scrolling", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 640 });
  await openApp(server);
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The middle column keeps a usable width because the panels are clamped.
  const preview = await page.getByRole("region", { name: "Preview" }).boundingBox();
  expect(preview?.width ?? 0).toBeGreaterThan(380);
  await shot("12-small-window");
});
