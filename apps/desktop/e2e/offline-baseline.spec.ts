// An opt-in isolated manual editing walkthrough; all captured media remains in private artifacts.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

test.skip(!process.env.DAX_OFFLINE_BASELINE, "Opt in to the isolated offline baseline");

test("manual editing, grouped undo, project copy, review and decoded export", async ({
  page,
  startEngine,
  openApp,
  sampleVideo,
  shot,
}) => {
  test.setTimeout(180_000);
  const resultDir = process.env.DAX_OFFLINE_RESULT_DIR;
  if (!resultDir) throw new Error("Set DAX_OFFLINE_RESULT_DIR to a new private directory");
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
  const engine = await startEngine();
  await openApp(engine);
  await expect(page.getByText("Drop a video here or click Import")).toBeVisible();
  await shot("offline-empty");

  let picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import", exact: true }).click();
  await (await picker).setFiles({
    name: "bad.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not video"),
  });
  await expect(page.getByText(/ffprobe|Invalid data|video stream/i).first()).toBeVisible();
  expect(Object.keys((await engine.api.project()).assets)).toHaveLength(0);
  await shot("offline-invalid-media");

  picker = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Import", exact: true }).click();
  await (await picker).setFiles(sampleVideo);
  await expect.poll(async () => Object.keys((await engine.api.project()).assets).length).toBe(1);
  await engine.api.settled(90_000);
  await shot("offline-imported");

  await page.getByRole("button", { name: "Show side panel", exact: true }).click();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Title at playhead").fill("Offline baseline title");
  await page.getByRole("button", { name: "Add title", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .toContain("Offline baseline title");
  await page.getByRole("button", { name: "Close tools panel" }).click();
  const before = await engine.api.state();
  const batch = await engine.api.command("apply_edit_batch", {
    label: "Offline baseline group",
    operations: [
      { name: "set_format", args: { width: 640, height: 360 } },
      { name: "add_zoom", args: { start: 0, end: 3, scale: 1.1 } },
    ],
  });
  expect(batch.ok).toBe(true);
  const changed = await engine.api.state();
  expect(changed.history.length).toBe(before.history.length + 1);
  expect(changed.project.timeline.width).toBe(640);
  expect(changed.project.timeline.zooms?.length).toBe(1);
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await engine.api.project()).timeline.zooms?.length ?? 0).toBe(0);
  expect(JSON.stringify(await engine.api.project())).toContain("Offline baseline title");
  await page.getByRole("banner").getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await engine.api.project()).timeline.zooms?.length).toBe(1);
  await shot("offline-edited");

  await page.getByText("Project", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project as…", exact: true }).click();
  const projectCopy = join(resultDir, "offline-copy.dax.json");
  await (await download).saveAs(projectCopy);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("dialog", { name: "New project" })
    .getByRole("textbox")
    .fill("Fresh offline test");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect.poll(async () => Object.keys((await engine.api.project()).assets).length).toBe(0);
  await page.getByLabel("Open Dax project").setInputFiles(projectCopy);
  await expect
    .poll(async () => JSON.stringify(await engine.api.project()))
    .toContain("Offline baseline title");
  await expect.poll(async () => (await engine.api.project()).timeline.zooms?.length).toBe(1);

  await page.getByText("Project", { exact: true }).click();
  const revision = (await engine.api.state()).revision;
  const reviewResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/command") &&
      response.request().postDataJSON()?.name === "render_preview",
  );
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  const reviewStart = await (await reviewResponse).json();
  expect(reviewStart.ok).toBe(true);
  expect(reviewStart.data.revision).toBe(revision);
  const review = page.getByLabel("Complete edit review", { exact: true });
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => review.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  expect((await engine.api.state()).revision).toBe(revision);
  await shot("offline-reviewed");
  await page.getByRole("button", { name: "Back to editing" }).click();

  const output = join(dirname(sampleVideo), "offline-baseline-export.mp4");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await dialog.getByLabel("Save as").fill(output);
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByText("Exported offline-baseline-export.mp4.")).toBeVisible({
    timeout: 90_000,
  });
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "video",
  );
  const audio = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === "audio",
  );
  expect(video).toMatchObject({ width: 640, height: 360 });
  expect(audio).toBeTruthy();
  expect(Number(probe.format.duration)).toBeGreaterThan(5.8);
  expect(Number(probe.format.duration)).toBeLessThan(6.2);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
    { stdio: "pipe" },
  );
  const savedVideo = join(resultDir, "offline-export.mp4");
  copyFileSync(output, savedVideo, constants.COPYFILE_EXCL);
  copyFileSync(sampleVideo, join(resultDir, "offline-source.mp4"), constants.COPYFILE_EXCL);
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(
    join(resultDir, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        revision,
        duration: Number(probe.format.duration),
        width: video.width,
        height: video.height,
        audio: Boolean(audio),
        fullDecode: true,
        projectSha256: hash(projectCopy),
        sourceSha256: hash(sampleVideo),
        exportSha256: hash(savedVideo),
        note: "Browser external requests blocked; OS networking was not disabled. Project copy contains temporary media paths and needs relinking after the isolated engine closes.",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  await shot("offline-exported");
});
