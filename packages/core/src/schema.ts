// The data model for projects, timelines, tracks, clips, overlays and assets (zod schemas and types). Declarations only, no logic.

import { z } from "zod";

/** One recognised word, timed in the source file's own time (seconds). */
export const WordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});
/** A validated {@link WordSchema} value. */
export type Word = z.infer<typeof WordSchema>;

/** Word-timed transcript of one media file. */
export const TranscriptSchema = z.object({
  /** ISO language code such as `en`, when known. */
  language: z.string().optional(),
  words: z.array(WordSchema),
});
/** A validated {@link TranscriptSchema} value. */
export type Transcript = z.infer<typeof TranscriptSchema>;

/** A source media file known to the project. `duration` is in seconds; `hasAudio` lets the renderer synthesise silence for clips without an audio stream. */
export const AssetSchema = z.object({
  id: z.string(),
  path: z.string(),
  kind: z.enum(["video", "audio", "image"]),
  duration: z.number().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  hasAudio: z.boolean(),
  /** Speech transcript, once one has been made. Times are in the asset's own time. */
  transcript: TranscriptSchema.optional(),
});
/** A validated {@link AssetSchema} value. */
export type Asset = z.infer<typeof AssetSchema>;

/**
 * A clip places a slice of an asset ([in, out] in source seconds) on the
 * timeline at `start` (timeline seconds). `fadeIn` / `fadeOut` are the lengths,
 * in seconds, of a fade from/to black (and silence) at the clip's edges.
 */
export const ClipSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  start: z.number().nonnegative(),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  volume: z.number().nonnegative().default(1),
  fadeIn: z.number().nonnegative().default(0),
  fadeOut: z.number().nonnegative().default(0),
});
/** A validated {@link ClipSchema} value. */
export type Clip = z.infer<typeof ClipSchema>;

/** An ordered lane of clips. The main video track (`v1`) is gapless; the optional audio track (`a1`) is free-form. */
export const TrackSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio"]),
  clips: z.array(ClipSchema),
});
/** A validated {@link TrackSchema} value. */
export type Track = z.infer<typeof TrackSchema>;

/** How an overlay enters and leaves the screen. */
export const ANIMATIONS = ["none", "fade", "slide-up", "slide-left", "pop", "typewriter"] as const;
/** One of {@link ANIMATIONS}. */
export type Animation = (typeof ANIMATIONS)[number];

/** Where on the frame a text overlay sits. `lower-third` is the broadcast-style bottom-left position. */
export const POSITIONS = ["center", "top", "bottom", "lower-third"] as const;
/** One of {@link POSITIONS}. */
export type Position = (typeof POSITIONS)[number];

/** A `#RRGGBB` colour. */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");

/** Look of a text overlay. `fontSize` is in pixels for a 1080-pixel-high frame and scales with the project height. */
export const OverlayStyleSchema = z.object({
  fontSize: z.number().min(8).max(400).default(64),
  color: HexColorSchema.default("#ffffff"),
  bold: z.boolean().default(false),
  /** Optional background box behind the text; `opacity` runs from 0 (clear) to 1 (solid). */
  box: z.object({ color: HexColorSchema, opacity: z.number().min(0).max(1) }).optional(),
  /** Accent colour for the bar on lower-thirds. */
  accent: HexColorSchema.default("#3b82f6"),
  position: z.enum(POSITIONS).default("center"),
});
/** A validated {@link OverlayStyleSchema} value. */
export type OverlayStyle = z.infer<typeof OverlayStyleSchema>;

/**
 * Text drawn over the video between `start` and `start + duration` (timeline
 * seconds). `lane` only orders overlays in the UI. `preset` records which
 * built-in preset created it (informational); `animation` is what the renderer uses.
 */
