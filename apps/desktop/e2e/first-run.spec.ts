// First run: nothing imported yet. The editor must say what to do, work without AI, and import a video
// (typed path in the browser build, or a dropped path).

import { chatInput, expect, test } from "./fixtures";

test("first-run screen says to drop or import, and that AI is optional", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await openApp(server);

  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();
  await expect(page.getByText("The editor works without AI.")).toBeVisible();
  // The chat box explains itself instead of silently failing, and the setup card offers the three routes.
  await expect(chatInput(page)).toBeDisabled();
  await expect(chatInput(page)).toHaveAttribute("placeholder", "Set up an assistant to chat");
  await expect(page.getByRole("button", { name: /Run a model on this computer/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Use my own API key/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Use Claude Code, Codex or Gemini/ }),
  ).toBeVisible();
  // Export needs something to export.
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
  await shot("01-first-run");
});

test("imports a video by typed path and shows it in the editor and the media bin", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await openApp(server);

  await page.getByRole("banner").getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import video" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("File path(s)").fill(sampleVideo);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Video imported.")).toBeVisible();
  await expect(page.getByText("Drop a video here or click Import")).toBeHidden();
  expect(Object.keys(server.session.project.assets)).toHaveLength(1);

  await page.getByRole("tab", { name: "Media" }).click();
  await expect(page.getByText("interview.mp4", { exact: true })).toBeVisible();
  await expect(page.getByText("On timeline")).toBeVisible();
  // The thumbnail comes from the server's media pipeline over the token-protected media URL.
  await expect
    .poll(() =>
      page
        .locator("img.thumb")
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await shot("02-imported-media-bin");
});

test("shows a clear error when the engine refuses a path", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await openApp(server);

  await page.getByRole("banner").getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import video" });
  await dialog.getByLabel("File path(s)").fill("/etc/hosts");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText(/outside the allowed folders/)).toBeVisible();
  // The dialog stays open so the path can be corrected.
  await expect(dialog).toBeVisible();
});

test("a dropped path imports; a drop without paths explains what to do", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await openApp(server);

  // Browsers hide real file paths, so the web build understands dropped text and file:// links.
  const drag = (type: string, text: string) =>
    page.evaluate(
      ([t, value]) => {
        const dt = new DataTransfer();
        dt.setData("text/plain", value ?? "");
        window.dispatchEvent(
          new DragEvent(t ?? "drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      },
      [type, text],
    );

  await drag("dragenter", "x");
  await expect(page.getByText("Drop to import")).toBeVisible();
  await shot("03-drop-overlay");

  await drag("drop", `file://${sampleVideo}`);
  await expect(page.getByText("Video imported.")).toBeVisible();
  await expect(page.getByText("Drop to import")).toBeHidden();

  await drag("drop", "not a path");
  await expect(page.getByRole("dialog", { name: "Import video" })).toContainText(
    "can't tell the app",
  );
});
