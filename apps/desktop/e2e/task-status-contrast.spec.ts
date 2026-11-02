// Verify task-state text on both queue surfaces against their rendered backgrounds.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

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
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 });
  const data = await locator.evaluate((element) => {
    const textStyle = getComputedStyle(element);
    const foreground = textStyle.color;
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const unobscured = hit !== null && element.contains(hit);
    const layers: {
      color: string;
      image: string;
      opacity: string;
      filter: string;
      blend: string;
    }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      layers.push({
        color: style.backgroundColor,
        image: style.backgroundImage,
        opacity: style.opacity,
        filter: style.filter,
        blend: style.mixBlendMode,
      });
    }
    return { foreground, layers, unobscured, textShadow: textStyle.textShadow };
  });
  let background: Color = { r: 0, g: 0, b: 0, a: 0 };
  if (!data.unobscured) throw new Error(`${label}: text is obscured at its center`);
  if (
    data.textShadow !== "none" ||
    data.layers.some(
      (layer) => layer.opacity !== "1" || layer.filter !== "none" || layer.blend !== "normal",
    )
  ) {
    throw new Error(`${label}: unsupported compositing requires a separate measurement`);
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

for (const viewport of [
  { width: 1000, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`task state text is legible on both surfaces at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer({ aiReady: true });
    await server.importPaths([sampleVideo]);
    await server.stop();
    await writeFile(
      join(server.dataDir, "tasks.json"),
      JSON.stringify([
        {
          id: "past-complete",
          title: "Completed example",
          kind: "export",
          mode: "edit",
          status: "completed",
          createdAt: 1,
        },
        {
          id: "past-failed",
          title: "Failed example",
          kind: "export",
          mode: "edit",
          status: "failed",
          createdAt: 2,
          error: "Synthetic error",
        },
        {
          id: "past-cancelled",
          title: "Cancelled example",
          kind: "chat",
          mode: "edit",
          status: "cancelled",
          createdAt: 3,
        },
        {
          id: "past-interrupted",
          title: "Interrupted example",
          kind: "transcribe",
          mode: "edit",
          status: "interrupted",
          createdAt: 4,
        },
      ]),
    );
    await server.start();
    expect((await server.api.call("POST", "/api/local-model/start", {})).status).toBe(202);
    await expect
      .poll(
        async () =>
          (await server.api.providers()).find((provider) => provider.kind === "local")?.available,
      )
      .toBe(true);
    await openApp(server);
    if (viewport.width < 1180) await page.getByRole("button", { name: "Assistant view" }).click();
    const input = page.getByLabel("Message to the assistant");
    await input.fill("work slowly active");
    await input.press("Enter");
    const chatQueue = page
      .getByRole("complementary", { name: "Chat with the assistant" })
      .getByRole("list", { name: "Task queue" });
    await expect(
      chatQueue
        .locator("li")
        .filter({ hasText: "work slowly active" })
        .getByText("running", { exact: true }),
    ).toBeVisible();
    await input.fill("work slowly queued");
    await input.press("Enter");
    await expect(
      chatQueue
        .locator("li")
        .filter({ hasText: "work slowly queued" })
        .getByText("queued", { exact: true }),
    ).toBeVisible();
    const work = page.getByLabel("Work status");
    const workQueue = page.getByRole("banner").getByRole("list", { name: "Task queue" });
    const states = [
      ["work slowly active", "running"],
      ["work slowly queued", "queued"],
      ["Completed example", "completed"],
      ["Failed example", "failed"],
      ["Cancelled example", "cancelled"],
      ["Interrupted example", "interrupted"],
    ] as const;
    for (const [surface, queue] of [
      ["chat", chatQueue],
      ["work", workQueue],
    ] as const) {
      if (surface === "work") await work.click();
      for (const [title, status] of states) {
        const row = queue.locator("li").filter({ hasText: title });
        const state = row.getByText(status, { exact: true });
        await state.scrollIntoViewIfNeeded();
        await expect(state).toBeInViewport({ ratio: 1 });
        await measure(`${viewport.width} ${surface} ${status} status`, state);
        await measure(
          `${viewport.width} ${surface} ${status} title`,
          row.getByText(title, { exact: true }),
        );
        await measure(`${viewport.width} ${surface} ${status} operation`, row.locator("strong"));
        await measure(
          `${viewport.width} ${surface} ${status} metadata`,
          row.locator("small").last(),
        );
      }
      await shot(`task-status-contrast-${surface}-${viewport.width}`);
    }
    await work.click();
    await chatQueue
      .locator("li")
      .filter({ hasText: "work slowly queued" })
      .getByRole("button", { name: /Cancel task: work slowly queued/ })
      .click();
    await chatQueue
      .locator("li")
      .filter({ hasText: "work slowly active" })
      .getByRole("button", { name: /Cancel task: work slowly active/ })
      .click();
  });
}
