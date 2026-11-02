// Media-card controls must stay readable and usable when the drawer changes width.
import { expect, test } from "./fixtures";

for (const width of [1440, 1000]) {
  test(`media card actions fit and work at ${width}px`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
    shot,
  }) => {
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    const initial = await server.project();
    const asset = Object.values(initial.assets)[0];
    if (!asset) throw new Error("Synthetic media was not imported");
    const initialClips = initial.timeline.tracks.flatMap((track) => track.clips).length;
    await page.setViewportSize({ width, height: 900 });
    await openApp(server);
    if (width === 1000) await page.getByRole("button", { name: "Show side panel" }).click();
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    const card = page.locator(".media-card").first();
    const add = card.getByRole("button", { name: /Add .* to the timeline/ });
    const relink = card.getByRole("button", { name: /Relink / });
    for (const button of [add, relink]) {
      await expect(button).toBeVisible();
      const dimensions = await button.evaluate((node) => {
        const card = node.closest(".media-card");
        if (!card) throw new Error("Media card missing");
        const box = node.getBoundingClientRect();
        const outer = card.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(node);
        const label = text.getBoundingClientRect();
        return {
          inside: box.left >= outer.left && box.right <= outer.right && box.bottom <= outer.bottom,
          textInside: label.left >= box.left && label.right <= box.right,
          overflowing: node.scrollWidth > node.clientWidth,
        };
      });
      expect(dimensions).toEqual({ inside: true, textInside: true, overflowing: false });
    }
    await add.focus();
    await page.keyboard.press("Tab");
    await expect(relink).toBeFocused();
    expect(await relink.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
    await shot(`s01-06-media-actions-${width}`);
    await add.click();
    await expect
      .poll(
        async () => (await server.project()).timeline.tracks.flatMap((track) => track.clips).length,
      )
      .toBe(initialClips + 1);
    const chooser = page.waitForEvent("filechooser");
    await relink.focus();
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(sampleVideo);
    await expect
      .poll(async () => (await server.project()).assets[asset.id]?.path)
      .not.toBe(asset.path);
  });
}
