// End-to-end proof of the manual editing gestures against the mock server (real @dax/core Session underneath):
// drag-reorder, trim, split, ripple delete, undo, zoom, preset drag and drop, overlay move and resize, inspector.

import { expect, test } from "@playwright/test";
import { centre, command, dragMouse, openHarness, SHOTS, snapshot, zoomOf } from "./helpers";

test.describe("timeline editing", () => {
  test("drag a clip to reorder it (move_clip)", async ({ page }) => {
    await openHarness(page);
    const before = await snapshot(page);
    const ids = before.clips.map((c) => c.id);
    const from = await centre(page, "clip", 0);
    const to = { x: from.x + 560, y: from.y };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    // Mid-drag: a drop slot is shown and the block follows the pointer.
    await expect(page.locator(".dx-slot")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-reorder-drag.png` });
    await page.mouse.up();
    await expect
      .poll(async () => (await snapshot(page)).clips.map((c) => c.id))
      .toEqual([ids[1], ids[0], ids[2]]);
    const after = await snapshot(page);
    expect(after.clips.map((c) => c.start)).toEqual([0, 6, 12]);
    await expect(page.getByTestId("clip").first()).toHaveAttribute("data-clip-id", ids[1] ?? "");
  });

  test("drag the end handle to trim (trim_clip) with live feedback", async ({ page }) => {
    await openHarness(page);
    const z = await zoomOf(page);
    const handle = await centre(page, "trim-end", 1);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 2 * z, handle.y, { steps: 10 });
    // Live feedback before release: the third clip has already slid left in the UI.
    await expect
      .poll(async () => Number(await page.getByTestId("clip").nth(2).getAttribute("data-start")))
      .toBeCloseTo(10, 0);
    await page.screenshot({ path: `${SHOTS}/03-trim-drag.png` });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const c = (await snapshot(page)).clips[1];
        return c ? c.out - c.in : 0;
      })
      .toBeCloseTo(4, 0);
    const after = await snapshot(page);
    expect(after.clips[2]?.start).toBeCloseTo(10, 0);
  });

  test("drag the start handle to trim the beginning", async ({ page }) => {
    await openHarness(page);
    const z = await zoomOf(page);
    const handle = await centre(page, "trim-start", 0);
    await dragMouse(page, handle, { x: handle.x + 1.5 * z, y: handle.y });
    await expect.poll(async () => (await snapshot(page)).clips[0]?.in ?? 0).toBeGreaterThan(1.2);
    const c = (await snapshot(page)).clips[0];
    expect(c?.out).toBeCloseTo(6, 1);
  });

  test("split at the playhead with S, ripple delete with Delete, undo with Ctrl+Z", async ({
    page,
  }) => {
    await openHarness(page);
    const z = await zoomOf(page);
    const ruler = await page.getByTestId("ruler-hit").boundingBox();
    if (!ruler) throw new Error("no ruler");
    // Put the playhead at 3.0 s by clicking the ruler.
    await page.mouse.click(64 + 3 * z, ruler.y + 12);
    await expect
      .poll(async () => Number(await page.getByTestId("playhead").getAttribute("data-time")))
      .toBeCloseTo(3, 1);
    await page.keyboard.press("s");
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(4);
    const split = await snapshot(page);
    expect(split.clips[0]?.out).toBeCloseTo(3, 1);
    expect(split.clips[1]?.in).toBeCloseTo(3, 1);

    // Select the first half and ripple delete it.
    await page
      .getByTestId("clip")
      .first()
      .click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId("clip").first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(3);
    const deleted = await snapshot(page);
    expect(deleted.clips[0]?.start).toBe(0);
    expect(deleted.clips.reduce((n, c) => n + (c.out - c.in), 0)).toBeCloseTo(15, 1);

    // Undo brings the deleted half back.
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(4);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(3);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(4);
    await page.screenshot({ path: `${SHOTS}/04-after-undo.png` });
  });

  test("toolbar buttons: undo, redo, split and delete", async ({ page }) => {
    await openHarness(page);
    await expect(page.getByTestId("undo")).toBeDisabled();
    await page
      .getByTestId("clip")
      .nth(1)
      .click({ position: { x: 30, y: 20 } });
    await page.getByTestId("delete").click();
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(2);
    await expect(page.getByTestId("undo")).toBeEnabled();
    await page.getByTestId("undo").click();
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(3);
    await expect(page.getByTestId("redo")).toBeEnabled();
    await page.getByTestId("redo").click();
    await expect.poll(async () => (await snapshot(page)).clips.length).toBe(2);
  });

  test("zoom with buttons, keys and Ctrl+wheel", async ({ page }) => {
    await openHarness(page);
    const z0 = await zoomOf(page);
    await page.getByTestId("zoom-in").click();
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(z0 * 1.3);
    const z1 = await zoomOf(page);
    await page.getByTestId("zoom-out").click();
    await expect.poll(() => zoomOf(page)).toBeLessThan(z1 * 0.8);
    const z2 = await zoomOf(page);
    await page.keyboard.press("=");
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(z2 * 1.3);
    const z3 = await zoomOf(page);
    const box = await page.getByTestId("timeline-scroll").boundingBox();
    if (!box) throw new Error("no timeline");
    await page.mouse.move(box.x + 400, box.y + 120);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(z3 * 1.2);
    await page.getByTestId("zoom-fit").click();
    // Fit: the whole 18 s timeline fits the visible width.
    await expect.poll(() => zoomOf(page)).toBeLessThan(80);
    await page.screenshot({ path: `${SHOTS}/05-zoom-fit.png` });
  });

  test("fade handle sets a fade (set_fades) and the volume line sets volume (set_volume)", async ({
    page,
  }) => {
    await openHarness(page);
    const z = await zoomOf(page);
    await page.getByTestId("clip").first().hover();
    const h = await centre(page, "fade-in-handle", 0);
    await dragMouse(page, h, { x: h.x + 1 * z, y: h.y });
    await expect.poll(async () => (await snapshot(page)).clips[0]?.fadeIn ?? 0).toBeCloseTo(1, 0);
    await page.getByTestId("clip").first().hover();
    const v = await centre(page, "volume-line", 0);
    await dragMouse(page, v, { x: v.x, y: v.y + 14 }, 6);
    await expect.poll(async () => (await snapshot(page)).clips[0]?.volume ?? 1).toBeLessThan(0.95);
    await page.screenshot({ path: `${SHOTS}/06-fade-volume.png` });
  });
});

test.describe("overlays and presets", () => {
  test("drag a preset onto the timeline to add it at the drop time (add_overlay)", async ({
    page,
  }) => {
    await openHarness(page);
    const z = await zoomOf(page);
    const preset = page.locator('[data-preset-id="lower-third-slide"]');
    await preset.scrollIntoViewIfNeeded();
    const box = await preset.boundingBox();
    const lane = await page.locator(".dx-lane-overlay").first().boundingBox();
    if (!box || !lane) throw new Error("layout not ready");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 100, from.y + 40, { steps: 5 });
    const dropX = 64 + 2.5 * z;
    await page.mouse.move(dropX, lane.y + lane.height / 2, { steps: 12 });
    await expect(page.getByTestId("drop-ghost")).toBeVisible();
    await expect(page.getByTestId("drag-ghost")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/07-preset-drag.png` });
    await page.mouse.up();
    await expect.poll(async () => (await snapshot(page)).overlays.length).toBe(1);
    const o = (await snapshot(page)).overlays[0];
    expect(o?.start).toBeGreaterThan(2.3);
    expect(o?.start).toBeLessThan(2.7);
    await expect(page.getByTestId("overlay")).toHaveCount(1);
    await expect(page.getByTestId("overlay")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("overlay-text")).toHaveValue("Speaker name");
    await page.screenshot({ path: `${SHOTS}/08-overlay-added.png` });
  });

  test("click a preset to add it at the playhead", async ({ page }) => {
    await openHarness(page);
    await page.locator('[data-preset-id="title-pop"]').click();
    await expect.poll(async () => (await snapshot(page)).overlays.length).toBe(1);
    expect((await snapshot(page)).overlays[0]?.start).toBe(0);
  });

  test("drag an overlay to move it, and drag its edge to resize it", async ({ page }) => {
    await openHarness(page);
    await command(page, "add_overlay", { preset: "title-fade", start: 1, duration: 3 });
    await page.reload();
    await expect(page.getByTestId("overlay")).toHaveCount(1);
    const z = await zoomOf(page);
    const body = await centre(page, "overlay", 0);
    await dragMouse(page, body, { x: body.x + 2 * z, y: body.y });
    await expect
      .poll(async () => (await snapshot(page)).overlays[0]?.start ?? 0)
      .toBeGreaterThan(2.8);
    const moved = (await snapshot(page)).overlays[0];
    expect(moved?.start).toBeLessThan(3.2);
    expect(moved?.duration).toBeCloseTo(3, 2);

    const end = await centre(page, "overlay-trim-end", 0);
    await dragMouse(page, end, { x: end.x + 1 * z, y: end.y }, 8);
    await expect
      .poll(async () => (await snapshot(page)).overlays[0]?.duration ?? 0)
      .toBeGreaterThan(3.8);

    const startHandle = await centre(page, "overlay-trim-start", 0);
    await dragMouse(page, startHandle, { x: startHandle.x + 0.5 * z, y: startHandle.y }, 8);
    const resized = await expect
      .poll(async () => (await snapshot(page)).overlays[0]?.start ?? 0)
      .toBeGreaterThan(3.3);
    void resized;
    const final = (await snapshot(page)).overlays[0];
    // The right edge stayed put while the left edge moved.
    expect((final?.start ?? 0) + (final?.duration ?? 0)).toBeCloseTo(7, 0);
    await page.screenshot({ path: `${SHOTS}/09-overlay-resized.png` });
  });

  test("overlay snaps to the playhead", async ({ page }) => {
    await openHarness(page);
    await command(page, "add_overlay", { preset: "title-fade", start: 1, duration: 2 });
    await page.reload();
    const z = await zoomOf(page);
    const ruler = await page.getByTestId("ruler-hit").boundingBox();
    if (!ruler) throw new Error("no ruler");
    await page.mouse.click(64 + 5 * z, ruler.y + 12);
    const body = await centre(page, "overlay", 0);
    // Drag so the block's start lands 0.05 s (4 px) away from the playhead at 5 s.
    await page.mouse.move(body.x, body.y);
    await page.mouse.down();
    await page.mouse.move(body.x + 4 * z - 3, body.y, { steps: 10 });
    await expect(page.getByTestId("snap-line")).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.start ?? 0).toBeCloseTo(5, 3);
  });

  test("inspector edits the selected overlay through commands", async ({ page }) => {
    await openHarness(page);
    await command(page, "add_overlay", { preset: "title-fade", start: 0, duration: 4 });
    await page.reload();
    await page.getByTestId("overlay").click({ position: { x: 40, y: 10 } });
    const text = page.getByTestId("overlay-text");
    await text.fill("Hello world");
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.text).toBe("Hello world");
    await page.getByTestId("overlay-animation").selectOption("pop");
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.animation).toBe("pop");
    await page.getByTestId("position-top").click();
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.style.position).toBe("top");
    await page.getByTestId("overlay-size").fill("120");
    await page.getByTestId("overlay-size").blur();
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.style.fontSize).toBe(120);
    await page.getByTestId("overlay-duration").fill("2.5");
    await page.getByTestId("overlay-duration").blur();
    await expect.poll(async () => (await snapshot(page)).overlays[0]?.duration).toBe(2.5);
    // The preview draws it.
    await expect(page.locator(".dx-ovl-text").first()).toContainText("Hello");
    await page.screenshot({ path: `${SHOTS}/10-inspector.png` });
  });

  test("clip inspector sets volume and fades", async ({ page }) => {
    await openHarness(page);
    await page
      .getByTestId("clip")
      .first()
      .click({ position: { x: 40, y: 20 } });
    await page.getByTestId("clip-volume").fill("50");
    await page.getByTestId("clip-volume").blur();
    await expect.poll(async () => (await snapshot(page)).clips[0]?.volume).toBeCloseTo(0.5, 2);
    await page.getByTestId("clip-fade-out").fill("1.5");
    await page.getByTestId("clip-fade-out").blur();
    await expect.poll(async () => (await snapshot(page)).clips[0]?.fadeOut).toBeCloseTo(1.5, 2);
  });
});
