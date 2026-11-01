// Generate bounded, synthetic acceptance media in a unique ignored directory for offline editor testing.

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parent = join(root, "artifacts", "acceptance-fixtures");
mkdirSync(parent, { recursive: true });
const directory = join(parent, randomUUID());
mkdirSync(directory, { recursive: false });

const cases = [
  { id: "short", seconds: 12, rate: "30", audio: true },
  { id: "full-length", seconds: 65, rate: "30", audio: true },
  { id: "podcast", seconds: 75, rate: "30", audio: true },
  { id: "educational", seconds: 45, rate: "30", audio: true },
  { id: "fractional", seconds: 10, rate: "30000/1001", audio: true },
  { id: "variable-rate", seconds: 10, rate: "30", audio: true, variable: true },
  { id: "no-audio", seconds: 6, rate: "30", audio: false },
];

const run = (program, args) =>
  execFileSync(program, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const version = run("ffmpeg", ["-version"]).split(/\r?\n/)[0];
const manifest = { version: 1, generatedAt: new Date().toISOString(), ffmpeg: version, cases: [] };

for (const item of cases) {
  const path = join(directory, `${item.id}.mp4`);
  const filter = [
    "drawtext=fontfile=packages/core/assets/fonts/Inter-Regular.otf:text=%{n}:x=8:y=8:fontsize=18:fontcolor=white:box=1",
    ...(item.variable ? ["select=not(eq(mod(n\\,5)\\,0))"] : []),
  ].join(",");
  const args = [
    "-n",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=320x180:rate=${item.rate}:duration=${item.seconds}`,
    ...(item.audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${item.seconds}`] : []),
    "-vf",
    filter,
    ...(item.variable ? ["-fps_mode", "passthrough"] : []),
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-threads",
    "2",
    ...(item.audio ? ["-c:a", "aac", "-shortest"] : ["-an"]),
    path,
  ];
  run("ffmpeg", args);
  const probe = JSON.parse(
    run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]),
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (video?.width !== 320 || video.height !== 180 || Boolean(audio) !== item.audio)
    throw new Error(`Unexpected stream layout for ${item.id}`);
  const duration = Number(probe.format.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - item.seconds) > 0.2)
    throw new Error(`Unexpected duration for ${item.id}: ${duration}`);
  if (item.variable) {
    const frames = run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "frame=best_effort_timestamp_time",
      "-of",
      "csv=p=0",
      path,
    ])
      .trim()
      .split(/\r?\n/)
      .map(Number);
    const gaps = new Set(frames.slice(1).map((time, i) => Math.round((time - frames[i]) * 1000)));
    if (gaps.size < 2) throw new Error("Variable-rate fixture lacks distinct frame intervals");
  }
  manifest.cases.push({
    ...item,
    file: `${item.id}.mp4`,
    duration,
    width: video.width,
    height: video.height,
    averageFrameRate: video.avg_frame_rate,
    audioChannels: audio?.channels ?? 0,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
}

const malformed = join(directory, "malformed.mp4");
writeFileSync(malformed, "This is deliberately not a video.\n", { flag: "wx" });
manifest.malformed = {
  file: "malformed.mp4",
  sha256: createHash("sha256").update(readFileSync(malformed)).digest("hex"),
};
manifest.missing = "missing.mp4 (intentionally not created)";
writeFileSync(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx",
});
console.log(
  `Generated and probed ${cases.length} synthetic videos plus malformed/missing cases in ${directory}`,
);
