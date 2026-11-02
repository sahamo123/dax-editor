// Failed attachment staging preserves an unsent chat draft without replaying an edit.
import { chatInput, expect, test } from "./fixtures";

test("an attachment rejected before chat leaves the draft available for an intentional retry", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const requests: { message: string; mode: string }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") {
      requests.push(request.postDataJSON() as { message: string; mode: string });
    }
  });
  await page.getByLabel("Chat mode").selectOption("plan");
  const firstChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await firstChooser).setFiles({
    name: "empty.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(0),
  });
  const input = chatInput(page);
  const prompt =
    "Plan the next edit\nKeep the title short\nLeave the audio intact\nSuggest a clean ending";
  await input.fill(prompt);
  const draftHeight = await input.evaluate((element) => element.getBoundingClientRect().height);
  await input.press("Enter");
  await expect(page.getByText("Choose a non-empty file no larger than 1 GiB.")).toBeVisible();
  await expect(input).toHaveValue(prompt);
  await expect(input).toBeEnabled();
  await expect
    .poll(() => input.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(draftHeight - 1);
  await expect(page.getByLabel("Chat mode")).toHaveValue("plan");
  await expect(page.getByRole("button", { name: "Remove attachment empty.mp4" })).toBeVisible();
  expect(requests).toHaveLength(0);
  await shot("s01-06-attachment-failure-recovery");

  await page.getByRole("button", { name: "Remove attachment empty.mp4" }).click();
  const secondChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await secondChooser).setFiles(sampleVideo);
  await input.press("Enter");
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ message: prompt, mode: "plan" });
});

test("a failed attachment preserves a multiline draft while switching compact views", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const observerErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message.includes("ResizeObserver")) observerErrors.push(error.message);
  });
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(server);
  await page.getByRole("button", { name: "Assistant view" }).click();
  const input = chatInput(page);
  const prompt =
    "Plan the next edit\nKeep the title short\nLeave the audio intact\nSuggest a clean ending";
  await input.fill(prompt);
  const draftHeight = await input.evaluate((element) => element.getBoundingClientRect().height);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach videos" }).click();
  await (await chooser).setFiles(sampleVideo);

  let uploadStarted = false;
  let releaseUpload = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/import/upload**", async (route) => {
    uploadStarted = true;
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic upload failure" }),
    });
  });
  try {
    await input.press("Enter");
    await expect.poll(() => uploadStarted).toBe(true);
    await page.getByRole("button", { name: "Edit view" }).click();
    const response = page.waitForResponse((result) => result.url().includes("/api/import/upload"));
    releaseUpload();
    await response;
    await page.getByRole("button", { name: "Assistant view" }).click();
    await expect(input).toHaveValue(prompt);
    await expect(input).toBeEnabled();
    await expect
      .poll(() => input.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(draftHeight - 1);
    await expect(page.getByText("Synthetic upload failure")).toBeVisible();
    await expect(page.getByRole("button", { name: /Remove attachment/ })).toBeVisible();
    await shot("s01-06-attachment-failure-compact");
    expect(observerErrors).toEqual([]);
  } finally {
    releaseUpload();
  }
});
