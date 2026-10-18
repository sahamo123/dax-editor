// The data model for projects, timelines, tracks, clips and assets (zod schemas and types). Declarations only, no logic.

import { z } from "zod";

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
});
/** A validated {@link AssetSchema} value. */
export type Asset = z.infer<typeof AssetSchema>;

/**
 * A clip places a slice of an asset ([in, out] in source seconds) on the
 * timeline at `start` (timeline seconds).
 */
export const ClipSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  start: z.number().nonnegative(),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  volume: z.number().nonnegative().default(1),
});
/** A validated {@link ClipSchema} value. */
export type Clip = z.infer<typeof ClipSchema>;

/** An ordered lane of clips. v0.1 only edits the single main video track ({@link MAIN_TRACK}). */
export const TrackSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio"]),
  clips: z.array(ClipSchema),
});
/** A validated {@link TrackSchema} value. */
export type Track = z.infer<typeof TrackSchema>;

/** Output format (`width`, `height`, `fps`) plus the tracks that make up the edit. */
export const TimelineSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  tracks: z.array(TrackSchema),
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
