// Turning a project into a video file: encoder selection and the FFmpeg command for the main track and its overlays.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { audioLayerFilters } from "./audio-layer.js";
import { buildAss, captionLines } from "./captions.js";
import { ffmpegBin, run, runFfmpeg } from "./exec.js";
import { type FontFiles, filterPath, overlayFilters, type TextFile } from "./overlay-filters.js";
import type { Clip, Project } from "./schema.js";
import { clipDuration, mainClips, timelineDuration } from "./timeline.js";
import { zoomFilters, zoomsOf } from "./zoom.js";

/**
 * Preferred H.264 encoders, best first. libx264 is GPL, so builds we ship
 * (LGPL) rely on the platform encoders and fall back to what is available.
 */
const PREFERRED_ENCODERS = [
  "libx264",
  "h264_videotoolbox",
  "h264_nvenc",
  "h264_qsv",
  "h264_amf",
  "libopenh264",
  "mpeg4",
] as const;

/** Names of the video encoders compiled into the FFmpeg binary in use. */
export async function listEncoders(): Promise<Set<string>> {
  const { stdout } = await run(ffmpegBin(), ["-hide_banner", "-encoders"]);
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const name = /^\s*V\S*\s+(\S+)/.exec(line)?.[1];
    if (name) names.add(name);
  }
  return names;
}

/** Pick the best available H.264 encoder from the preferred list. Throws if none is usable. */
export function chooseEncoder(available: Set<string>): string {
  const found = PREFERRED_ENCODERS.find((e) => available.has(e));
  if (!found) throw new Error("No usable video encoder found in this FFmpeg build");
  return found;
}

function encoderArgs(encoder: string): string[] {
  switch (encoder) {
    case "libx264":
      return ["-c:v", encoder, "-crf", "20", "-preset", "medium"];
    case "mpeg4":
      return ["-c:v", encoder, "-q:v", "3"];
    default:
      return ["-c:v", encoder, "-b:v", "8M"];
  }
}

const n = (x: number) => x.toFixed(6);

/** Length of the tiny audio fade at each cut. Stops a hard splice from clicking; too short to hear as a dip. */
const JOIN_FADE = 0.008;

/** True if clip `b` simply continues clip `a` (same asset, next source moment), so no cut happens between them. */
function isContinuation(a: Clip | undefined, b: Clip | undefined): boolean {
  return Boolean(a && b && a.assetId === b.assetId && Math.abs(a.out - b.in) < 1e-3);
}

/** Where the bundled Inter font files live (OFL-licensed; shipped so text renders identically on every OS). */
export function bundledFonts(): FontFiles {
  const dir = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
  return { regular: join(dir, "Inter-Regular.otf"), bold: join(dir, "Inter-Bold.otf") };
}

/** An FFmpeg argument list, the expected output length, and any text files the filter graph reads. */
export interface RenderPlan {
  args: string[];
  /** Expected length of the output in seconds, used to turn progress into a fraction. */
  duration: number;
  /** Files that must exist before FFmpeg runs (overlay text). Empty when there are no overlays. */
  files: TextFile[];
}

/** Extra inputs for {@link buildRenderPlan}. */
export interface RenderContext {
  /** Directory for overlay text files. Required if the project has overlays. */
  workDir?: string;
  /** Fonts for overlays; defaults to the bundled Inter files. */
  fonts?: FontFiles;
}

/**
 * Turn the project into one FFmpeg command: trim each clip (with fades), normalise, concat, then
 * (in this order) zoom the joined picture, draw image overlays, draw text overlays and captions, and mix the
 * music and sound-effect layer under the main audio. Everything after the join works in timeline time.
 */
