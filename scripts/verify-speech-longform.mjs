// Explicit longer-media acceptance with already provisioned offline speech assets, outside the normal test gate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  captionLines,
  emptyProject,
  mainClips,
  Session,
  timelineDuration,
  tryRunCommand,
} from "../packages/core/dist/index.js";
import { createSpeechFeature } from "../packages/engine/dist/speech-controller.js";

globalThis.fetch = async () => {
  throw new Error("External fetch disabled during offline speech acceptance");
};
const work = resolve("artifacts/speech-longform");
await mkdir(work, { recursive: true });
const source = join(work, "source.mp4"),
  output = join(work, "captioned.mp4");
execFileSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=navy:s=320x180:r=12",
  "-i",
  join(work, "narration.wav"),
  "-shortest",
  "-c:v",
  "mpeg4",
  "-c:a",
  "aac",
  "-threads",
  "2",
  source,
]);
const speech = createSpeechFeature(resolve(".dax-data"));
assert.equal(
  (await speech.controller.status()).ready,
  true,
  "Provision offline speech first in the editor",
);
const session = new Session(emptyProject("Longer offline speech acceptance"));
const context = { session, transcriber: speech.transcriber, allowedRoots: [work] };
const run = async (name, args) => {
  const result = await tryRunCommand(context, name, args);
  assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
  return result;
};
const started = Date.now();
await run("import_media", { path: source });
const asset = Object.values(session.project.assets)[0];
assert.ok(asset && asset.duration > 60, "Fixture must exceed one minute");
await run("set_format", { width: 320, height: 180, fps: 12 });
await run("transcribe", { assetId: asset.id });
const words = session.project.assets[asset.id]?.transcript?.words;
assert.ok(words && words.length > 150, "Expected substantial narration");
for (const word of words)
  assert.ok(
    Number.isFinite(word.start) && word.end >= word.start && word.end <= asset.duration + 0.5,
    "Transcript times must fit the source",
  );
const first = words[0];
assert.ok(first);
await run("correct_transcript_word", { assetId: asset.id, wordIndex: 0, text: "Today" });
const corrected = session.project.assets[asset.id]?.transcript?.words[0];
assert.equal(corrected?.start, first.start);
assert.equal(corrected?.end, first.end);
const beforePlan = JSON.stringify(session.project);
const planned = await run("plan_cuts", { assetId: asset.id, preset: "standard" });
assert.equal(JSON.stringify(session.project), beforePlan, "Planning cannot edit the project");
const { planId, decisions } = planned.data;
const reviewed = decisions.find(
  (item) =>
    item.status === "approved" &&
    item.kind !== "breath" &&
    item.start > 5 &&
    item.end < asset.duration - 5,
);
assert.ok(reviewed, "Expected a reviewable interior pause from the generated chapter breaks");
const beforeCut = timelineDuration(session.project);
await run("apply_cut_plan", { planId, only: [reviewed.id] });
assert.ok(timelineDuration(session.project) < beforeCut, "The reviewed pause must be removed");
const clip = mainClips(session.project)[0];
assert.ok(clip);
await run("trim_clip", { clipId: clip.id, in: clip.in + 0.25, out: clip.out });
await run("set_captions", { enabled: true, style: "bold-pop" });
const lines = captionLines(session.project);
assert.ok(lines.length > 40);
const duration = timelineDuration(session.project);
for (const line of lines)
  assert.ok(line.start >= 0 && line.end <= duration + 0.1, "Caption timeline must follow cut/trim");
await run("export_video", { path: output, overwrite: true });
const probe = JSON.parse(
  execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], {
    encoding: "utf8",
  }),
);
const video = probe.streams.find((stream) => stream.codec_type === "video"),
  audio = probe.streams.find((stream) => stream.codec_type === "audio");
assert.ok(video && audio);
const drift = Math.abs(Number(video.duration) - Number(audio.duration));
assert.ok(drift < 1 / 12 + 0.02, "Export streams must finish within one output frame");
await writeFile(
  join(work, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      syntheticNarration: true,
      offlineFetchGuard: true,
      sourceDuration: asset.duration,
      outputDuration: duration,
      wordCount: words.length,
      captionLines: lines.length,
      reviewedCut: reviewed,
      streamDriftSeconds: drift,
      elapsedMs: Date.now() - started,
      output,
    },
    null,
    2,
  ),
);
console.log(
  "Longer offline speech, timing-preserving correction, reviewed pause cut, trim, captions and synchronized export passed.",
);
