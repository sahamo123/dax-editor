// Exercise editing through export with keyboard traversal after a synthetic pre-import.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function tabTo(page: Page, target: Locator, label: string): Promise<void> {
  for (let step = 0; step < 120; step += 1) {
    if (
      (await target.count()) === 1 &&
      (await target.evaluate((node) => node === document.activeElement))
    )
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard Tab traversal did not reach ${label}`);
}

for (const width of [1000, 1366]) {
  test(`keyboard edit, undo, review and export at ${width}`, async ({
    page,
    startServer,
    openApp,
    sampleVideo,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 768 });
    const server = await startServer();
    await server.importPaths([sampleVideo]);
    expect((await server.command("set_format", { width: 320, height: 180 })).ok).toBe(true);
    await openApp(server);
    const clips = page.getByRole("listbox", { name: "Timeline" }).getByTestId("clip");
    await expect(clips).toHaveCount(1);
    await tabTo(page, clips.first(), "timeline clip");
    await page.keyboard.press("Enter");
    await expect(clips.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("s");
    const clipCount = async () =>
      (await server.project()).timeline.tracks.find((track) => track.kind === "video")?.clips
        .length;
    await expect.poll(clipCount).toBe(2);
    await expect(clips).toHaveCount(2);
    await tabTo(page, clips.first(), "first split clip");
    await page.keyboard.press("Enter");
    await expect(clips.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Delete");
    await expect.poll(clipCount).toBe(1);
    await page.keyboard.press("Control+z");
    await expect.poll(clipCount).toBe(2);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(clipCount).toBe(1);
    const remaining = (await server.project()).timeline.tracks.find(
      (track) => track.kind === "video",
    )?.clips[0];
    if (!remaining) throw new Error("Edited video clip missing");
    expect(remaining.out - remaining.in).toBeCloseTo(5, 1);

    const reviewButton = page.getByRole("button", { name: "Review effects", exact: true });
    await tabTo(page, reviewButton, "Review effects");
    await page.keyboard.press("Enter");
    const review = page.getByLabel("Complete edit review", { exact: true });
    await expect(review).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(() => review.evaluate((node: HTMLVideoElement) => node.readyState), { timeout: 45_000 })
      .toBeGreaterThanOrEqual(2);
    await tabTo(page, review, "rendered review player");
    await page.keyboard.press("Space");
    await expect
      .poll(() => review.evaluate((node: HTMLVideoElement) => node.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.1);
    const back = page.getByRole("button", { name: "Back to editing", exact: true });
    await tabTo(page, back, "Back to editing");
    await page.keyboard.press("Enter");
    await expect(review).toBeHidden();

    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    const occupied = join(dirname(sampleVideo), `occupied-${width}.mp4`);
    const output = join(dirname(sampleVideo), `keyboard-export-${width}.mp4`);
    const marker = "synthetic-existing-file";
    await writeFile(occupied, marker, { flag: "wx" });
    const exportTo = async (path: string) => {
      await tabTo(page, exportButton, "Export");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Export video" });
      await expect(dialog).toBeVisible();
      const saveAs = dialog.getByLabel("Save as");
      await tabTo(page, saveAs, "Save as");
      await page.keyboard.press("Control+a");
      await page.keyboard.type(path);
      await expect(saveAs).toHaveValue(path);
      const confirm = dialog.getByRole("button", { name: "Export", exact: true });
      await tabTo(page, confirm, "confirm export");
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
    };
    await exportTo(occupied);
    await expect(page.locator(".toasts").getByText(/already exists/)).toBeVisible();
    expect(await readFile(occupied, "utf8")).toBe(marker);
    expect(await clipCount()).toBe(1);
    await exportTo(output);
    await expect(
      page.locator(".toasts").getByText(`Exported keyboard-export-${width}.mp4.`),
    ).toBeVisible({ timeout: 60_000 });
    expect(await clipCount()).toBe(1);
    execFileSync(process.env.DAX_FFMPEG ?? "ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      output,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ]);
    const duration = Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          output,
        ],
        { encoding: "utf8" },
      ).trim(),
    );
    console.info(JSON.stringify({ width, exportedDuration: duration }));
    expect(duration).toBeGreaterThan(4.8);
    expect(duration).toBeLessThan(5.2);
  });
}