export function buildRenderPlan(
  project: Project,
  outPath: string,
  encoder: string,
  ctx: RenderContext = {},
): RenderPlan {
  const clips = mainClips(project);
  if (clips.length === 0) throw new Error("Timeline is empty");
  const { width: W, height: H, fps } = project.timeline;

  /** FFmpeg input arguments, flat (`-i a.mp4 -loop 1 ... -i b.png`). */
  const inputs: string[] = [];
  let inputCount = 0;
  /** Input index per asset, so a file used by several clips (or as music) is opened once. */
  const inputIndex = new Map<string, number>();
  /** Open `path` as a new input, with options that must come before its `-i`. Returns its index. */
  const addInput = (path: string, options: string[] = []): number => {
    inputs.push(...options, "-i", path);
    return inputCount++;
  };
  const filters: string[] = [];
  const concatPads: string[] = [];

  clips.forEach((c, i) => {
    const asset = project.assets[c.assetId];
    if (!asset) throw new Error(`Clip ${c.id} references missing asset ${c.assetId}`);
    if (asset.kind !== "video") {
      throw new Error(
        `Asset ${asset.path} is ${asset.kind}; only video can go on the main track for now`,
      );
    }
    let k = inputIndex.get(asset.id);
    if (k === undefined) {
      k = addInput(asset.path);
      inputIndex.set(asset.id, k);
    }
    const dur = clipDuration(c);
    const vFade =
      (c.fadeIn > 0 ? `,fade=t=in:st=0:d=${n(c.fadeIn)}` : "") +
      (c.fadeOut > 0 ? `,fade=t=out:st=${n(Math.max(0, dur - c.fadeOut))}:d=${n(c.fadeOut)}` : "");
    // Tiny fades at real cuts (not where one clip continues straight into the next) prevent clicks.
    const joinIn = i > 0 && !isContinuation(clips[i - 1], c) && dur > JOIN_FADE * 2;
    const joinOut = i < clips.length - 1 && !isContinuation(c, clips[i + 1]) && dur > JOIN_FADE * 2;
    const aFade =
      (c.fadeIn > 0 ? `,afade=t=in:st=0:d=${n(c.fadeIn)}` : "") +
      (c.fadeOut > 0
        ? `,afade=t=out:st=${n(Math.max(0, dur - c.fadeOut))}:d=${n(c.fadeOut)}`
        : "") +
      (joinIn ? `,afade=t=in:st=0:d=${n(JOIN_FADE)}` : "") +
      (joinOut ? `,afade=t=out:st=${n(dur - JOIN_FADE)}:d=${n(JOIN_FADE)}` : "");
    const head = `[${k}:v]trim=start=${n(c.in)}:end=${n(c.out)},setpts=PTS-STARTPTS`;
    const tail = `setsar=1,fps=${fps},format=yuv420p${vFade}[v${i}]`;
    if (project.timeline.fit === "cover") {
      filters.push(
        `${head},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}`,
      );
    } else if (project.timeline.fit === "blur") {
      // A blurred, enlarged copy fills the frame; the sharp picture sits centred on top of it.
      filters.push(
        `${head},split=2[bg${i}][fg${i}]`,
        `[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:3[bb${i}]`,
        `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[ff${i}]`,
        `[bb${i}][ff${i}]overlay=(W-w)/2:(H-h)/2,${tail}`,
      );
    } else {
      filters.push(
        `${head},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,${tail}`,
      );
    }
    if (asset.hasAudio) {
      filters.push(
        `[${k}:a]atrim=start=${n(c.in)}:end=${n(c.out)},asetpts=PTS-STARTPTS,` +
          `aresample=48000,aformat=channel_layouts=stereo,volume=${c.volume}${aFade}[a${i}]`,
      );
    } else {
      filters.push(
        `anullsrc=r=48000:cl=stereo,atrim=duration=${n(dur)},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
    concatPads.push(`[v${i}][a${i}]`);
  });

  filters.push(`${concatPads.join("")}concat=n=${clips.length}:v=1:a=1[outv][outa]`);

  const total = timelineDuration(project);
  let videoLabel = "[outv]";

  // Zooms scale the joined picture, so they come before anything that must not zoom (images, text, captions).
  const zoomed = zoomFilters(zoomsOf(project), videoLabel, "[vzoom]", W, H, total);
  if (zoomed.length > 0) {
    filters.push(...zoomed);
    videoLabel = "[vzoom]";
  }

  // Overlays and captions are drawn after the join so their times are timeline times.
  const files: TextFile[] = [];
  const overlays = [...project.timeline.overlays].sort(
    (a, b) => a.lane - b.lane || a.start - b.start,
  );
  const captions = project.timeline.captions;
  const lines = captions ? captionLines(project, captions.maxWords) : [];
  if (overlays.length > 0 || lines.length > 0) {
    if (!ctx.workDir) {
      throw new Error(
        "buildRenderPlan needs ctx.workDir when the project has overlays or captions",
      );
    }
    const fonts = ctx.fonts ?? bundledFonts();
    const chain: string[] = [];
    for (const o of overlays) {
      const built = overlayFilters(o, W, H, fonts, ctx.workDir);
      chain.push(...built.filters);
      files.push(...built.files);
    }
    if (captions && lines.length > 0) {
      const assPath = `${ctx.workDir.replace(/\\/g, "/")}/captions.ass`;
      files.push({ path: assPath, content: buildAss(lines, captions, W, H) });
      const fontsDir = dirname(fonts.regular);
      chain.push(`subtitles=filename=${filterPath(assPath)}:fontsdir=${filterPath(fontsDir)}`);
    }
    filters.push(`${videoLabel}${chain.join(",")}[final]`);
    videoLabel = "[final]";
  }

  // The audio layer mixes under the joined main audio; with no audio clips the main audio is used as it is.
  let audioLabel = "[outa]";
  const mixed = audioLayerFilters({
    project,
    mainLabel: audioLabel,
    total,
    inputFor: (assetId) => {
      const known = inputIndex.get(assetId);
      if (known !== undefined) return known;
      const asset = project.assets[assetId];
      if (!asset) throw new Error(`Audio clip references missing asset ${assetId}`);
      const k = addInput(asset.path);
      inputIndex.set(assetId, k);
      return k;
    },
  });
  if (mixed) {
    filters.push(...mixed.filters);
    audioLabel = mixed.label;
  }

  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    videoLabel,
    "-map",
    audioLabel,
    ...encoderArgs(encoder),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outPath,
  ];
  return { args, duration: total, files };
}

/** Options for {@link exportProject}. */
export interface ExportOptions {
  /** Override the automatically chosen encoder. */
  encoder?: string;
  /** Called with a fraction between 0 and 1. */
  onProgress?: (fraction: number) => void;
}

/** Render the main track to `outPath` and report which encoder was used. Progress is reported as a fraction from 0 to 1. */
export async function exportProject(
  project: Project,
  outPath: string,
  opts: ExportOptions = {},
): Promise<{ encoder: string; duration: number }> {
  const encoder = opts.encoder ?? chooseEncoder(await listEncoders());
  const workDir = await mkdtemp(join(tmpdir(), "dax-render-"));
  try {
    const plan = buildRenderPlan(project, outPath, encoder, { workDir });
    for (const f of plan.files) await writeFile(f.path, f.content, "utf8");
    await runFfmpeg(plan.args, (sec) => opts.onProgress?.(Math.min(1, sec / plan.duration)));
    opts.onProgress?.(1);
    return { encoder, duration: plan.duration };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
