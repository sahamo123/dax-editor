// Measure the readable history metadata when a restorable state is hovered.
import { expect, test } from "./fixtures";

function luminance(color: string): number {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!channels || channels.length < 3 || (channels[3] !== undefined && channels[3] !== 1)) {
    throw new Error(`Expected an opaque color: ${color}`);
  }
  const [r = 0, g = 0, b = 0] = channels.slice(0, 3).map((value) => {
    const x = value / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("hovered restorable history text is readable", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await server.command("split", { at: 2 });
  await openApp(server);
  await page.getByRole("tab", { name: "History" }).click();
  const row = page.getByRole("button", { name: /Import interview\.mp4/ });
  await expect(row).toBeEnabled();
  await row.hover();
  const colors = await row.evaluate((element) => {
    const meta = element.querySelector(".state-row__meta");
    if (!meta) throw new Error("History metadata missing");
    return {
      foreground: getComputedStyle(meta).color,
      background: getComputedStyle(element).backgroundColor,
      opacity: getComputedStyle(element).opacity,
    };
  });
  const [high = 0, low = 0] = [luminance(colors.foreground), luminance(colors.background)].sort(
    (a, b) => b - a,
  );
  const ratio = (high + 0.05) / (low + 0.05);
  console.log("History hover contrast:", JSON.stringify({ ...colors, ratio }));
  expect(colors.opacity).toBe("1");
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("other-branch states are labelled and readable in normal and hover states", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  const server = await startServer();
  await server.importPaths([sampleVideo]);
  await server.command("split", { at: 2 });
  await server.command("undo");
  await server.command("add_overlay", { preset: "title-fade", start: 0 });
  await openApp(server);
  await page.getByRole("tab", { name: "History" }).click();
  const row = page.getByRole("button", { name: /Split at 2s/ });
  await expect(row).toBeEnabled();
  await expect(row).toContainText("Other branch");
  const measure = () =>
    row.evaluate((element) => {
      const meta = element.querySelector(".state-row__meta");
      if (!meta) throw new Error("History metadata missing");
      let current: Element | null = element;
      let background = "";
      while (current) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
          background = color;
          break;
        }
        current = current.parentElement;
      }
      return {
        foreground: getComputedStyle(meta).color,
        background,
        opacity: getComputedStyle(element).opacity,
      };
    });
  await page.mouse.move(0, 0);
  const normal = await measure();
  await row.hover();
  const hovered = await measure();
  for (const colors of [normal, hovered]) {
    const [high = 0, low = 0] = [luminance(colors.foreground), luminance(colors.background)].sort(
      (a, b) => b - a,
    );
    const ratio = (high + 0.05) / (low + 0.05);
    console.log("Other-branch contrast:", JSON.stringify({ ...colors, ratio }));
    expect(colors.opacity).toBe("1");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await shot("s01-06-history-branch-hover");
  await row.click();
  await expect
    .poll(async () => {
      const project = await server.project();
      const clips = project.timeline.tracks
        .filter((track) => track.kind === "video")
        .reduce((total, track) => total + track.clips.length, 0);
      return { clips, overlays: project.timeline.overlays.length };
    })
    .toEqual({ clips: 2, overlays: 0 });
  await expect(row).toHaveAttribute("aria-current", "step");
});
