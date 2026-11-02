// Audit visible editing toolbar icons and toggle states against their composited surfaces.
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

async function measureIcon(name: string, button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  const data = await button.evaluate((element) => {
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
    const svg = element.querySelector("svg");
    if (!svg) throw new Error("Toolbar icon missing");
    const pieces = [...svg.querySelectorAll("path, rect, circle, line, polyline, polygon")].flatMap(
      (piece) => {
        const style = getComputedStyle(piece);
        if (style.opacity !== "1" || style.fillOpacity !== "1" || style.strokeOpacity !== "1") {
          throw new Error("Unsupported icon opacity");
        }
        return [style.fill, style.stroke].filter((value) => value !== "none");
      },
    );
    return { layers, pieces, pressed: element.getAttribute("aria-pressed") };
  });
  if (!data.pieces.length) throw new Error(`${name}: no painted SVG pieces found`);
  if (
    data.layers.some(
      (layer) => layer.opacity !== "1" || layer.filter !== "none" || layer.blend !== "normal",
    )
  ) {
    throw new Error(`${name}: unsupported ancestor compositing`);
  }
  let background: Color = { r: 0, g: 0, b: 0, a: 0 };
  for (const layer of data.layers) {
    if (background.a >= 1) break;
    if (layer.image !== "none") throw new Error(`${name}: unsupported gradient or image`);
    background = over(background, color(layer.color));
  }
  if (background.a < 0.999) throw new Error(`${name}: no opaque background`);
  const ratios = data.pieces.map((piece) => {
    const painted = color(piece);
    const visible = over(painted, background);
    const levels = [luminance(visible), luminance(background)].sort((a, b) => b - a);
    return ((levels[0] ?? 0) + 0.05) / ((levels[1] ?? 0) + 0.05);
  });
  const minimum = Math.min(...ratios);
  console.info(
    JSON.stringify({ name, pressed: data.pressed, background, pieces: data.pieces, minimum }),
  );
  expect(minimum, `${name}: icon against its adjacent surface`).toBeGreaterThanOrEqual(3);
}

for (const viewport of [
  { width: 1000, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`essential toolbar icons and toggle states at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    await openApp(server);
    const toolbar = page.getByRole("toolbar", { name: "Editor" });
    const clip = page.getByRole("listbox", { name: "Timeline" }).getByTestId("clip").first();
    await clip.focus();
    await page.keyboard.press("Enter");
    const next = toolbar.getByRole("button", { name: "Next frame", exact: true });
    await next.click();
    await next.click();
    await next.click();
    const controls = [
      "Split at playhead",
      "Delete selected",
      "Go to start",
      "Previous frame",
      "Play",
      "Next frame",
      "Go to end",
      "Zoom out",
      "Zoom in",
      "Fit timeline to window",
    ];
    for (const name of controls) {
      const button = toolbar.getByRole("button", { name, exact: true });
      await measureIcon(`${viewport.width} ${name} normal`, button);
      await button.hover();
      await measureIcon(`${viewport.width} ${name} hover`, button);
    }
    for (const name of ["Loop", "Snapping"]) {
      const button = toolbar.getByRole("button", { name, exact: true });
      const before = await button.getAttribute("aria-pressed");
      expect(["true", "false"]).toContain(before);
      await measureIcon(`${viewport.width} ${name} initial`, button);
      await button.focus();
      await page.keyboard.press("Space");
      await expect(button).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
      await expect(button).toBeFocused();
      await measureIcon(`${viewport.width} ${name} toggled`, button);
      await page.keyboard.press("Space");
      await expect(button).toHaveAttribute("aria-pressed", before ?? "");
    }
    const mute = toolbar.getByRole("button", { name: "Mute preview", exact: true });
    await measureIcon(`${viewport.width} Mute initial`, mute);
    await mute.focus();
    await page.keyboard.press("Space");
    const unmute = toolbar.getByRole("button", { name: "Unmute preview", exact: true });
    await expect(unmute).toHaveAttribute("aria-pressed", "true");
    await expect(unmute).toBeFocused();
    await measureIcon(`${viewport.width} Mute toggled`, unmute);
    await shot(`toolbar-icons-${viewport.width}`);
  });
}
