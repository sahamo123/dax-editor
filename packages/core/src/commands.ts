// The command registry: every action a user, the built-in AI, an external agent (MCP) or the CLI can take on a project.
// One definition per command (name, plain-language description, typed arguments, safety flags, implementation) so the
// four front doors can never drift apart. Descriptions are written for a language model to read.

import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { type ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { captionLines, hasCaptionSource, setCaptions } from "./captions.js";
import { checkAllowedPath } from "./connector.js";
import {
  analyzeAudio,
  applyCutPlan,
  CUT_PRESET_NAMES,
  detectSpeechSpans,
  planCuts,
  planWouldChange,
} from "./cuts.js";
import { describeEffects, EFFECT_COMMANDS } from "./effect-commands.js";
import { detectScenes, detectSilence, padSilences, probe } from "./media.js";
import type { MotionRenderer } from "./motion.js";
import { MOTION_COMMANDS } from "./motion-commands.js";
import {
  addOverlay,
  moveOverlay,
  type OverlayPatch,
  removeOverlay,
  updateOverlay,
} from "./overlays.js";
import { getPreset, OVERLAY_PRESETS, overlayFromPreset } from "./presets.js";
import { PROJECT_COMMANDS } from "./project-commands.js";
import { exportProject } from "./render.js";
import {
  ANIMATIONS,
  type Asset,
  CAPTION_STYLES,
  FITS,
  type OverlayStyle,
  POSITIONS,
  type Project,
} from "./schema.js";
import type { HistorySource, Session } from "./session.js";
import { TEMPLATE_COMMANDS } from "./template-commands.js";
import {
  addAsset,
  appendClip,
  assetRangesToTimeline,
  clipEnd,
  deleteRange,
  deleteRanges,
  FORMAT_PRESETS,
  keepRanges,
  mainClips,
  moveClip,
  ownAsset,
  removeClip,
  setAssetTranscript,
  setClipFades,
  setClipVolume,
  setFormat,
  splitAt,
  timelineDuration,
  trimClip,
} from "./timeline.js";
import { findFillerRanges, formatTranscript, type Transcriber } from "./transcript.js";

/** What a command needs to run. */
export interface CommandContext {
  /** Editor sessions preserve omitted fit and fps on format changes; omitted/false retains standalone CLI preset defaults. */
  preserveFormatOptions?: boolean;
  /** Optional separate-process motion-template renderer. */
  motion?: MotionRenderer;
  session: Session;
  /** If set, imports and exports are restricted to these folders. */
  allowedRoots?: string[];
  /** Recorded in the history so manual, AI and template edits can be told apart. Defaults to `manual`. */
  source?: HistorySource;
  /** Called with a fraction from 0 to 1 by long-running commands such as export. */
  onProgress?: (fraction: number) => void;
  /** Speech-to-text engine used by `transcribe`. Absent when none is set up. */
  transcriber?: Transcriber;
  /** Cancels the command. Long-running commands (export, transcription, analysis) stop and fail; edits are checked before they are applied. */
  signal?: AbortSignal;
  /** Called with each child process a command starts, so the host can kill it on shutdown. */
  onProcess?: (child: ChildProcess) => void;
}

/** What a command returns. `summary` is short plain text meant to be read by a person or a model. */
export interface CommandResult {
  summary: string;
  /** Structured details (ids, ranges, lists). Kept compact; large data is truncated by the command. */
  data?: unknown;
}

/** One entry in the registry. */
export interface CommandDef {
  /** snake_case name used by every front door, e.g. `delete_range`. */
  name: string;
  /** What it does and when to use it, written for a language model. */
  description: string;
  /** Validates and documents the arguments. Use `.describe()` on fields; it reaches the model. */
  schema: ZodTypeAny;
  /** True if it never changes the project (safe to call freely). */
  readOnly: boolean;
  /** True if it cannot be undone from the history (writes files, overwrites). Agents must not run these inside a draft. */
  irreversible: boolean;
  /** Do the work. Arguments have already been validated against `schema`. */
  run(ctx: CommandContext, args: never): Promise<CommandResult>;
}

/** Thrown for bad arguments or a command that cannot do what was asked. The message is safe to show to a model. */
export class CommandError extends Error {}

const seconds = (what: string) => z.number().finite().min(0).describe(`${what}, in seconds`);
const assetIdArg = z
  .string()
  .optional()
  .describe("Asset id. Omit to use the video that is on the timeline.");

const fmt = (x: number) => `${Number(x.toFixed(2))}s`;

/** Define a command with the argument type inferred from its schema. */
function define<S extends ZodTypeAny>(def: {
  name: string;
  description: string;
  schema: S;
  readOnly?: boolean;
  irreversible?: boolean;
  run: (ctx: CommandContext, args: z.infer<S>) => Promise<CommandResult>;
}): CommandDef {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    readOnly: def.readOnly ?? false,
    irreversible: def.irreversible ?? false,
    run: def.run as CommandDef["run"],
  };
}

/** Apply an edit to the session with a label for the history. */
async function edit(ctx: CommandContext, label: string, fn: (p: Project) => Project) {
  // A cancelled command must not change the project after the user has stopped it: long commands reach this
  // point only after their analysis, and that analysis may have been cut short.
  if (ctx.signal?.aborted) throw new CommandError("Cancelled. Nothing was changed.");
  await ctx.session.apply(fn, { label, source: ctx.source ?? "manual" });
}

/** The cancel signal as an options fragment, for helpers that take `{ signal }` (absent when the command is not cancellable). */
function cancellable(ctx: CommandContext): { signal: AbortSignal } | Record<string, never> {
  return ctx.signal ? { signal: ctx.signal } : {};
}

