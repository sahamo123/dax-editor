// Schemas for eval tasks and their pass/fail checks.

import { z } from "zod";

/**
 * One pass/fail condition on the finished edit. Checks look at the result,
 * never at how the model got there, so different models and strategies can be
 * compared fairly.
 */
export const CheckSchema = z.discriminatedUnion("type", [
  /** Timeline length in seconds must fall within [min, max]. */
  z.object({ type: z.literal("duration"), min: z.number(), max: z.number() }),
  /** Number of clips on the main track must fall within the given bounds. */
  z.object({
    type: z.literal("clipCount"),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  /** Rendering the edit must produce no silent stretch of `seconds` or longer. */
  z.object({ type: z.literal("noSilenceLongerThan"), seconds: z.number().positive() }),
  /**
   * Seconds of the rendered sound that carry a steady tone at `hz` must fall within [min, max]. Each 20 ms window counts
   * when its tone is at least `minDb` dBFS (peak). Used to check that a music bed was not cut out with the pauses.
   */
  z.object({
    type: z.literal("toneSeconds"),
    hz: z.number().positive(),
    minDb: z.number().max(0).default(-40),
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
  }),
  /**
   * Share of word-tail energy that the edit removes (`clippedTailRatio` in core), at most `max` (0 to 1). Needs a
   * transcript on the edited asset, so the fixture must have one.
   */
  z.object({ type: z.literal("clippedTail"), max: z.number().min(0).max(1) }),
  /**
   * The rendered video and audio must end within `maxFrames` frames of each other (end = start + duration of each
   * stream). The frame is the project's frame rate. This is the drift check after many joins.
   */
  z.object({ type: z.literal("avSync"), maxFrames: z.number().nonnegative() }),
  /**
   * Every listed range of the edited asset (source seconds) must be kept: the edit must contain its footage, to within
   * 20 ms at each end. Used to check that a proposed removal (a retake) was not applied silently.
   */
  z.object({
    type: z.literal("sourceKept"),
    ranges: z
      .array(z.object({ start: z.number().nonnegative(), end: z.number().positive() }))
      .min(1),
  }),
]);
/** A validated {@link CheckSchema} value. */
export type Check = z.infer<typeof CheckSchema>;

/** Names of the synthetic footage that {@link generateFixture} can create. */
export const FIXTURE_NAMES = [
  "tone-silence-tone",
  "music-bed",
  "word-tails",
  "sixty-joins",
  "retake-takes",
] as const;
/** One of {@link FIXTURE_NAMES}. */
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/**
 * A single evaluation case: footage, a plain-language request, and the checks
 * that decide whether the request was fulfilled.
 */
export const EvalTaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  fixture: z.enum(FIXTURE_NAMES),
  /** What the user types into the chat box. */
  prompt: z.string(),
  /** Upper bound on model turns so a confused model cannot loop forever. */
  maxTurns: z.number().int().positive().default(8),
  checks: z.array(CheckSchema).min(1),
  tags: z.array(z.string()).default([]),
});
/** A validated {@link EvalTaskSchema} value. */
export type EvalTask = z.infer<typeof EvalTaskSchema>;
