// End-to-end proof that the preview plays the EDIT: playback advances across clip boundaries with the right source
// time, stops (or loops) at the end, follows scrubbing and frame steps, applies volume, and draws overlays scaled.

import { expect, type Page, test } from "@playwright/test";
import { command, openHarness, playheadTime, SHOTS, zoomOf } from "./helpers";

/** State of the currently visible <video> (the one the engine shows), read straight from the DOM. */
async function visibleVideo(page: Page) {
  return page.evaluate(() => {
    const videos = [...document.querySelectorAll("video")];
    const shown = videos.find((v) => Number.parseFloat(v.style.opacity || "1") > 0.5);
    if (!shown) return null;
    return {
      currentTime: shown.currentTime,
      paused: shown.paused,
      volume: shown.volume,
      readyState: shown.readyState,
      src: shown.currentSrc,
      opacity: shown.style.opacity,
    };
  });
}

async function seekTo(page: Page, seconds: number): Promise<void> {
  const z = await zoomOf(page);
  const ruler = await page.getByTestId("ruler-hit").boundingBox();
  if (!ruler) throw new Error("no ruler");
  await page.mouse.click(64 + seconds * z, ruler.y + 12);
  await expect.poll(() => playheadTime(page)).toBeCloseTo(seconds, 1);
}

