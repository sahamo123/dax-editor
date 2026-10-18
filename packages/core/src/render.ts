import { ffmpegBin, run, runFfmpeg } from "./exec.js";
import type { Project } from "./schema.js";
import { clipDuration, mainClips, timelineDuration } from "./timeline.js";

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

export async function listEncoders(): Promise<Set<string>> {
  const { stdout } = await run(ffmpegBin(), ["-hide_banner", "-encoders"]);
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = /^\s*V\S*\s+(\S+)/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

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

export interface RenderPlan {
  args: string[];
  duration: number;
}

/** Turn the main track into one FFmpeg command: trim each clip, normalise, concat. */
export function buildRenderPlan(project: Project, outPath: string, encoder: string): RenderPlan {
  const clips = mainClips(project);
  if (clips.length === 0) throw new Error("Timeline is empty");
  const { width: W, height: H, fps } = project.timeline;

  const inputs: string[] = [];
  const inputIndex = new Map<string, number>();
  const filters: string[] = [];
  const concatPads: string[] = [];

  clips.forEach((c, i) => {
    const asset = project.assets[c.assetId];
    if (!asset) throw new Error(`Clip ${c.id} references missing asset ${c.assetId}`);
    if (asset.kind !== "video") {
      throw new Error(`Asset ${asset.path} is ${asset.kind}; only video can go on the main track for now`);
    }
    let k = inputIndex.get(asset.id);
    if (k === undefined) {
      k = inputs.length / 2;
      inputIndex.set(asset.id, k);
      inputs.push("-i", asset.path);
    }
    filters.push(
      `[${k}:v]trim=start=${n(c.in)}:end=${n(c.out)},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`,
    );
    if (asset.hasAudio) {
      filters.push(
        `[${k}:a]atrim=start=${n(c.in)}:end=${n(c.out)},asetpts=PTS-STARTPTS,` +
          `aresample=48000,aformat=channel_layouts=stereo,volume=${c.volume}[a${i}]`,
      );
    } else {
      filters.push(
        `anullsrc=r=48000:cl=stereo,atrim=duration=${n(clipDuration(c))},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
    concatPads.push(`[v${i}][a${i}]`);
  });

  filters.push(`${concatPads.join("")}concat=n=${clips.length}:v=1:a=1[outv][outa]`);

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[outv]",
    "-map", "[outa]",
    ...encoderArgs(encoder),
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ];
  return { args, duration: timelineDuration(project) };
}

export interface ExportOptions {
  /** Override the automatically chosen encoder. */
  encoder?: string;
  /** Called with a fraction between 0 and 1. */
  onProgress?: (fraction: number) => void;
}

export async function exportProject(
  project: Project,
  outPath: string,
  opts: ExportOptions = {},
): Promise<{ encoder: string; duration: number }> {
  const encoder = opts.encoder ?? chooseEncoder(await listEncoders());
  const plan = buildRenderPlan(project, outPath, encoder);
  await runFfmpeg(plan.args, (sec) => opts.onProgress?.(Math.min(1, sec / plan.duration)));
  opts.onProgress?.(1);
  return { encoder, duration: plan.duration };
}
