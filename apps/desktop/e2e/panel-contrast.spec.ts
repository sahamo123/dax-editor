// Measure representative contextual text against its rendered, composited background.

import type { Locator } from "@playwright/test";
import { chatInput, expect, test } from "./fixtures";

type Color = { r: number; g: number; b: number; a: number };

function color(value: string): Color {
  const match = value.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\s*\)$/,
  );
  if (!match) throw new Error(`Unsupported computed color: ${value}`);
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Number(match[4] ?? 1),
  };
}

function over(top: Color, bottom: Color): Color {
  const a = top.a + bottom.a * (1 - top.a);
  if (!a) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (front: number, back: number) =>
    (front * top.a + back * bottom.a * (1 - top.a)) / a;
  return {
    r: channel(top.r, bottom.r),
    g: channel(top.g, bottom.g),
    b: channel(top.b, bottom.b),
    a,
  };
}

function luminance(value: Color): number {
  const linear = (n: number) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(value.r) + 0.7152 * linear(value.g) + 0.0722 * linear(value.b);
}

async function measure(label: string, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const data = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    const layers: { color: string; image: string; opacity: string }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      layers.push({
        color: style.backgroundColor,
        image: style.backgroundImage,
        opacity: style.opacity,
      });
    }
    return { foreground, layers };
  });
  let background: Color = { r: 0, g: 0, b: 0, a: 0 };
  if (data.layers.some((layer) => layer.opacity !== "1")) {
    throw new Error(`${label}: opacity requires a separate measurement`);
  }
  for (const layer of data.layers) {
    if (background.a >= 1) break;
    if (layer.image !== "none")
      throw new Error(`${label}: image or gradient requires a separate measurement`);
    background = over(background, color(layer.color));
  }
  if (background.a < 0.999) throw new Error(`${label}: no opaque background was found`);
  const foreground = color(data.foreground);
  if (foreground.a !== 1)
    throw new Error(`${label}: translucent foreground requires a separate measurement`);
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const ratio = ((levels[0] ?? 0) + 0.05) / ((levels[1] ?? 0) + 0.05);
  console.log(`${label}: ${ratio.toFixed(3)}:1`);
  expect(ratio, label).toBeGreaterThanOrEqual(4.5);
}

test("media metadata remains readable on its actual card", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("tab", { name: "Media" }).click();
  await measure("media metadata", page.locator(".media-card__meta").first());
  await measure("media timeline badge", page.locator(".media-card .badge").first());
  await shot("s01-06-media-context-contrast");
});

test("settings helper text remains readable", async ({ page, startServer, openApp, shot }) => {
  const server = await startServer();
  await openApp(server);
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: /OpenAI-compatible API/ }).click();
  const hints = dialog.locator(".field__hint");
  const visible: Locator[] = [];
  for (const hint of await hints.all()) if (await hint.isVisible()) visible.push(hint);
  expect(visible.length).toBeGreaterThan(0);
  for (const [index, hint] of visible.entries()) await measure(`settings hint ${index + 1}`, hint);
  await shot("s01-06-settings-context-contrast");
});

test("assistant tool details and hover summary remain readable", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await chatInput(page).fill("Add a title");
  await chatInput(page).press("Enter");
  await expect(page.getByRole("button", { name: "Undo this change" })).toBeVisible();
  const tool = page.locator(".tool").filter({ hasText: "Add overlay" }).first();
  const row = tool.locator(".tool__row");
  await measure("tool summary normal", tool.locator(".tool__summary"));
  await row.hover();
  await measure("tool summary hover", tool.locator(".tool__summary"));
  await row.click();
  const label = tool.locator(".tool__label").first();
  await measure("tool detail label", label);
  await shot("s01-06-tool-context-contrast");
});

test("clip inspector labels, values and actions remain readable", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("region", { name: "Timeline" }).getByTestId("clip").first().click();
  const inspector = page.getByTestId("inspector-clip");
  await measure("inspector file label", inspector.locator(".dx-facts dt").first());
  await measure("inspector file value", inspector.locator(".dx-facts dd").first());
  await measure("inspector source-in label", inspector.locator(".dx-field-label").first());
  await measure("inspector source-in value", page.getByTestId("clip-source-in"));
  await measure("inspector source-in unit", inspector.locator(".dx-unit").first());
  await measure(
    "inspector split action",
    inspector.getByRole("button", { name: "Split at playhead" }),
  );
  await measure("inspector delete action", inspector.getByRole("button", { name: "Delete clip" }));
  await shot("s01-06-inspector-contrast");
});

test("export dialog labels, values and actions remain readable", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  await page.getByRole("banner").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await measure("export dialog heading", dialog.getByRole("heading", { name: "Export video" }));
  await measure("export save-as label", dialog.locator(".field__label"));
  await dialog.getByLabel("Save as").press("End");
  await measure("export save-as value", dialog.getByLabel("Save as"));
  await measure("export hint", dialog.locator("#export-hint"));
  await measure("export overwrite label", dialog.locator(".check"));
  await measure("export cancel action", dialog.getByRole("button", { name: "Cancel" }));
  const exportButton = dialog.getByRole("button", { name: "Export", exact: true });
  await measure("export dialog action normal", exportButton);
  await exportButton.hover();
  await exportButton.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await measure("export dialog action hover", exportButton);
  await shot("s01-06-export-dialog-contrast");
});
