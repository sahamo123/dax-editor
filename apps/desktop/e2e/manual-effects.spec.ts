// Manual effect operations through actual file selection, shared history and playable export; no AI configured.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

test("manually edits zooms, music and images, undoes and exports without AI", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
  shot,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 700 });
  const server = await startServer();
  await server.api.importPaths([sampleVideo]);
  await server.api.command("set_format", { width: 320, height: 180 });
  const audio = join(dirname(sampleVideo), "effect-tone.wav"),
    image = join(dirname(sampleVideo), "effect-logo.png");
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    audio,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x32",
    "-frames:v",
    "1",
    "-threads",
    "1",
    image,
  ]);
  await openApp(server);
  await page.getByRole("button", { name: "Show side panel", exact: true }).click();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByText("Zooms", { exact: true }).click();
  await page.getByRole("button", { name: "Add zoom at playhead", exact: true }).click();
  await expect.poll(async () => (await server.api.project()).timeline.zooms?.length).toBe(1);
  await page.getByText(/^Zoom 1 ·/).click();
  await page.getByLabel("Zoom 1 final scale", { exact: true }).fill("1.25");
  await page.getByLabel("Zoom 1 final scale", { exact: true }).press("Tab");
  await expect
    .poll(async () => (await server.api.project()).timeline.zooms?.[0]?.toScale)
    .toBe(1.25);
  await page.getByText("Music and sound effects", { exact: true }).click();
  await page.getByLabel("Add audio at playhead", { exact: true }).setInputFiles(audio);
  await expect
    .poll(
      async () =>
        (await server.api.project()).timeline.tracks.find((track) => track.kind === "audio")?.clips
          .length,
    )
    .toBe(1);
  await page.getByText("Logos and images", { exact: true }).click();
  await page.getByLabel("Add image at playhead", { exact: true }).setInputFiles(image);
  await expect.poll(async () => (await server.api.project()).timeline.images?.length).toBe(1);
  await shot("manual-effects-controls");
  await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await server.api.project()).timeline.images?.length ?? 0).toBe(0);
  await page.getByRole("banner").getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await server.api.project()).timeline.images?.length).toBe(1);
  await server.api.settled();
  const closeTools = page.getByRole("button", { name: "Close tools panel" });
  if (await closeTools.isVisible()) await closeTools.click();
  const beforeReview = await server.api.project();
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const review = page.getByLabel("Complete edit review", { exact: true });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => review.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await review.evaluate((element: HTMLVideoElement) => element.play());
  await expect
    .poll(() => review.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0.1);
  expect(await server.api.project()).toEqual(beforeReview);
  await shot("complete-effects-review");
  await page.getByRole("button", { name: "Back to editing" }).click();
  const output = join(dirname(sampleVideo), "manual-effects-export.mp4");
  const result = await server.api.command("export_video", { path: output });
  expect(result.ok).toBe(true);
  await server.api.settled(45_000);
  const streams = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", output],
    { encoding: "utf8" },
  );
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
  const state = await server.api.state();
  expect(state.tasks?.some((task) => task.origin === "manual" && task.status === "completed")).toBe(
    true,
  );
});
