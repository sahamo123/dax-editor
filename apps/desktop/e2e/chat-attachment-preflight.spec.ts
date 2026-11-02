// A locally invalid later attachment must not stage the earlier file or submit chat.
import { readFile } from "node:fs/promises";
import { chatInput, expect, test } from "./fixtures";

test("preflights all attachments before uploading any", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);
  let uploads = 0;
  let chats = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/import/upload") uploads++;
    if (request.method() === "POST" && path === "/api/chat") chats++;
  });
  await page.getByLabel("Chat mode").selectOption("plan");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await chooser).setFiles([
    { name: "valid.mp4", mimeType: "video/mp4", buffer: await readFile(sampleVideo) },
    { name: "empty.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(0) },
  ]);
  const input = chatInput(page);
  await input.fill("Plan this edit");
  await input.press("Enter");
  await expect(
    page.getByText("empty.mp4: Choose a non-empty file no larger than 1 GiB."),
  ).toBeVisible();
  await expect(input).toHaveValue("Plan this edit");
  await expect(page.getByLabel("Chat mode")).toHaveValue("plan");
  await expect(page.getByRole("button", { name: "Remove attachment valid.mp4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove attachment empty.mp4" })).toBeVisible();
  expect(uploads).toBe(0);
  expect(chats).toBe(0);
  expect((await server.api.state()).tasks?.some((task) => task.title === "Plan this edit")).toBe(
    false,
  );
});
