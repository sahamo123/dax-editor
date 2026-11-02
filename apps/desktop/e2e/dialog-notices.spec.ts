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
  // A full 1080p synthetic review can legitimately exceed 30 seconds on a laptop; retain the
  // real renderer and bound both its wait and the total test duration separately.
  test.setTimeout(120_000);
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rendered effects preview" });
  const notice = dialog.locator(".toast").filter({ hasText: "Effects preview ready." });
  await expect(notice).toBeVisible({ timeout: 90_000 });
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

test("keeps a notice while keyboard focus or pointer hover remains in its region", async ({
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
  const notice = dialog.locator(".toast").filter({ hasText: "Local model download cancelled." });
  const region = dialog.getByRole("region", { name: "Task notifications" });
  await expect(notice).toBeVisible();
  await region.focus();
  await expect(region).toBeFocused();
  await page.waitForTimeout(6500);
  await expect(notice).toBeVisible();
  await notice.hover();
  await dialog.getByRole("button", { name: "Close", exact: true }).focus();
  await page.waitForTimeout(6500);
  await expect(notice).toBeVisible();
  await shot("notice-kept-during-reading");
  await dialog.getByRole("button", { name: "Save", exact: true }).hover();
  await expect(notice).toHaveCount(0, { timeout: 8000 });
});

test("keeps a focused notice during a burst and reveals waiting notices on dismissal", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const detail = "Synthetic setup error from a failed offline task.";
  const server = await startServer({
    speechWaitForCancel: true,
    speechFailureAfterCancel: true,
    speechFailureMessage: detail,
  });
  await openApp(server);
  await page.getByRole("button", { name: /Run a model on this computer/ }).click();
  await page.setViewportSize({ width: 1024, height: 700 });
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const errors = dialog.locator(".toast--error").filter({ hasText: detail });
  for (let index = 0; index < 5; index++) {
    const started = await server.api.call("POST", "/api/speech/install", {});
    if (
      !started.body ||
      typeof started.body !== "object" ||
      !("jobId" in started.body) ||
      typeof started.body.jobId !== "string"
    )
      throw new Error("Synthetic speech job did not start");
    await server.api.call("POST", `/api/tasks/${started.body.jobId}/cancel`, {});
    if (index < 4) await expect(errors).toHaveCount(index + 1);
    if (index === 0) await dialog.getByRole("region", { name: "Task notifications" }).focus();
  }
  const host = dialog.getByRole("region", { name: "Task notifications" });
  await expect(host).toBeFocused();
  await expect(host.getByText(/1 notification waiting/)).toBeVisible();
  await expect(host.getByText(/1 error/)).toBeVisible();
  const waitingBox = await host.getByText(/1 notification waiting/).boundingBox();
  const hostBox = await host.boundingBox();
  if (!waitingBox || !hostBox) throw new Error("Waiting status or notification area has no box");
  expect(waitingBox.y).toBeGreaterThanOrEqual(hostBox.y);
  expect(waitingBox.y + waitingBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height);
  await expect(errors).toHaveCount(4);
  const first = await errors.first().elementHandle();
  if (!first) throw new Error("First error notice missing");
  await shot("notice-burst-waiting");
  await errors.first().getByRole("button", { name: "Dismiss message" }).focus();
  await page.keyboard.press("Enter");
  await expect(host).toBeFocused();
  await expect(host.getByText(/notification waiting/)).toHaveCount(0);
  expect(await first.evaluate((element) => element.isConnected)).toBe(false);
  await expect(errors).toHaveCount(4);
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});
