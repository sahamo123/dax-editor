import { z } from "zod";

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
export type Clip = z.infer<typeof ClipSchema>;

export const TrackSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio"]),
  clips: z.array(ClipSchema),
});
export type Track = z.infer<typeof TrackSchema>;

export const TimelineSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  tracks: z.array(TrackSchema),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  assets: z.record(z.string(), AssetSchema),
  timeline: TimelineSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

/** A half-open time range in seconds. */
export interface Range {
  start: number;
  end: number;
}
