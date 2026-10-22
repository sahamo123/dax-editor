// Bounded motion-template contract; rendering implementations run outside the core engine process.
import { z } from "zod";

/** Validated parameters for the three initial Blender templates; no script or command-line input. */
export const MotionRequestSchema = z.object({
  template: z.enum(["title-card", "logo-intro", "text-3d"]),
  text: z.string().trim().min(1).max(160),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6b97ff"),
  duration: z
    .number()
    .finite()
    .min(0.5)
    .max(10)
    .default(3)
    .describe("Duration in timeline seconds"),
  width: z
    .number()
    .int()
    .min(128)
    .max(1920)
    .refine((v) => v % 2 === 0)
    .default(640),
  height: z
    .number()
    .int()
    .min(128)
    .max(1080)
    .refine((v) => v % 2 === 0)
    .default(360),
  fps: z.number().int().min(12).max(30).default(24),
  logoPath: z
    .string()
    .max(4096)
    .optional()
    .describe("User-selected PNG/JPG file for logo-intro only"),
  replaceAssetId: z
    .string()
    .optional()
    .describe("Regenerate an existing Blender asset with matching duration"),
});
/** One validated motion-template request. */
export type MotionRequest = z.infer<typeof MotionRequestSchema>;
/** A separate-process renderer for application-owned motion templates. */
export interface MotionRenderer {
  /** Check availability without starting a render. */
  status(): Promise<{ available: boolean; version?: string; detail: string }>;
  /** Render a validated template to an app-owned video; stop and clean temporary output on cancellation. */
  render(
    request: MotionRequest,
    options: { signal?: AbortSignal; onProgress?: (fraction: number) => void },
  ): Promise<string>;
}
