// Measure primary-button text contrast from rendered normal and hover styles.
import { expect, test } from "./fixtures";

function luminance(value: string): number {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!channels || channels.length < 3 || (channels[3] !== undefined && channels[3] !== 1))
    throw new Error(`Expected an opaque CSS color: ${value}`);
  const components = channels.slice(0, 3);
  const [red, green, blue] = components.map((component) => {
    const channel = component / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  if (red === undefined || green === undefined || blue === undefined)
    throw new Error(`Incomplete CSS color: ${value}`);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const [lighter, darker] = levels;
  if (lighter === undefined || darker === undefined) throw new Error("Missing color luminance");
  return (lighter + 0.05) / (darker + 0.05);
}

test("primary export text meets contrast in normal and hover states", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await openApp(server);
  const button = page.getByRole("banner").getByRole("button", { name: "Export", exact: true });
  const colors = () =>
    button.evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
  await page.mouse.move(0, 0);
  const normal = await colors();
  await button.hover();
  // Wait for CSS transitions to settle rather than sampling an intermediate hover color.
  await button.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const hovered = await colors();
  const normalRatio = contrast(normal.foreground, normal.background);
  const hoverRatio = contrast(hovered.foreground, hovered.background);
  await test.info().attach("primary-contrast", {
    body: JSON.stringify({ normal, hovered, normalRatio, hoverRatio }),
    contentType: "application/json",
  });
  expect(normalRatio).toBeGreaterThanOrEqual(4.5);
  expect(hoverRatio).toBeGreaterThanOrEqual(4.5);
  expect(hovered.background).not.toBe(normal.background);
  await shot("s01-06-primary-hover");
});
