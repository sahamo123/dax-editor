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