/** The asset a command should work on: the one given, else the video on the timeline. */
function pickAsset(p: Project, assetId?: string): Asset {
  if (assetId) {
    const a = ownAsset(p, assetId);
    if (!a) throw new CommandError(`Unknown asset "${assetId}". Call get_project to see assets.`);
    return a;
  }
  const used = mainClips(p)[0]?.assetId;
  const fromTimeline = used ? ownAsset(p, used) : undefined;
  if (fromTimeline) return fromTimeline;
  const all = Object.values(p.assets);
  if (all.length === 1 && all[0]) return all[0];
  throw new CommandError("No video to work on. Import a video first (import_media).");
}

/**
 * Check a path a command was given against the folders the caller allowed. Symlinks are resolved on both sides, so a
 * link inside an allowed folder cannot lead outside it. Without any folders, commands started by the AI or a template
 * refuse every path; the CLI and the desktop app pass no folders on purpose (they act in the user's own shell).
 * @returns the absolute, normalised path.
 * @throws CommandError when the path is not allowed.
 */
async function checkPath(ctx: CommandContext, path: string): Promise<string> {
  try {
    return await checkAllowedPath(path, ctx);
  } catch (err) {
    throw new CommandError(err instanceof Error ? err.message : String(err));
  }
}

/** Clips and overlays per page of `get_project`. Large projects are read in pages so one reply stays small. */
const PROJECT_PAGE = 100;

/**
 * A compact description of the project for a person or a model. Clips and overlays are returned one page at a time
 * (`offset`, `limit`); `nextOffset` says where the next page starts, or is null when the lists are complete.
 */
function describeProject(p: Project, offset = 0, limit = PROJECT_PAGE) {
  const allClips = mainClips(p);
  const allOverlays = p.timeline.overlays;
  const clipsPage = allClips.slice(offset, offset + limit);
  const overlaysPage = allOverlays.slice(offset, offset + limit);
  const effects = describeEffects(p, offset, limit);
  // The page holds the longest of the lists, so the next offset skips exactly what was shown.
  const shown = Math.max(
    clipsPage.length,
    overlaysPage.length,
    effects.zooms.length,
    effects.audio.length,
    effects.images.length,
  );
  const total = Math.max(
    allClips.length,
    allOverlays.length,
    effects.zoomCount,
    effects.audioCount,
    effects.imageCount,
  );
  const more = offset + limit < total;
  return {
    name: p.name,
    format: `${p.timeline.width}x${p.timeline.height} @ ${p.timeline.fps} fps`,
    duration: Number(timelineDuration(p).toFixed(3)),
    clipCount: allClips.length,
    overlayCount: allOverlays.length,
    offset,
    nextOffset: more ? offset + shown : null,
    assets: Object.values(p.assets).map((a) => ({
      id: a.id,
      file: basename(a.path),
      kind: a.kind,
      duration: Number(a.duration.toFixed(3)),
      hasAudio: a.hasAudio,
      hasTranscript: Boolean(a.transcript),
    })),
    clips: clipsPage.map((c) => ({
      id: c.id,
      assetId: c.assetId,
      start: Number(c.start.toFixed(3)),
      end: Number(clipEnd(c).toFixed(3)),
      sourceIn: Number(c.in.toFixed(3)),
      sourceOut: Number(c.out.toFixed(3)),
      volume: c.volume,
      fadeIn: c.fadeIn,
      fadeOut: c.fadeOut,
    })),
    captions: p.timeline.captions
      ? { ...p.timeline.captions, lines: captionLines(p, p.timeline.captions.maxWords).length }
      : null,
    overlays: overlaysPage.map((o) => ({
      id: o.id,
      start: Number(o.start.toFixed(3)),
      end: Number((o.start + o.duration).toFixed(3)),
      text: o.text,
      subtitle: o.subtitle,
      preset: o.preset,
      animation: o.animation,
    })),
    ...effects,
  };
}

const presetIds = OVERLAY_PRESETS.map((p) => p.id) as [string, ...string[]];

