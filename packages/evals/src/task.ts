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
]);
/** A validated {@link CheckSchema} value. */
export type Check = z.infer<typeof CheckSchema>;

/** Names of the synthetic footage that {@link generateFixture} can create. */
export const FIXTURE_NAMES = ["tone-silence-tone"] as const;
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
