// The data model for projects, timelines, tracks, clips, overlays and assets (zod schemas and types). Declarations only, no logic.

import { z } from "zod";

/**
 * An id used for assets, clips, tracks and overlays. Restricted to letters, digits, `_` and `-` (at most 64) because
 * ids end up in file names and URLs, and project files are untrusted input: `../x` must never be a valid id.
 */
export const IdSchema = z
  .string()
  .regex(/^[\w-]{1,64}$/, "ids use letters, digits, _ and - (max 64)");

/** One recognised word, timed in the source file's own time (seconds). */
export const WordSchema = z.object({
  text: z.string(),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
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

/**
 * An absolute local file path. A path reaches FFmpeg as an input name, so a URL or protocol
 * (`https:`, `file:`, `concat:`, `pipe:`) and a relative path are refused. A single letter before
 * the colon is a Windows drive letter (`C:\`), which stays valid.
 */
const LocalPathSchema = z
  .string()
  .refine((p) => !/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(p), {
    message: "must be a local file path, not a URL or protocol",
  })
  .refine((p) => /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(p), {
    message: "must be an absolute file path",
  });

/** A source media file known to the project. `duration` is in seconds; `hasAudio` lets the renderer synthesise silence for clips without an audio stream. */
export const AssetSchema = z.object({
  id: IdSchema,
  path: LocalPathSchema,
  kind: z.enum(["video", "audio", "image"]),
  duration: z.number().finite().nonnegative(),
  width: z.number().finite().int().positive().optional(),
  height: z.number().finite().int().positive().optional(),
  fps: z.number().finite().positive().optional(),
  hasAudio: z.boolean(),
  /** Speech transcript, once one has been made. Times are in the asset's own time. */
  transcript: TranscriptSchema.optional(),
  /** App-generated asset recipe, retained for explicit regeneration; never executable code. */
  generation: z
    .object({ kind: z.literal("blender"), parameters: z.record(z.unknown()) })
    .optional(),
});
/** A validated {@link AssetSchema} value. */
export type Asset = z.infer<typeof AssetSchema>;

/** What a clip on the audio track is for. Music ducks under speech; a sound effect (`sfx`) never does. */
export const AUDIO_ROLES = ["music", "sfx"] as const;
/** One of {@link AUDIO_ROLES}. */
export type AudioRole = (typeof AUDIO_ROLES)[number];

/**
 * A clip places a slice of an asset ([in, out] in source seconds) on the
 * timeline at `start` (timeline seconds). `fadeIn` / `fadeOut` are the lengths,
 * in seconds, of a fade from/to black (and silence) at the clip's edges.
 *
 * `role`, `loop` and `length` are used only by clips on the audio track (`a1`), where clips are
 * placed freely (they may overlap and leave gaps): `length` is how long the clip lasts on the
 * timeline, and with `loop` the slice [in, out] repeats to fill it. On the main track they are ignored.
 */
export const ClipSchema = z.object({
  id: IdSchema,
  assetId: IdSchema,
  start: z.number().finite().nonnegative(),
  in: z.number().finite().nonnegative(),
  out: z.number().finite().positive(),
  volume: z.number().finite().nonnegative().default(1),
  fadeIn: z.number().finite().nonnegative().default(0),
  fadeOut: z.number().finite().nonnegative().default(0),
  role: z.enum(AUDIO_ROLES).optional(),
  loop: z.boolean().optional(),
  length: z.number().finite().positive().optional(),
});
/** A validated {@link ClipSchema} value. */
export type Clip = z.infer<typeof ClipSchema>;

/** An ordered lane of clips. The main video track (`v1`) is gapless; the optional audio track (`a1`) is free-form. */
export const TrackSchema = z.object({
  id: IdSchema,
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
  fontSize: z.number().finite().min(8).max(400).default(64),
  color: HexColorSchema.default("#ffffff"),
  bold: z.boolean().default(false),
  /** Optional background box behind the text; `opacity` runs from 0 (clear) to 1 (solid). */
  box: z.object({ color: HexColorSchema, opacity: z.number().finite().min(0).max(1) }).optional(),
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
  id: IdSchema,
  kind: z.literal("text"),
  start: z.number().finite().nonnegative(),
  duration: z.number().finite().positive(),
  text: z.string().min(1).max(280),
  /** Optional second, smaller line (used by lower-thirds). */
  subtitle: z.string().max(280).optional(),
  preset: z.string().default("custom"),
  animation: z.enum(ANIMATIONS).default("fade"),
  style: OverlayStyleSchema.default({}),
  lane: z.number().finite().int().nonnegative().default(0),
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
  start: z.number().finite().nonnegative(),
  duration: z.number().finite().positive(),
  fromScale: z.number().finite().min(1).max(MAX_ZOOM),
  toScale: z.number().finite().min(1).max(MAX_ZOOM),
  ease: z.enum(EASES).default("ease-in-out"),
  x: z.number().finite().min(0).max(1).default(0.5),
  y: z.number().finite().min(0).max(1).default(0.5),
});
/** A validated {@link ZoomSchema} value. */
export type Zoom = z.infer<typeof ZoomSchema>;

/** Where an image overlay (logo, watermark, sticker) sits on the frame. Corners keep a margin from the edges. */
export const IMAGE_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top",
  "bottom",
  "center",
] as const;
/** One of {@link IMAGE_POSITIONS}. */
export type ImagePosition = (typeof IMAGE_POSITIONS)[number];

/** Entrance and exit motions for images: the text animations without `typewriter`, which has no meaning for a picture. */
export const IMAGE_ANIMATIONS = ["none", "fade", "slide-up", "slide-left", "pop"] as const;
/** One of {@link IMAGE_ANIMATIONS}. */
export type ImageAnimation = (typeof IMAGE_ANIMATIONS)[number];

/**
 * A picture (logo, watermark, sticker) drawn over the video between `start` and `start + duration`
 * (timeline seconds). `width` is a fraction of the frame width (the height follows the picture's shape),
 * `opacity` runs from 0 (clear) to 1 (solid). `preset` records which built-in preset created it (informational).
 */
export const ImageOverlaySchema = z.object({
  id: z.string(),
  kind: z.literal("image"),
  assetId: z.string(),
  start: z.number().finite().nonnegative(),
  duration: z.number().finite().positive(),
  position: z.enum(IMAGE_POSITIONS).default("top-right"),
  width: z.number().finite().min(0.02).max(1).default(0.15),
  opacity: z.number().finite().min(0).max(1).default(1),
  animation: z.enum(IMAGE_ANIMATIONS).default("fade"),
  preset: z.string().default("custom"),
});
/** A validated {@link ImageOverlaySchema} value. */
export type ImageOverlay = z.infer<typeof ImageOverlaySchema>;

/**
 * How music is lowered while someone speaks on the main track. `amountDb` is roughly how many decibels
 * quieter the music gets under speech; `releaseSeconds` is how long it takes to come back up afterwards.
 */
export const DuckingSchema = z.object({
  enabled: z.boolean().default(true),
  amountDb: z.number().finite().min(3).max(30).default(12),
  releaseSeconds: z.number().finite().min(0.05).max(3).default(0.4),
});
/** A validated {@link DuckingSchema} value. */
export type Ducking = z.infer<typeof DuckingSchema>;

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
  maxWords: z.number().finite().int().min(1).max(8).default(4),
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
  /** Frame size in pixels, 16 to 8192: a hostile project file must not ask FFmpeg for a billion-pixel frame. */
  width: z.number().finite().int().min(16).max(8192),
  height: z.number().finite().int().min(16).max(8192),
  /** Frames per second, 1 to 240. */
  fps: z.number().finite().min(1).max(240),
  /** How clips are fitted into the frame. `contain` leaves bars, `cover` crops to fill, `blur` puts a blurred copy behind. */
  fit: z.enum(FITS).default("contain"),
  tracks: z.array(TrackSchema),
  overlays: z.array(OverlaySchema).default([]),
  /** Punch-ins and push-ins on the finished picture. Absent means none. */
  zooms: z.array(ZoomSchema).optional(),
  /** Pictures (logos, watermarks, stickers) over the video. Absent means none. */
  images: z.array(ImageOverlaySchema).optional(),
  /** How music ducks under speech. Absent means the defaults ({@link DuckingSchema}). */
  ducking: DuckingSchema.optional(),
  /** Present when captions are on. */
  captions: CaptionSettingsSchema.optional(),
});
/** A validated {@link TimelineSchema} value. */
export type Timeline = z.infer<typeof TimelineSchema>;

/** The saved project file: assets plus a timeline. `version` lets future releases migrate old files. */
export const ProjectSchema = z
  .object({
    version: z.literal(1),
    name: z.string(),
    assets: z.record(z.string(), AssetSchema),
    timeline: TimelineSchema,
  })
  .superRefine((project, ctx) => {
    // Overlay ids must be unique: they name things in the UI and commands, and a duplicate would make edits hit the wrong overlay.
    const seen = new Set<string>();
    project.timeline.overlays.forEach((o, i) => {
      if (seen.has(o.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["timeline", "overlays", i, "id"],
          message: `duplicate overlay id "${o.id}"`,
        });
      }
      seen.add(o.id);
    });
  });
/** A validated {@link ProjectSchema} value. Treated as immutable: edits return a new project. */
export type Project = z.infer<typeof ProjectSchema>;

/** A half-open time range in seconds. */
export interface Range {
  start: number;
  end: number;
}