const styleFields = {
  fontSize: z
    .number()
    .finite()
    .min(8)
    .max(400)
    .optional()
    .describe("Text size in pixels on a 1080p frame"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Text colour as #RRGGBB"),
  position: z.enum(POSITIONS).optional().describe("Where the text sits on the frame"),
};

function styleFrom(a: { fontSize?: number; color?: string; position?: OverlayStyle["position"] }) {
  const s: Partial<OverlayStyle> = {};
  if (a.fontSize !== undefined) s.fontSize = a.fontSize;
  if (a.color !== undefined) s.color = a.color;
  if (a.position !== undefined) s.position = a.position;
  return s;
}

/** Seconds of a word's decaying tail kept after speech without a transcript. */
const SPEECH_HANGOVER = 0.12;
/** Seconds before a soft onset kept when speech comes from loudness alone. */
const SPEECH_LOOKBACK = 0.06;

/** Analyse an asset and build a cut plan, using its transcript when it has one. */
async function buildPlan(
  ctx: CommandContext,
  assetId: string | undefined,
  preset: (typeof CUT_PRESET_NAMES)[number],
) {
  const asset = pickAsset(ctx.session.project, assetId);
  const words = asset.transcript?.words;
  // The loudness frames find speech when there is no transcript, and let the planner check that a pause is silent.
  let levels: Awaited<ReturnType<typeof analyzeAudio>> | undefined;
  const warnings: string[] = [];
  if (!words || asset.hasAudio) {
    try {
      levels = await analyzeAudio(asset.path, cancellable(ctx));
    } catch (err) {
      if (!words) throw err;
      warnings.push(
        "The audio could not be read, so pauses were cut from the transcript timing alone (music or other sound in a pause would be cut too).",
      );
    }
  }
  // Without a transcript the speech spans set the edges: keep 120 ms of a decaying tail, and 60 ms before a soft onset.
  const speech =
    !words && levels
      ? detectSpeechSpans(levels, { hangover: SPEECH_HANGOVER, lookback: SPEECH_LOOKBACK })
      : undefined;
  return planCuts({
    assetId: asset.id,
    duration: asset.duration,
    preset,
    ...(words ? { words } : {}),
    ...(speech ? { speech } : {}),
    ...(words && levels ? { levels } : {}),
    warnings,
  });
}

/** Every command, in the order they are presented to people and models. */
export const COMMANDS: readonly CommandDef[] = [
  define({
    name: "get_project",
    description:
      "Describe the current project: format, total duration, imported assets, the clips on the timeline (with ids and times in seconds), text overlays, zooms, music and sound effects, and image overlays. Call this first, and again after edits, to see the real state.",
    schema: z.object({
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
          "Skip this many clips, overlays and effects (use nextOffset from the last reply)",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(PROJECT_PAGE)
        .describe("Most clips, overlays and effects to return in one reply"),
    }),
    readOnly: true,
    async run(ctx, a) {
      const d = describeProject(ctx.session.project, a.offset, a.limit);
      const more =
        d.nextOffset === null ? "" : ` Showing from ${d.offset}; more with offset ${d.nextOffset}.`;
      // Effects are mentioned only when there are some, so a plain project reads as before.
      const extras = [
        d.zoomCount ? `${d.zoomCount} zoom(s)` : "",
        d.audioCount ? `${d.audioCount} audio clip(s)` : "",
        d.imageCount ? `${d.imageCount} image(s)` : "",
      ].filter(Boolean);
      return {
        summary: `${d.name}: ${fmt(d.duration)}, ${d.clipCount} clip(s), ${d.overlayCount} overlay(s), ${d.assets.length} asset(s)${extras.length ? `, ${extras.join(", ")}` : ""}.${more}`,
        data: d,
      };
    },
  }),

  define({
    name: "list_presets",
    description:
      "List the built-in animated text presets (titles, lower-thirds, captions, callouts) that add_overlay can use.",
    schema: z.object({}),
    readOnly: true,
    async run() {
      return {
        summary: `${OVERLAY_PRESETS.length} presets available.`,
        data: OVERLAY_PRESETS.map((p) => ({
          id: p.id,
          label: p.label,
          category: p.category,
          description: p.description,
          animation: p.animation,
          defaultDuration: p.defaultDuration,
        })),
      };
    },
  }),

  define({
    name: "detect_silence",
    description:
      "Find silent stretches in a video's audio WITHOUT changing anything. Returns time ranges in the source file. Use before remove_silences when you want to inspect or report, or to tune thresholds.",
    schema: z.object({
      assetId: assetIdArg,
      noiseDb: z
        .number()
        .min(-80)
        .max(-5)
        .default(-30)
        .describe("Anything quieter than this many dB counts as silence. Lower = stricter."),
      minDuration: z
        .number()
        .min(0.1)
        .max(30)
        .default(0.5)
        .describe("Ignore silences shorter than this many seconds"),
    }),
    readOnly: true,
    async run(ctx, a) {
      const asset = pickAsset(ctx.session.project, a.assetId);
      const ranges = await detectSilence(asset.path, asset.duration, {
        noiseDb: a.noiseDb,
        minDuration: a.minDuration,
        ...cancellable(ctx),
      });
      const total = ranges.reduce((n, r) => n + (r.end - r.start), 0);
      return {
        summary: `${ranges.length} silent stretch(es) totalling ${fmt(total)} in ${basename(asset.path)}.`,
        data: {
          assetId: asset.id,
          count: ranges.length,
          totalSeconds: total,
          ranges: ranges.slice(0, 50),
        },
      };
    },
  }),

  define({
    name: "detect_scenes",
    description:
      "Find moments where the picture changes sharply (scene or shot changes) WITHOUT changing anything. Returns times in seconds in the source file.",
    schema: z.object({
      assetId: assetIdArg,
      threshold: z
        .number()
        .min(0.05)
        .max(0.95)
        .default(0.4)
        .describe("Sensitivity from 0.05 (very sensitive) to 0.95 (only huge changes)"),
    }),
    readOnly: true,
    async run(ctx, a) {
      const asset = pickAsset(ctx.session.project, a.assetId);
      const times = await detectScenes(asset.path, a.threshold, cancellable(ctx));
      return {
        summary: `${times.length} scene change(s) in ${basename(asset.path)}.`,
        data: { assetId: asset.id, count: times.length, times: times.slice(0, 200) },
      };
    },
  }),

  define({
    name: "get_transcript",
    description:
      "Read the speech transcript of a video with [mm:ss] time markers. Optionally limit to a time window. If no transcript exists yet it says so.",
    schema: z.object({
      assetId: assetIdArg,
      from: seconds("Start of the window in the source file").optional(),
      to: seconds("End of the window in the source file").optional(),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Skip this many words of the window (use nextOffset from the last reply)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(300)
        .describe("Most words to return in one reply"),
    }),
    readOnly: true,
    async run(ctx, a) {
      const asset = pickAsset(ctx.session.project, a.assetId);
      if (!asset.transcript) {
        throw new CommandError(
          `${basename(asset.path)} has no transcript yet. Transcribing is not available in this build.`,
        );
      }
      const from = a.from ?? 0;
      const to = a.to ?? Number.POSITIVE_INFINITY;
      const words = asset.transcript.words.filter((w) => w.end > from && w.start < to);
      const page = words.slice(a.offset, a.offset + a.limit);
      const next = a.offset + page.length < words.length ? a.offset + page.length : null;
      const more = next === null ? "" : ` More with offset ${next}.`;
      return {
        summary: `Words ${page.length ? a.offset + 1 : 0}-${a.offset + page.length} of ${words.length}.${more}`,
        data: {
          assetId: asset.id,
          totalWords: words.length,
          offset: a.offset,
          returned: page.length,
          nextOffset: next,
          text: formatTranscript({ words: page }),
        },
      };
    },
  }),

  define({
    name: "transcribe",
    description:
      "Turn the speech in a video into a word-timed transcript (needed for removing filler words, precise cuts at word boundaries, and captions). Takes a while on long videos. Safe to repeat; replaces the old transcript.",
    schema: z.object({
      assetId: assetIdArg,
      language: z
        .string()
        .min(2)
        .max(10)
        .optional()
        .describe("ISO language code such as en; omit to auto-detect"),
    }),
    async run(ctx, a) {
      if (!ctx.transcriber) {
        throw new CommandError(
          "Speech recognition is not set up yet, so this video cannot be transcribed.",
        );
      }
      const asset = pickAsset(ctx.session.project, a.assetId);
      const transcript = await ctx.transcriber.transcribe(asset.path, {
        ...(a.language ? { language: a.language } : {}),
        ...(ctx.onProgress
          ? { onProgress: (progress: { fraction: number }) => ctx.onProgress?.(progress.fraction) }
          : {}),
        ...cancellable(ctx),
      });
      await edit(ctx, `Transcribe ${basename(asset.path)}`, (p) =>
        setAssetTranscript(p, asset.id, transcript),
      );
      return {
        summary: `Transcribed ${transcript.words.length} word(s) from ${basename(asset.path)}.`,
        data: { assetId: asset.id, words: transcript.words.length, language: transcript.language },
      };
    },
  }),

  define({
    name: "set_format",
    description:
      "Change the output format: a preset (landscape-1080p, landscape-720p, portrait-1080x1920 for Shorts/Reels/TikTok, square-1080, portrait-4x5 for Instagram) or an explicit width, height and frame rate. Editor sessions preserve omitted fit and frame rate. `fit`: contain (bars), cover (crop to fill), blur (blurred background). Standalone CLI preset defaults retain automatic fit selection.",
    schema: z.object({
      preset: z
        .enum(
          Object.keys(FORMAT_PRESETS) as [
            keyof typeof FORMAT_PRESETS,
            ...(keyof typeof FORMAT_PRESETS)[],
          ],
        )
        .optional(),
      width: z.number().finite().int().min(16).max(8192).optional(),
      height: z.number().finite().int().min(16).max(8192).optional(),
      fps: z.number().finite().min(1).max(120).optional(),
      fit: z.enum(FITS).optional(),
    }),
    async run(ctx, a) {
      const fmtArgs = a.preset ? { ...FORMAT_PRESETS[a.preset] } : {};
      const size: { width?: number; height?: number; fps?: number; fit?: (typeof FITS)[number] } = {
        ...fmtArgs,
      };
      const tall = a.preset !== undefined && !a.preset.startsWith("landscape");
      if (ctx.preserveFormatOptions) {
        size.fit = ctx.session.project.timeline.fit;
        size.fps = ctx.session.project.timeline.fps;
      }
      if (a.fit !== undefined) size.fit = a.fit;
      else if (ctx.preserveFormatOptions) size.fit = ctx.session.project.timeline.fit;
      else if (tall && ctx.session.project.timeline.fit === "contain") size.fit = "blur";
      else if (a.preset?.startsWith("landscape")) size.fit = "contain";
      if (a.width !== undefined) size.width = a.width;
      if (a.height !== undefined) size.height = a.height;
      if (a.fps !== undefined) size.fps = a.fps;
      await edit(ctx, "Change format", (p) => setFormat(p, size));
      const t = ctx.session.project.timeline;
      return { summary: `Format is now ${t.width}x${t.height} at ${t.fps} fps (fit: ${t.fit}).` };
    },
  }),

  define({
    name: "set_captions",
    description:
      "Turn on captions made from the speech transcript (they follow every cut automatically), change their look, or turn them off. Needs a transcript: run transcribe first. Styles: classic (white text on a dark box, bottom), bold-pop (big uppercase words with the spoken word highlighted, centre; popular for Shorts/Reels/TikTok), minimal (plain small text).",
    schema: z.object({
      enabled: z.boolean().default(true).describe("false turns captions off"),
      style: z.enum(CAPTION_STYLES).optional(),
      maxWords: z
        .number()
        .finite()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("Most words on screen at once"),
      uppercase: z.boolean().optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("Text colour as #RRGGBB"),
      highlight: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("Colour of the spoken word (bold-pop)"),
      position: z.enum(["bottom", "center", "top"]).optional(),
    }),
    async run(ctx, a) {
      if (!a.enabled) {
        await edit(ctx, "Turn captions off", (p) => setCaptions(p, null));
        return { summary: "Captions are off." };
      }
      if (!hasCaptionSource(ctx.session.project)) {
        throw new CommandError(
          "No transcript on the timeline yet, so there is nothing to caption. Run transcribe first.",
        );
      }
      const { enabled: _enabled, ...patch } = a;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      await edit(ctx, "Set captions", (p) => setCaptions(p, clean));
      const c = ctx.session.project.timeline.captions;
      const n = captionLines(ctx.session.project, c?.maxWords ?? 4).length;
      return { summary: `Captions on (${c?.style}), ${n} line(s).` };
    },
  }),

  define({
    name: "import_media",
    description:
      "Import a video file from the user's computer and put it at the end of the timeline. Takes a full file path.",
    schema: z.object({ path: z.string().min(1).describe("Absolute path of a video file") }),
    async run(ctx, a) {
      const abs = await checkPath(ctx, a.path);
      if (!existsSync(abs)) throw new CommandError(`File not found: ${abs}`);
      const asset = await probe(abs, cancellable(ctx));
      if (asset.kind !== "video") {
        throw new CommandError(
          `${basename(abs)} is ${asset.kind}; only video files can be imported for now.`,
        );
      }
      await edit(ctx, `Import ${basename(abs)}`, (p) => appendClip(addAsset(p, asset), asset.id));
      return {
        summary: `Imported ${basename(abs)} (${fmt(asset.duration)}) and placed it on the timeline.`,
        data: { assetId: asset.id },
      };
    },
  }),

  define({
    name: "add_clip",
    description:
      "Append an already-imported video (or a slice of it) to the end of the timeline. `in` and `out` are source times in seconds.",
    schema: z.object({
      assetId: z.string(),
      in: seconds("Start of the slice").optional(),
      out: seconds("End of the slice").optional(),
    }),
    async run(ctx, a) {
      const slice: { in?: number; out?: number } = {};
      if (a.in !== undefined) slice.in = a.in;
      if (a.out !== undefined) slice.out = a.out;
      await edit(ctx, "Add clip", (p) => appendClip(p, a.assetId, slice));
      return {
        summary: `Clip added. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.`,
      };
    },
  }),

  define({
    name: "split",
    description:
      "Cut the clip at one timeline time into two clips. Nothing is removed; use delete_range to remove footage.",
    schema: z.object({ at: seconds("Timeline time to cut at") }),
    async run(ctx, a) {
      await edit(ctx, `Split at ${fmt(a.at)}`, (p) => splitAt(p, a.at));
      return { summary: `Split at ${fmt(a.at)}.` };
    },
  }),

  define({
    name: "delete_range",
    description:
      "Remove everything between two timeline times and close the gap (ripple delete). Later footage and overlays move earlier by the removed length.",
    schema: z.object({ from: seconds("Start of the range"), to: seconds("End of the range") }),
    async run(ctx, a) {
      await edit(ctx, `Delete ${fmt(a.from)} to ${fmt(a.to)}`, (p) => deleteRange(p, a.from, a.to));
      return {
        summary: `Deleted ${fmt(a.from)} to ${fmt(a.to)}. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.`,
      };
    },
  }),

  define({
    name: "keep_only",
    description:
      "Keep only the listed timeline ranges and delete everything else, closing all gaps. Use to cut a video down to chosen parts, e.g. the first 30 seconds or three highlights.",
    schema: z.object({
      ranges: z
        .array(z.object({ start: seconds("Range start"), end: seconds("Range end") }))
        .min(1)
        .describe("Timeline ranges to keep"),
    }),
    async run(ctx, a) {
      await edit(ctx, `Keep ${a.ranges.length} range(s)`, (p) => keepRanges(p, a.ranges));
      return {
        summary: `Kept ${a.ranges.length} range(s). Timeline is now ${fmt(timelineDuration(ctx.session.project))}.`,
      };
    },
  }),

  define({
    name: "trim_clip",
    description:
      "Change where a clip starts and/or ends within its source video (source times in seconds). Use get_project to find clip ids.",
    schema: z.object({
      clipId: z.string(),
      in: seconds("New source start").optional(),
      out: seconds("New source end").optional(),
    }),
    async run(ctx, a) {
      const trim: { in?: number; out?: number } = {};
      if (a.in !== undefined) trim.in = a.in;
      if (a.out !== undefined) trim.out = a.out;
      await edit(ctx, "Trim clip", (p) => trimClip(p, a.clipId, trim));
      return { summary: `Trimmed. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.` };
    },
  }),

  define({
    name: "move_clip",
    description: "Move a clip to a new position in the order of clips (0 = first).",
    schema: z.object({ clipId: z.string(), index: z.number().finite().int().min(0) }),
    async run(ctx, a) {
      await edit(ctx, "Move clip", (p) => moveClip(p, a.clipId, a.index));
      return { summary: `Moved clip to position ${a.index}.` };
    },
  }),

  define({
    name: "remove_clip",
    description: "Delete a whole clip and close the gap. Use get_project to find clip ids.",
    schema: z.object({ clipId: z.string() }),
    async run(ctx, a) {
      await edit(ctx, "Remove clip", (p) => removeClip(p, a.clipId));
      return {
        summary: `Removed the clip. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.`,
      };
    },
  }),

  define({
    name: "set_volume",
    description: "Set a clip's loudness: 1 is unchanged, 0 is muted, 2 is twice as loud.",
    schema: z.object({ clipId: z.string(), volume: z.number().finite().min(0).max(4) }),
    async run(ctx, a) {
      await edit(ctx, "Set volume", (p) => setClipVolume(p, a.clipId, a.volume));
      return { summary: `Volume set to ${a.volume}.` };
    },
  }),

  define({
    name: "set_fades",
    description:
      "Fade a clip in from black and/or out to black (picture and sound). Lengths in seconds; 0 removes a fade.",
    schema: z.object({
      clipId: z.string(),
      fadeIn: seconds("Fade-in length").optional(),
      fadeOut: seconds("Fade-out length").optional(),
    }),
    async run(ctx, a) {
      const fades: { fadeIn?: number; fadeOut?: number } = {};
      if (a.fadeIn !== undefined) fades.fadeIn = a.fadeIn;
      if (a.fadeOut !== undefined) fades.fadeOut = a.fadeOut;
      await edit(ctx, "Set fades", (p) => setClipFades(p, a.clipId, fades));
      return { summary: "Fades updated." };
    },
  }),

  define({
    name: "remove_silences",
    description:
      "Find and cut out silent pauses everywhere in the video, closing the gaps. Leaves a short natural pause (`pad`) at each cut. The standard way to tighten talking footage.",
    schema: z.object({
      assetId: assetIdArg,
      noiseDb: z
        .number()
        .min(-80)
        .max(-5)
        .default(-30)
        .describe("Quieter than this many dB counts as silence"),
      minDuration: z
        .number()
        .min(0.1)
        .max(30)
        .default(0.5)
        .describe("Only cut pauses at least this many seconds long"),
      pad: z
        .number()
        .min(0)
        .max(1)
        .default(0.1)
        .describe("Seconds of pause to keep at each side of a cut"),
    }),
    async run(ctx, a) {
      const asset = pickAsset(ctx.session.project, a.assetId);
      const found = await detectSilence(asset.path, asset.duration, {
        noiseDb: a.noiseDb,
        minDuration: a.minDuration,
        ...cancellable(ctx),
      });
      // Silence is detected in the source file, so some of it may already be cut from the timeline.
      const cuts = assetRangesToTimeline(ctx.session.project, asset.id, padSilences(found, a.pad));
      if (cuts.length === 0) return { summary: "No silences left to cut. Nothing changed." };
      const before = timelineDuration(ctx.session.project);
      await edit(ctx, "Remove silences", (p) => deleteRanges(p, cuts));
      const after = timelineDuration(ctx.session.project);
      return {
        summary: `Removed ${cuts.length} silence(s), ${fmt(before - after)} in total. Timeline is now ${fmt(after)}.`,
        data: { removed: cuts.length, secondsRemoved: before - after },
      };
    },
  }),

  define({
    name: "plan_cuts",
    description:
      "Analyse a video's speech and propose cuts (long pauses, filler words, silence at the start and end, false starts, repeated takes) WITHOUT changing anything. Returns a plan id and each proposed cut with its reason and confidence. Pauses with music or other sound in them are not cut, only listed. Use apply_cut_plan to apply it, or smart_cut to do both at once. Presets: gentle, standard (default), tight, podcast, tutorial.",
    schema: z.object({
      assetId: assetIdArg,
      preset: z.enum(CUT_PRESET_NAMES).default("standard").describe("How aggressively to cut"),
    }),
    readOnly: true,
    async run(ctx, a) {
      const plan = await buildPlan(ctx, a.assetId, a.preset);
      ctx.session.plans.set(plan.id, plan);
      // Breaths are kept, not cut, so they are neither "cut(s) ready" nor "to review".
      const approved = plan.decisions.filter(
        (d) => d.status === "approved" && d.kind !== "breath",
      ).length;
      const proposed = plan.decisions.filter((d) => d.status === "proposed").length;
      return {
        summary: plan.decisions.length
          ? `Plan ${plan.id}: ${approved} cut(s) ready (${fmt(plan.approvedSeconds)}) and ${proposed} to review (${fmt(plan.proposedSeconds)}).`
          : "Nothing to cut: no long pauses, fillers or false starts found.",
        data: {
          planId: plan.id,
          preset: plan.preset,
          approvedSeconds: plan.approvedSeconds,
          proposedSeconds: plan.proposedSeconds,
          ...(plan.warnings ? { warnings: plan.warnings } : {}),
          decisions: plan.decisions.slice(0, 60).map((d) => ({
            id: d.id,
            kind: d.kind,
            start: Number(d.range.start.toFixed(2)),
            end: Number(d.range.end.toFixed(2)),
            reason: d.reason,
            confidence: d.confidence,
            status: d.status,
          })),
        },
      };
    },
  }),

  define({
    name: "apply_cut_plan",
    description:
      "Apply a plan from plan_cuts. By default applies the approved cuts only; set includeProposed to also apply the ones that need review, or list ids in only/exclude. One undo step.",
    schema: z.object({
      planId: z.string(),
      includeProposed: z.boolean().default(false),
      only: z.array(z.string()).optional().describe("Apply only these decision ids"),
      exclude: z.array(z.string()).optional().describe("Skip these decision ids"),
    }),
    async run(ctx, a) {
      const plan = ctx.session.plans.get(a.planId);
      if (!plan) throw new CommandError(`Unknown plan "${a.planId}". Call plan_cuts first.`);
      const opts = {
        includeProposed: a.includeProposed,
        ...(a.only ? { only: a.only } : {}),
        ...(a.exclude ? { exclude: a.exclude } : {}),
      };
      const before = timelineDuration(ctx.session.project);
      if (!planWouldChange(ctx.session.project, plan, opts)) {
        return { summary: "Nothing left to cut from that plan. Nothing changed." };
      }
      await edit(ctx, `Apply cuts (${plan.preset})`, (p) => applyCutPlan(p, plan, opts));
      const after = timelineDuration(ctx.session.project);
      return {
        summary: `Applied the cuts: removed ${fmt(before - after)}. Timeline is now ${fmt(after)}.`,
      };
    },
  }),

  define({
    name: "smart_cut",
    description:
      "Tighten talking footage in one step: plan the cuts and apply the approved ones (long pauses, filler words when a transcript exists, dead air at the start and end). Cuts that need judgement (false starts, repeated takes) are listed but NOT applied; review them with plan_cuts. This is the best default for 'clean up this video'.",
    schema: z.object({
      assetId: assetIdArg,
      preset: z.enum(CUT_PRESET_NAMES).default("standard").describe("How aggressively to cut"),
    }),
    async run(ctx, a) {
      const plan = await buildPlan(ctx, a.assetId, a.preset);
      ctx.session.plans.set(plan.id, plan);
      const before = timelineDuration(ctx.session.project);
      const review = plan.decisions.filter((d) => d.status === "proposed");
      if (!planWouldChange(ctx.session.project, plan)) {
        return {
          summary: `No cuts needed.${review.length ? ` ${review.length} possible cut(s) to review (false starts, retakes, or pauses with sound in them; plan ${plan.id}).` : ""}`,
          data: { planId: plan.id },
        };
      }
      await edit(ctx, `Smart cut (${plan.preset})`, (p) => applyCutPlan(p, plan));
      const after = timelineDuration(ctx.session.project);
      return {
        summary: `Removed ${fmt(before - after)} (${plan.decisions.filter((d) => d.status === "approved" && d.kind !== "breath").length} cut(s)). Timeline is now ${fmt(after)}.${review.length ? ` ${review.length} more for review: apply_cut_plan with planId ${plan.id} and includeProposed.` : ""}`,
        data: {
          planId: plan.id,
          secondsRemoved: before - after,
          forReview: review.length,
          ...(plan.warnings ? { warnings: plan.warnings } : {}),
        },
      };
    },
  }),

  define({
    name: "remove_fillers",
    description:
      "Cut filler words such as um and uh using the transcript. Needs a transcript (see get_transcript).",
    schema: z.object({
      assetId: assetIdArg,
      fillers: z
        .array(z.string())
        .optional()
        .describe("Words to remove. Defaults to um, uh, er, hmm."),
    }),
    async run(ctx, a) {
      const asset = pickAsset(ctx.session.project, a.assetId);
      if (!asset.transcript) {
        throw new CommandError(
          `${basename(asset.path)} has no transcript yet, so filler words cannot be found.`,
        );
      }
      const found = a.fillers
        ? findFillerRanges(asset.transcript, a.fillers)
        : findFillerRanges(asset.transcript);
      const ranges = assetRangesToTimeline(ctx.session.project, asset.id, found);
      if (ranges.length === 0) return { summary: "No filler words left to cut. Nothing changed." };
      const before = timelineDuration(ctx.session.project);
      await edit(ctx, "Remove filler words", (p) => deleteRanges(p, ranges));
      const after = timelineDuration(ctx.session.project);
      return {
        summary: `Removed ${ranges.length} filler word(s), ${fmt(before - after)} in total.`,
      };
    },
  }),

  define({
    name: "add_overlay",
    description:
      "Add animated text over the video using a preset (title, lower-third, caption, callout). Call list_presets to see choices. Times are timeline seconds.",
    schema: z.object({
      preset: z.enum(presetIds).describe("Preset id from list_presets"),
      start: seconds("When the text appears"),
      duration: z
        .number()
        .min(0.2)
        .max(120)
        .optional()
        .describe("How long it stays; defaults to the preset's"),
      text: z.string().min(1).max(280).optional().describe("Main text; defaults to a placeholder"),
      subtitle: z.string().max(280).optional().describe("Smaller second line (lower-thirds)"),
      ...styleFields,
    }),
    async run(ctx, a) {
      const preset = getPreset(a.preset);
      const overlay = overlayFromPreset(a.preset, {
        start: a.start,
        ...(a.duration !== undefined ? { duration: a.duration } : {}),
        ...(a.text !== undefined ? { text: a.text } : {}),
        ...(a.subtitle !== undefined ? { subtitle: a.subtitle } : {}),
        style: styleFrom(a),
      });
      await edit(ctx, `Add ${preset?.label ?? a.preset}`, (p) => addOverlay(p, overlay));
      return {
        summary: `Added "${overlay.text}" at ${fmt(overlay.start)} for ${fmt(overlay.duration)}.`,
        data: { overlayId: overlay.id },
      };
    },
  }),

  define({
    name: "update_overlay",
    description:
      "Change a text overlay's words, timing, animation or look. Only the fields you give are changed. Use get_project to find overlay ids.",
    schema: z.object({
      overlayId: z.string(),
      text: z.string().min(1).max(280).optional(),
      subtitle: z.string().max(280).nullable().optional().describe("null removes the second line"),
      start: seconds("New start").optional(),
      duration: z.number().finite().min(0.2).max(120).optional(),
      animation: z.enum(ANIMATIONS).optional(),
      ...styleFields,
    }),
    async run(ctx, a) {
      const patch: OverlayPatch = { style: styleFrom(a) };
      if (a.text !== undefined) patch.text = a.text;
      if (a.subtitle !== undefined) patch.subtitle = a.subtitle;
      if (a.start !== undefined) patch.start = a.start;
      if (a.duration !== undefined) patch.duration = a.duration;
      if (a.animation !== undefined) patch.animation = a.animation;
      await edit(ctx, "Update overlay", (p) => updateOverlay(p, a.overlayId, patch));
      return { summary: "Overlay updated." };
    },
  }),

  define({
    name: "move_overlay",
    description: "Move a text overlay to a new start time (timeline seconds).",
    schema: z.object({ overlayId: z.string(), start: seconds("New start time") }),
    async run(ctx, a) {
      await edit(ctx, "Move overlay", (p) => moveOverlay(p, a.overlayId, { start: a.start }));
      return { summary: `Moved to ${fmt(a.start)}.` };
    },
  }),

  define({
    name: "remove_overlay",
    description: "Delete a text overlay.",
    schema: z.object({ overlayId: z.string() }),
    async run(ctx, a) {
      await edit(ctx, "Remove overlay", (p) => removeOverlay(p, a.overlayId));
      return { summary: "Overlay removed." };
    },
  }),

  define({
    name: "undo",
    description: "Undo the last change.",
    schema: z.object({}),
    async run(ctx) {
      if (!ctx.session.canUndo) throw new CommandError("Nothing to undo.");
      await ctx.session.undo();
      return { summary: `Undone. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.` };
    },
  }),

  define({
    name: "redo",
    description: "Redo the change that was just undone.",
    schema: z.object({}),
    async run(ctx) {
      if (!ctx.session.canRedo) throw new CommandError("Nothing to redo.");
      await ctx.session.redo();
      return { summary: `Redone. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.` };
    },
  }),

  define({
    name: "get_history",
    description:
      "List every earlier state of the project (id, what changed, who did it). Use with restore_state to go back to any of them.",
    schema: z.object({}),
    readOnly: true,
    async run(ctx) {
      const h = ctx.session.history();
      return { summary: `${h.length} state(s).`, data: h.slice(-50) };
    },
  }),

  define({
    name: "restore_state",
    description:
      "Jump back (or forward) to any state from get_history by its id. Nothing is lost; you can jump again.",
    schema: z.object({ id: z.number().finite().int().min(0) }),
    async run(ctx, a) {
      await ctx.session.restore(a.id);
      return {
        summary: `Restored state ${a.id}. Timeline is now ${fmt(timelineDuration(ctx.session.project))}.`,
      };
    },
  }),

  define({
    name: "save_checkpoint",
    description: "Name the current state so it is easy to return to later.",
    schema: z.object({ name: z.string().min(1).max(60) }),
    async run(ctx, a) {
      // Persisted too: a checkpoint is history-only, so no edit would otherwise write it to the history file.
      await ctx.session.saveCheckpoint(a.name);
      return { summary: `Saved checkpoint "${a.name}".` };
    },
  }),

  define({
    name: "export_video",
    description:
      "Render the timeline to an MP4 file. This writes a file and takes time. It will not overwrite an existing file unless overwrite is true.",
    schema: z.object({
      path: z.string().min(1).describe("Where to save, ending in .mp4"),
      overwrite: z.boolean().default(false),
    }),
    irreversible: true,
    async run(ctx, a) {
      const out = await checkPath(ctx, a.path);
      await checkPath(ctx, dirname(out));
      if (!out.toLowerCase().endsWith(".mp4"))
        throw new CommandError("Export path must end in .mp4");
      // The assistant may not replace a file: an overwrite cannot be undone from the history, and a chat
      // transcript or file name must not be able to make it happen. The user can overwrite by hand.
      if (existsSync(out) && a.overwrite && ctx.source === "ai") {
        throw new CommandError(
          `${out} already exists. The assistant cannot overwrite files. Choose another name.`,
        );
      }
      if (existsSync(out) && !a.overwrite) {
        throw new CommandError(
          `${out} already exists. Choose another name or set overwrite to true.`,
        );
      }
      const r = await exportProject(ctx.session.project, out, {
        ...(ctx.onProgress ? { onProgress: ctx.onProgress } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(ctx.onProcess ? { onSpawn: ctx.onProcess } : {}),
      });
      return { summary: `Exported ${fmt(r.duration)} to ${out}.`, data: { path: out } };
    },
  }),
  ...EFFECT_COMMANDS,
  ...TEMPLATE_COMMANDS,
  ...PROJECT_COMMANDS,
  ...MOTION_COMMANDS,
];

/** Look up a command by name. */
export function getCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name);
}

