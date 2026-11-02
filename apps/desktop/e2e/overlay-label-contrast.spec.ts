// Timeline overlay labels must remain readable on every category color.
import { expect, test } from "./fixtures";

function rgb(value: string): number[] {
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
  if (!match) throw new Error(`Expected an opaque RGB color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(channels: number[]): number {
  const linear = (channel: number) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(channels[0] ?? 0) +
    0.7152 * linear(channels[1] ?? 0) +
    0.0722 * linear(channels[2] ?? 0)
  );
}

function contrast(foreground: string, background: string, opacity = 1): number {
  const back = rgb(background);
  const front = rgb(foreground).map(
    (channel, index) => channel * opacity + (back[index] ?? 0) * (1 - opacity),
  );
  const levels = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return ((levels[0] ?? 0) + 0.05) / ((levels[1] ?? 0) + 0.05);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1000, height: 700 },
]) {
  test(`overlay labels are readable before and after keyboard selection at ${viewport.width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    const samples = [
      { preset: "title-fade", category: "title", text: "Title" },
      { preset: "lower-third-slide", category: "lower-third", text: "Lower" },
      { preset: "caption-bottom", category: "caption", text: "Caption" },
      { preset: "callout-slide-up", category: "callout", text: "Callout" },
    ];
    for (const sample of samples) {
      const result = await server.command("add_overlay", {
        preset: sample.preset,
        text: sample.text,
        start: 0,
        duration: 3,
      });
      expect(result.ok).toBe(true);
    }
    const project = await server.project();
    await openApp(server);
    const ratios: { category: string; state: string; ratio: number }[] = [];
    for (const sample of samples) {
      const block = page.locator(`.dx-ovl--${sample.category}`);
      const label = block.locator(".dx-ovl-label");
      await expect(label).toBeVisible();
      const measure = async (state: string) => {
        const colors = await label.evaluate((element) => {
          const parent = element.closest(".dx-ovl");
          if (!parent) throw new Error("Overlay block missing");
          const glyph = element.querySelector(".dx-ovl-glyph");
          if (!glyph) throw new Error("Overlay glyph missing");
          const glyphStyle = getComputedStyle(glyph);
          return {
            foreground: getComputedStyle(element).color,
            background: getComputedStyle(parent).backgroundColor,
            glyph: glyphStyle.color,
            glyphOpacity: Number(glyphStyle.opacity),
          };
        });
        ratios.push({
          category: sample.category,
          state,
          ratio: contrast(colors.foreground, colors.background),
        });
        ratios.push({
          category: `${sample.category} glyph`,
          state,
          ratio: contrast(colors.glyph, colors.background, colors.glyphOpacity),
        });
      };
      await measure("normal");
      await block.focus();
      await page.keyboard.press("Enter");
      await expect(block).toHaveAttribute("aria-selected", "true");
      await measure("selected");
    }
    // Legacy/custom preset IDs use the base timeline color; simulate only that CSS class, then restore it.
    const custom = await page.locator(".dx-ovl--title").evaluate((element) => {
      const original = element.getAttribute("class") ?? "";
      try {
        element.setAttribute("class", "dx-ovl dx-ovl--custom");
        const label = element.querySelector(".dx-ovl-label");
        if (!label) throw new Error("Overlay label missing");
        return {
          foreground: getComputedStyle(label).color,
          background: getComputedStyle(element).backgroundColor,
        };
      } finally {
        element.setAttribute("class", original);
      }
    });
    ratios.push({
      category: "custom",
      state: "normal",
      ratio: contrast(custom.foreground, custom.background),
    });
    await shot(`overlay-label-contrast-${viewport.width}`);
    console.log(JSON.stringify(ratios));
    expect(Math.min(...ratios.map((item) => item.ratio))).toBeGreaterThanOrEqual(4.5);
    expect(await server.project()).toEqual(project);
  });
}
