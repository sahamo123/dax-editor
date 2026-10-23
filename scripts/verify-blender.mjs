// Explicit real Blender acceptance, separate from default tests and never requiring an AI service.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { emptyProject, Session, tryRunCommand } from "../packages/core/dist/index.js";
import { createBlenderRenderer } from "../packages/engine/dist/blender.js";

const work = resolve("artifacts/blender-acceptance");
await mkdir(work, { recursive: true });
const logo = join(work, "logo.png");
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
  logo,
]);
const renderer = createBlenderRenderer(work);
const status = await renderer.status();
assert.equal(status.available, true, status.detail);
const results = [];
for (const template of ["title-card", "logo-intro", "text-3d"]) {
  const session = new Session(emptyProject(template));
  const started = Date.now();
  const request = {
    template,
    text: "Dax Editor",
    color: "#6b97ff",
    duration: 0.5,
    width: 160,
    height: 128,
    fps: 12,
    ...(template === "logo-intro" ? { logoPath: logo } : {}),
  };
  const context = { session, motion: renderer, allowedRoots: [work] };
  const result = await tryRunCommand(context, "render_motion_template", request);
  assert.equal(result.ok, true, JSON.stringify(result));
  const asset = Object.values(session.project.assets)[0];
  assert.ok(asset?.generation, "Generated recipe must be saved");
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", asset.path],
      { encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams[0]?.width, 160);
  assert.equal(probe.streams[0]?.height, 128);
  assert.ok(Math.abs(Number(probe.format.duration) - 0.5) < 0.1);
  const frame = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    "0.25",
    "-i",
    asset.path,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  let low = 255,
    high = 0;
  for (const value of frame) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  assert.ok(
    frame.length >= 160 * 128 * 3 && high - low > 20,
    "Template must produce a nonblank decoded frame",
  );
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-ss",
    "0.25",
    "-i",
    asset.path,
    "-frames:v",
    "1",
    "-threads",
    "1",
    join(work, `${template}.png`),
  ]);
  const regenerated = await tryRunCommand(context, "render_motion_template", {
    ...request,
    text: "Revised",
    replaceAssetId: asset.id,
  });
  assert.equal(regenerated.ok, true, JSON.stringify(regenerated));
  assert.equal(Object.keys(session.project.assets).length, 1);
  assert.notEqual(session.project.assets[asset.id]?.path, asset.path);
  await session.undo();
  assert.equal(session.project.assets[asset.id]?.path, asset.path);
  results.push({
    template,
    elapsedMs: Date.now() - started,
    output: asset.path,
    decodedRange: [low, high],
    regenerationUndo: true,
  });
}
const before = (await readdir(join(work, "renders"))).sort();
const abort = new AbortController();
await assert.rejects(
  renderer.render(
    {
      template: "title-card",
      text: "Cancel test",
      color: "#6b97ff",
      duration: 3,
      width: 160,
      height: 128,
      fps: 12,
    },
    { signal: abort.signal, onProgress: () => abort.abort() },
  ),
  /cancel|abort/i,
);
assert.equal(abort.signal.aborted, true);
assert.deepEqual(
  (await readdir(join(work, "renders"))).sort(),
  before,
  "Cancelled work must be removed before returning",
);
await writeFile(
  join(work, "result.json"),
  JSON.stringify(
    { status: "PASS", blender: status.version, results, cancellationCleanup: true },
    null,
    2,
  ),
);
console.log(
  "Real Blender templates, import, regeneration undo, decoded frames and cancellation cleanup passed.",
);
