// Measure setup and task-error text contrast on their actual composed surfaces.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
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
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function over(foreground: Color, background: Color): Color {
  if (background.a !== 1) throw new Error("Expected an opaque background");
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function luminance(value: Color): number {
  if (value.a !== 1) throw new Error("Expected an opaque color");
  const channel = (x: number) => {
    const n = x / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(value.r) + 0.7152 * channel(value.g) + 0.0722 * channel(value.b);
}

function contrast(first: Color, second: Color): number {
  const [high = 0, low = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

test("setup heading and helper text remain legible across the gradient", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await openApp(server);
  const setup = page.locator(".empty");
  const heading = page.getByRole("heading", { name: "Drop a video here or click Import" });
  const hint = setup.locator(".empty__hint");
  await expect(heading).toBeVisible();
  await expect(hint).toBeVisible();
  const data = await setup.evaluate((element) => {
    const title = element.querySelector(".empty__title");
    const helper = element.querySelector(".empty__hint");
    if (!title || !helper) throw new Error("Setup text is missing");
    const surface = getComputedStyle(element);
    const titleStyle = getComputedStyle(title);
    const helperStyle = getComputedStyle(helper);
    return {
      background: surface.backgroundColor,
      image: surface.backgroundImage,
      opacity: surface.opacity,
      heading: titleStyle.color,
      headingSize: titleStyle.fontSize,
      headingWeight: titleStyle.fontWeight,
      hint: helperStyle.color,
    };
  });
  expect(data.opacity).toBe("1");
  expect(Number.parseFloat(data.headingSize)).toBeGreaterThanOrEqual(18.667);
  expect(Number.parseInt(data.headingWeight, 10)).toBeGreaterThanOrEqual(700);
  expect(data.image).toMatch(
    /^radial-gradient\([^,]+,\s*rgba?\([^)]*\)(?:\s+[\d.]+%)?,\s*(?:rgba?\([^)]*\)|transparent)(?:\s+[\d.]+%)?\)(?:,\s*none)*$/,
  );
  const stops = [...data.image.matchAll(/rgba?\([^)]*\)/g)].map((match) => color(match[0]));
  const visibleStops = stops.filter((stop) => stop.a > 0);
  expect(visibleStops).toHaveLength(1);
  const overlay = visibleStops[0];
  if (!overlay) throw new Error("The gradient color is missing");
  const base = color(data.background);
  const foreground = color(data.heading);
  const helper = color(data.hint);
  expect(base.a).toBe(1);
  // The strongest gradient stop is the lightest possible surface, producing the lowest
  // contrast for these lighter foregrounds. Reject changed colors that break that bound.
  const worst = over(overlay, base);
  for (const component of ["r", "g", "b"] as const) {
    expect(overlay[component]).toBeGreaterThanOrEqual(base[component]);
    expect(foreground[component]).toBeGreaterThanOrEqual(worst[component]);
    expect(helper[component]).toBeGreaterThanOrEqual(worst[component]);
  }
  const headingRatio = contrast(foreground, worst);
  const hintRatio = contrast(helper, worst);
  console.log("SETUP_CONTRAST", JSON.stringify({ headingRatio, hintRatio, worst }));
  expect(headingRatio).toBeGreaterThanOrEqual(3);
  expect(hintRatio).toBeGreaterThanOrEqual(4.5);
  await shot("s01-06-setup-contrast");
});

test("failed-task message meets contrast against its composed background", async ({
  page,
  startServer,
  openApp,
  shot,
}) => {
  const server = await startServer();
  await server.stop();
  await writeFile(
    join(server.dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "failed-export",
        title: "Export draft",
        kind: "export",
        mode: "edit",
        status: "failed",
        createdAt: 1,
        error: "Synthetic output unavailable",
      },
    ]),
  );
  await server.start();
  await openApp(server);
  await page.getByLabel("Work status").click();
  const message = page.getByRole("banner").getByText("Synthetic output unavailable");
  await expect(message).toBeVisible();
  const data = await message.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    const backgrounds: string[] = [];
    let current: Element | null = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.opacity !== "1" || style.backgroundImage !== "none")
        throw new Error("Unsupported opacity or background image");
      backgrounds.push(style.backgroundColor);
      if (style.backgroundColor.startsWith("rgb(")) break;
      current = current.parentElement;
    }
    return { foreground, backgrounds };
  });
  const layers = data.backgrounds.map(color);
  const base = layers.pop();
  if (base?.a !== 1) throw new Error("No opaque task-message background");
  const composed = layers.reverse().reduce((background, layer) => over(layer, background), base);
  const ratio = contrast(color(data.foreground), composed);
  console.log(
    "TASK_ERROR_CONTRAST",
    JSON.stringify({ ratio, foreground: data.foreground, composed }),
  );
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await shot("s01-06-task-error-contrast");
});