export const OverlaySchema = z.object({
  id: z.string(),
  kind: z.literal("text"),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  text: z.string().min(1).max(280),
  /** Optional second, smaller line (used by lower-thirds). */
  subtitle: z.string().max(280).optional(),
  preset: z.string().default("custom"),
  animation: z.enum(ANIMATIONS).default("fade"),
  style: OverlayStyleSchema.default({}),
  lane: z.number().int().nonnegative().default(0),
});
/** A validated {@link OverlaySchema} value. */
export type Overlay = z.infer<typeof OverlaySchema>;

/** How a zoom moves between its start and end scale. `linear` is constant speed; the others start and/or finish gently. */
export const EASES = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
/** One of {@link EASES}. */
export type Ease = (typeof EASES)[number];

/** Largest zoom factor. Beyond about 3x the picture is too soft to be useful. */
export const MAX_ZOOM = 3;

/**
 * A punch-in or push-in on the finished picture between `start` and `start + duration` (timeline seconds).
 * The picture is scaled from `fromScale` to `toScale` (1 = unzoomed, 1.25 = 25 percent closer) following
 * `ease`; equal scales are a hard punch-in that holds. `x` and `y` are the point that stays in view, as a
 * fraction of the frame (0.5, 0.5 is the centre). Zoom ranges on a timeline never overlap.
 */
export const ZoomSchema = z.object({
  id: z.string(),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  fromScale: z.number().min(1).max(MAX_ZOOM),
  toScale: z.number().min(1).max(MAX_ZOOM),
  ease: z.enum(EASES).default("ease-in-out"),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
});
/** A validated {@link ZoomSchema} value. */
export type Zoom = z.infer<typeof ZoomSchema>;

/** How footage that does not match the output shape is fitted: bars, crop to fill, or a blurred copy behind. */
export const FITS = ["contain", "cover", "blur"] as const;
/** One of {@link FITS}. */
export type Fit = (typeof FITS)[number];

/** Built-in caption looks. */
export const CAPTION_STYLES = ["classic", "bold-pop", "minimal"] as const;
/** One of {@link CAPTION_STYLES}. */
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

/**
 * Captions made from the speech transcripts of the clips on the timeline. Their presence turns captions
 * on. Lines are computed when needed, so they follow every edit automatically.
 */
export const CaptionSettingsSchema = z.object({
  style: z.enum(CAPTION_STYLES).default("classic"),
  /** Most words shown at once. */
  maxWords: z.number().int().min(1).max(8).default(4),
  uppercase: z.boolean().default(false),
  color: HexColorSchema.default("#ffffff"),
  /** Colour of the word being spoken (`bold-pop` style). */
  highlight: HexColorSchema.default("#facc15"),
  position: z.enum(["bottom", "center", "top"]).default("bottom"),
});
/** A validated {@link CaptionSettingsSchema} value. */
export type CaptionSettings = z.infer<typeof CaptionSettingsSchema>;

/** Output format (`width`, `height`, `fps`) plus the tracks and overlays that make up the edit. */
export const TimelineSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  /** How clips are fitted into the frame. `contain` leaves bars, `cover` crops to fill, `blur` puts a blurred copy behind. */
  fit: z.enum(FITS).default("contain"),
  tracks: z.array(TrackSchema),
  overlays: z.array(OverlaySchema).default([]),
  /** Punch-ins and push-ins on the finished picture. Absent means none. */
  zooms: z.array(ZoomSchema).optional(),
  /** Present when captions are on. */
  captions: CaptionSettingsSchema.optional(),
});
/** A validated {@link TimelineSchema} value. */
export type Timeline = z.infer<typeof TimelineSchema>;

/** The saved project file: assets plus a timeline. `version` lets future releases migrate old files. */
export const ProjectSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  assets: z.record(z.string(), AssetSchema),
  timeline: TimelineSchema,
});
/** A validated {@link ProjectSchema} value. Treated as immutable: edits return a new project. */
export type Project = z.infer<typeof ProjectSchema>;

/** A half-open time range in seconds. */
export interface Range {
  start: number;
  end: number;
}
