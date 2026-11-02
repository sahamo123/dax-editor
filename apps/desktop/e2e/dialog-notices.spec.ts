// The compact Settings footer must remain reachable while a job notice is visible.
import { expect, test } from "./fixtures";

for (const viewport of [
  { width: 1024, height: 700 },
  { width: 1440, height: 900 },
])
  test(`a visible notice does not cover Settings actions at ${viewport.width}×${viewport.height}`, async ({
    page,
    startServer,
    openApp,
    shot,
  }) => {
    const server = await startServer({ modelStepMs: 300 });
    await openApp(server);
    await page.getByRole("button", { name: /Run a model on this computer/ }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByRole("button", { name: /Download/ }).click();
    await expect(
      dialog.getByRole("progressbar", { name: "Downloading the local model" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel download" }).click();
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const notice = page.locator(".toast").filter({ hasText: "Local model download cancelled." });
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await expect(notice).toBeVisible();
    await expect(save).toBeVisible();
    await shot(`dialog-notice-${viewport.width}`);
    const noticeBox = await notice.boundingBox();
    const saveBox = await save.boundingBox();
    if (!noticeBox || !saveBox) throw new Error("Notice or Save action has no rendered box");
    const overlap =
      noticeBox.x < saveBox.x + saveBox.width &&
      noticeBox.x + noticeBox.width > saveBox.x &&
      noticeBox.y < saveBox.y + saveBox.height &&
      noticeBox.y + noticeBox.height > saveBox.y;
    expect({ overlap, noticeBox, saveBox }).toMatchObject({ overlap: false });
    const hits = await save.evaluate((button) => {
      const box = button.getBoundingClientRect();
      return [0.2, 0.5, 0.8].flatMap((x) =>
        [0.2, 0.5, 0.8].map((y) => {
          const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
          return hit !== null && button.contains(hit);
        }),
      );
    });
    expect(hits).toEqual(Array(9).fill(true));
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const dismiss = notice.getByRole("button", { name: "Dismiss message" });
    await close.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("region", { name: "Task notifications" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(notice).toHaveCount(0);
    await expect(page.locator('.sr-only[role="status"]')).toContainText(
      "Local model download cancelled.",
    );
    await save.click();
    await expect(dialog).toHaveCount(0);
  });

test("a completed preview notice stays inside the review dialog and is keyboard dismissible", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rendered effects preview" });
  const notice = dialog.locator(".toast").filter({ hasText: "Effects preview ready." });
  await expect(notice).toBeVisible({ timeout: 30000 });
  const back = dialog.getByRole("button", { name: "Back to editing" });
  await expect(back).toBeVisible();
  await shot("dialog-notice-rendered-review");
  await back.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("region", { name: "Task notifications" })).toBeFocused();
  await page.keyboard.press("Tab");
  const dismiss = notice.getByRole("button", { name: "Dismiss message" });
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(notice).toHaveCount(0);
  await back.click();
  await expect(dialog).toHaveCount(0);
});

test("stacked long errors and other notices scroll without blocking the Settings footer", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const detail =
    "Synthetic setup error: the offline test service could not finish its work. ".repeat(14);
  const server = await startServer({
    modelStepMs: 300,
    speechWaitForCancel: true,
    speechFailureAfterCancel: true,
    speechFailureMessage: detail,
  });
  await openApp(server);
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /Download/ }).click();
  await expect(
    dialog.getByRole("progressbar", { name: "Downloading the local model" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel download" }).click();
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(dialog.locator(".toast--info")).toBeVisible();
  for (let index = 0; index < 2; index++) {
    const started = await server.api.call("POST", "/api/speech/install", {});
    if (
      !started.body ||
      typeof started.body !== "object" ||
      !("jobId" in started.body) ||
      typeof started.body.jobId !== "string"
    )
      throw new Error("Synthetic speech job did not start");
    await server.api.call("POST", `/api/tasks/${started.body.jobId}/cancel`, {});
    await expect(dialog.locator(".toast--error")).toHaveCount(index + 1);
  }
  await dialog.getByRole("button", { name: /Download/ }).click();
  await expect(dialog.locator(".toast--success")).toBeVisible();
  const host = dialog.getByRole("region", { name: "Task notifications" });
  expect(await host.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await dialog.locator(".toast--error .toast__text").first().textContent()).toBe(detail);
  await host.focus();
  await page.keyboard.press("End");
  await expect.poll(() => host.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible();
  expect(
    await save.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && button.contains(hit);
    }),
  ).toBe(true);
  await shot("dialog-notice-stacked-errors");
  const lastErrorDismiss = dialog
    .locator(".toast--error")
    .last()
    .getByRole("button", { name: "Dismiss message" });
  await lastErrorDismiss.focus();
  await expect(lastErrorDismiss).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".toast--error")).toHaveCount(1);
  await save.click();
  await expect(dialog).toHaveCount(0);
});
