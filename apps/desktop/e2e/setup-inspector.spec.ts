// Project setup is optional, while selected-item inspection preserves editing and focus.
import { expect, test } from "./fixtures";

test("empty project setup can be skipped and reopened without changing the project", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await openApp(server);
  const before = await server.project();
  const skip = page.getByRole("button", { name: "Start editing", exact: true });
  await expect(skip).toBeVisible();
  await page.getByRole("button", { name: "Project options", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Tools", exact: true })).toBeFocused();
  await expect(page.getByLabel("Output format", { exact: true })).toBeVisible();
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Project setup", exact: true })).toBeFocused();
  expect(await server.project()).toEqual(before);
  await page.getByRole("button", { name: "Project setup", exact: true }).click();
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Project setup", exact: true })).toBeFocused();
  expect(await server.project()).toEqual(before);
});

test("existing project opens directly and selection exposes inspector without moving focus", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start editing", exact: true })).toBeHidden();
  const clip = page.getByRole("region", { name: "Timeline" }).getByTestId("clip").first();
  await clip.focus();
  await clip.click();
  await expect(page.getByRole("tab", { name: "Inspector", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(clip).toBeFocused();
  await page.getByRole("button", { name: "Project setup", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Tools", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Output format", { exact: true })).toBeVisible();
});

test("new project restores setup and a failed import does not change its state", async ({
  page,
  startServer,
  openApp,
}) => {
  const server = await startServer();
  await openApp(server);
  await page.getByRole("button", { name: "Start editing", exact: true }).click();
  await page.getByText("Project", { exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("dialog", { name: "New project" }).getByRole("textbox").fill("Fresh setup");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect.poll(async () => (await server.project()).name).toBe("Fresh setup");
  await expect(page.getByRole("button", { name: "Start editing", exact: true })).toBeVisible();
  const before = await server.project();
  await page.getByText("Project", { exact: true }).click();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import", exact: true }).click();
  await (await picker).setFiles({
    name: "bad.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not video"),
  });
  await expect(page.getByText(/ffprobe|Invalid data|video stream/i).first()).toBeVisible();
  expect(await server.project()).toEqual(before);
  await expect(page.getByRole("button", { name: "Start editing", exact: true })).toBeVisible();
});