function formatIssues(name: string, error: z.ZodError): string {
  const issues = error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`);
  return `Invalid arguments for ${name}: ${issues.join("; ")}`;
}

/**
 * Validate `rawArgs` and run a command. Throws {@link CommandError} for bad arguments or
 * a command that cannot do what was asked; other errors (disk, FFmpeg) propagate.
 */
export async function runCommand(
  ctx: CommandContext,
  name: string,
  rawArgs: unknown,
): Promise<CommandResult> {
  const def = getCommand(name);
  if (!def) throw new CommandError(`Unknown command "${name}".`);
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) throw new CommandError(formatIssues(name, parsed.error));
  if (ctx.signal?.aborted)
    throw new CommandError("Cancelled before it started. Nothing was changed.");
  try {
    const result = await def.run(ctx, parsed.data as never);
    // The edit is applied even when autosave fails; say so, or the user and the model believe it is safely on disk.
    const saveError = def.readOnly ? undefined : ctx.session.saveError;
    return saveError
      ? {
          ...result,
          summary: `${result.summary} Warning: the project could not be saved (${saveError}).`,
        }
      : result;
  } catch (err) {
    if (err instanceof CommandError) throw err;
    // Edit functions throw plain Errors with clear messages ("No clip can be split at 4s").
    throw new CommandError(err instanceof Error ? err.message : String(err));
  }
}

/** The outcome of {@link tryRunCommand}: never throws, so an agent loop can feed errors back to the model. */
export type CommandOutcome = ({ ok: true } & CommandResult) | { ok: false; error: string };

/** Like {@link runCommand} but returns errors as values instead of throwing. */
export async function tryRunCommand(
  ctx: CommandContext,
  name: string,
  rawArgs: unknown,
): Promise<CommandOutcome> {
  try {
    return { ok: true, ...(await runCommand(ctx, name, rawArgs)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A command described as a tool for a language model: name, description and JSON Schema for its arguments. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (draft 7) object describing the arguments. */
  parameters: Record<string, unknown>;
  readOnly: boolean;
  irreversible: boolean;
}

/** All commands as tool specs, optionally limited to some names or to read-only ones. */
export function commandTools(filter?: { names?: string[]; readOnlyOnly?: boolean }): ToolSpec[] {
  return COMMANDS.filter((c) => !filter?.names || filter.names.includes(c.name))
    .filter((c) => !filter?.readOnlyOnly || c.readOnly)
    .map((c) => {
      const { $schema: _ignored, ...parameters } = zodToJsonSchema(c.schema, {
        $refStrategy: "none",
      }) as Record<string, unknown>;
      return {
        name: c.name,
        description: c.description,
        parameters,
        readOnly: c.readOnly,
        irreversible: c.irreversible,
      };
    });
}
