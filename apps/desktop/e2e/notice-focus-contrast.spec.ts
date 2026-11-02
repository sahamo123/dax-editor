// Audit keyboard focus on a scrollable synthetic notification stack in a real browser.
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

function opaqueRgb(value: string): number[] {
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
  if (!match) throw new Error(`Expected an opaque RGB color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function contrast(foreground: string, background: string): number {
  const luminance = (rgb: number[]) => {
    const values = rgb.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
  };
  const levels = [luminance(opaqueRgb(foreground)), luminance(opaqueRgb(background))].sort(
    (a, b) => b - a,
  );
  return ((levels[0] ?? 0) + 0.05) / ((levels[1] ?? 0) + 0.05);
}

async function requireUnmodifiedAncestors(name: string, target: Locator): Promise<void> {
  const unsupported = await target.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.opacity !== "1" || style.filter !== "none" || style.mixBlendMode !== "normal") {
        return { opacity: style.opacity, filter: style.filter, blend: style.mixBlendMode };
      }
    }
    return null;
  });
  if (unsupported) throw new Error(`${name}: unsupported ancestor compositing`);
}

async function focusIndicator(name: string, target: Locator, background: Locator): Promise<void> {
  await expect(target).toBeFocused();
  await requireUnmodifiedAncestors(name, target);
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      keyboardVisible: element.matches(":focus-visible"),
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  const adjacent = await background.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity };
  });
  if (adjacent.image !== "none" || adjacent.opacity !== "1") {
    throw new Error(`${name}: unsupported adjacent background`);
  }
  const ratio = contrast(indicator.color, adjacent.color);
  console.info(JSON.stringify({ name, indicator, adjacent, ratio }));
  expect(indicator.keyboardVisible, `${name}: keyboard focus-visible`).toBe(true);
  expect(indicator.style, `${name}: outline style`).toBe("solid");
  expect(indicator.width, `${name}: outline width`).toBeGreaterThanOrEqual(1);
  expect(ratio, `${name}: outline against adjacent surface`).toBeGreaterThanOrEqual(3);
  const extent = Math.max(0, indicator.width + indicator.offset);
  expect(indicator.x - extent).toBeGreaterThanOrEqual(0);
  expect(indicator.y - extent).toBeGreaterThanOrEqual(0);
  expect(indicator.right + extent).toBeLessThanOrEqual(indicator.viewportWidth);
  expect(indicator.bottom + extent).toBeLessThanOrEqual(indicator.viewportHeight);
}

async function textContrast(name: string, target: Locator, background: Locator): Promise<void> {
  await requireUnmodifiedAncestors(name, target);
  const foreground = await target.evaluate((element) => getComputedStyle(element).color);
  const adjacent = await background.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity };
  });
  if (adjacent.image !== "none" || adjacent.opacity !== "1") {
    throw new Error(`${name}: unsupported adjacent background`);
  }
  const ratio = contrast(foreground, adjacent.color);
  console.info(JSON.stringify({ name, foreground, adjacent, ratio }));
  expect(ratio, `${name}: normal text against adjacent surface`).toBeGreaterThanOrEqual(4.5);
}

for (const viewport of [
  { width: 1024, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`notification focus remains visible in a scrollable dialog at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer({
      speechWaitForCancel: true,
      speechFailureAfterCancel: true,
      speechFailureMessage: "Synthetic setup failure. ".repeat(10),
    });
    await openApp(server);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
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
      if (index < 4) await expect(dialog.locator(".toast--error")).toHaveCount(index + 1);
    }
    const host = dialog.getByRole("region", { name: "Task notifications" });
    await expect(host.getByText(/1 notification waiting/)).toBeVisible();
    const waiting = host.getByText(/1 notification waiting/);
    await textContrast(`waiting-${viewport.width}`, waiting, waiting.locator("xpath=.."));
    expect(await host.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Tab");
    await focusIndicator(`region-${viewport.width}`, host, dialog);
    await shot(`notice-region-keyboard-focus-${viewport.width}`);
    await page.keyboard.press("Tab");
    const dismiss = host.getByRole("button", { name: "Dismiss message" }).first();
    await focusIndicator(`dismiss-${viewport.width}`, dismiss, dismiss.locator("xpath=.."));
    const bounds = await dismiss.boundingBox();
    const hostBounds = await host.boundingBox();
    const outlineExtent = await dismiss.evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth);
    });
    if (!bounds || !hostBounds)
      throw new Error("Focused control or notification region has no box");
    expect(bounds.x - outlineExtent).toBeGreaterThanOrEqual(hostBounds.x);
    expect(bounds.y - outlineExtent).toBeGreaterThanOrEqual(hostBounds.y);
    expect(bounds.x + bounds.width + outlineExtent).toBeLessThanOrEqual(
      hostBounds.x + hostBounds.width,
    );
    expect(bounds.y + bounds.height + outlineExtent).toBeLessThanOrEqual(
      hostBounds.y + hostBounds.height,
    );
    await shot(`notice-dismiss-keyboard-focus-${viewport.width}`);
    await page.keyboard.press("Enter");
    await expect(host).toBeFocused();
    await expect(host.getByText(/notification waiting/)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });
}

test("overflow warning and its keyboard control remain readable and reachable", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 700 });
  const server = await startServer({
    speechWaitForCancel: true,
    speechFailureAfterCancel: true,
    speechFailureMessage: "Synthetic setup failure.",
  });
  await openApp(server);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  for (let index = 0; index < 37; index++) {
    const started = await server.api.call("POST", "/api/speech/install", {});
    if (
      !started.body ||
      typeof started.body !== "object" ||
      !("jobId" in started.body) ||
      typeof started.body.jobId !== "string"
    )
      throw new Error("Synthetic speech job did not start");
    await server.api.call("POST", `/api/tasks/${started.body.jobId}/cancel`, {});
    if (index < 4) {
      await expect(dialog.locator(".toast--error")).toHaveCount(index + 1);
      if (index === 0) await dialog.getByRole("region", { name: "Task notifications" }).focus();
    } else if (index < 36) {
      const count = index - 3;
      await expect(dialog.getByText(new RegExp(`^${count} notifications? waiting`))).toBeVisible();
    }
  }
  const host = dialog.getByRole("region", { name: "Task notifications" });
  const warning = host.getByText(/1 additional notification could not be retained/);
  await expect(warning).toBeVisible();
  await textContrast("overflow-warning", warning, warning.locator("xpath=.."));
  await dialog.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(host).toBeFocused();
  await page.keyboard.press("Tab");
  const dismiss = host.getByRole("button", { name: "Dismiss overflow warning" });
  await focusIndicator("overflow-dismiss", dismiss, dismiss.locator("xpath=.."));
  await shot("notice-overflow-keyboard-focus");
  await page.keyboard.press("Enter");
  await expect(host).toBeFocused();
  await expect(warning).toHaveCount(0);
  await expect(host.getByText(/^32 notifications waiting/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});