test.describe("preview playback", () => {
  test("plays across a clip boundary with the correct source times", async ({ page }) => {
    await openHarness(page);
    await seekTo(page, 5);
    await expect
      .poll(async () => (await visibleVideo(page))?.readyState ?? 0)
      .toBeGreaterThanOrEqual(2);
    const srcA = (await visibleVideo(page))?.src;
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
    // Playhead moves forward in real time...
    await expect.poll(() => playheadTime(page), { timeout: 4000 }).toBeGreaterThan(5.3);
    // ...and carries on past the cut at 6.0 s into the second clip without stopping.
    await expect.poll(() => playheadTime(page), { timeout: 6000 }).toBeGreaterThan(6.6);
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
    const t = await playheadTime(page);
    const v = await visibleVideo(page);
    expect(v?.paused).toBe(false);
    expect(v?.src).not.toBe(srcA); // a different source file is now showing
    // The second clip starts at source 0, so source time is the timeline time minus 6 (small tolerance for latency).
    expect(Math.abs((v?.currentTime ?? 99) - (t - 6))).toBeLessThan(0.35);
    await page.screenshot({ path: `${SHOTS}/11-playing-clip-b.png` });
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
    const stopped = await playheadTime(page);
    await page.waitForTimeout(400);
    expect(Math.abs((await playheadTime(page)) - stopped)).toBeLessThan(0.05);
  });

  test("the cut between clips is gap-free (playhead keeps real-time pace through it)", async ({
    page,
  }) => {
    await openHarness(page);
    await seekTo(page, 5.2);
    await expect
      .poll(async () => (await visibleVideo(page))?.readyState ?? 0)
      .toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Space");
    const run = await page.evaluate(
      () =>
        new Promise<{ elapsed: number; advanced: number; worstStep: number }>((resolve) => {
          const read = () =>
            Number(document.querySelector('[data-testid="playhead"]')?.getAttribute("data-time"));
          const t0 = performance.now();
          const p0 = read();
          let last = p0;
          let worst = 0;
          const loop = () => {
            const p = read();
            worst = Math.max(worst, p - last);
            last = p;
            const elapsed = (performance.now() - t0) / 1000;
            if (elapsed >= 2.4) resolve({ elapsed, advanced: p - p0, worstStep: worst });
            else requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }),
    );
    // 2.4 s of wall time crossing the cut at 6.0 s: the playhead advanced almost the full 2.4 s and never jumped.
    expect(run.elapsed - run.advanced).toBeLessThan(0.25);
    expect(run.worstStep).toBeLessThan(0.1);
    await page.keyboard.press("Space");
  });

  test("stops at the end, and Space restarts from the beginning", async ({ page }) => {
    await openHarness(page);
    await page.getByTestId("zoom-fit").click();
    await seekTo(page, 17.4);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play", { timeout: 6000 });
    expect(await playheadTime(page)).toBeGreaterThan(17.9);
    await page.keyboard.press("Space");
    await expect.poll(() => playheadTime(page), { timeout: 4000 }).toBeLessThan(2);
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
  });

  test("loops back to the start when loop is on", async ({ page }) => {
    await openHarness(page);
    await page.getByTestId("loop").click();
    await page.getByTestId("zoom-fit").click();
    await seekTo(page, 17.4);
    await page.keyboard.press("Space");
    await expect.poll(() => playheadTime(page), { timeout: 6000 }).toBeLessThan(2);
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
  });

  test("scrubbing, frame stepping and J/K/L", async ({ page }) => {
    await openHarness(page);
    await seekTo(page, 10);
    // The visible frame follows the playhead: 10 s is 4 s into the second clip.
    await expect
      .poll(async () => (await visibleVideo(page))?.currentTime ?? 0, { timeout: 4000 })
      .toBeCloseTo(4, 0);
    const before = await playheadTime(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => playheadTime(page)).toBeCloseTo(before + 1 / 30, 2);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => playheadTime(page)).toBeCloseTo(before - 1 / 30, 2);
    await page.keyboard.press("Home");
    await expect.poll(() => playheadTime(page)).toBe(0);
    await page.keyboard.press("l");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
    await page.keyboard.press("k");
    await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
    await seekTo(page, 3);
    await page.keyboard.press("j");
    await expect.poll(() => playheadTime(page), { timeout: 3000 }).toBeLessThan(2.5);
    await page.keyboard.press("k");
  });

  test("preview audio follows the clip volume and mute", async ({ page }) => {
    await openHarness(page);
    await command(page, "set_volume", {
      clipId: (
        await (await page.request.get("http://127.0.0.1:4390/api/state?token=dev-token")).json()
      ).project.timeline.tracks[0].clips[0].id,
      volume: 0.4,
    });
    await page.reload();
    await expect(page.getByTestId("clip")).toHaveCount(3);
    await page.keyboard.press("Space");
    await expect
      .poll(async () => (await visibleVideo(page))?.volume ?? 1, { timeout: 4000 })
      .toBeCloseTo(0.4, 1);
    await page.getByTestId("mute").click();
    await expect.poll(async () => (await visibleVideo(page))?.volume ?? 1).toBe(0);
    await page.keyboard.press("Space");
  });

  test("text overlays are drawn over the preview, scaled to the frame", async ({ page }) => {
    await openHarness(page);
    await command(page, "add_overlay", {
      preset: "title-fade",
      start: 0.5,
      duration: 4,
      text: "Scaled title",
    });
    await command(page, "add_overlay", {
      preset: "lower-third-slide",
      start: 0.5,
      duration: 4,
      text: "Ada Lovelace",
      subtitle: "Engineer",
    });
    await command(page, "add_overlay", {
      preset: "callout-slide-up",
      start: 0.5,
      duration: 4,
      text: "Key point",
      subtitle: "Second line",
    });
    await command(page, "add_overlay", {
      preset: "caption-bottom",
      start: 0.5,
      duration: 4,
      text: "Caption text here",
    });
    await page.reload();
    await seekTo(page, 2);
    const title = page.locator('[data-part="main"]', { hasText: "Scaled title" });
    await expect(title).toBeVisible();
    const sizes = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="stage"]')?.getBoundingClientRect();
      const el = [...document.querySelectorAll('[data-part="main"]')].find(
        (e) => e.textContent === "Scaled title",
      );
      return {
        stageH: stage?.height ?? 0,
        font: el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0,
        opacity: el ? Number.parseFloat(getComputedStyle(el).opacity) : 0,
      };
    });
    // fontSize 96 on a 1080-high frame scales with the preview height.
    expect(sizes.font).toBeCloseTo((96 / 1080) * sizes.stageH, 0);
    expect(sizes.opacity).toBe(1);
    await page.screenshot({ path: `${SHOTS}/12-overlays-preview.png` });
  });
});
