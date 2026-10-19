// The registry commands for the effects layers: zooms (add_zoom, update_zoom, remove_zoom), music and sound effects
// (add_audio, update_audio, remove_audio, set_ducking) and image overlays (add_image_overlay, update_image_overlay,
// remove_image_overlay). Kept out of commands.ts to keep that file readable; commands.ts appends EFFECT_COMMANDS to COMMANDS.
// This file imports only TYPES from commands.ts, so wiring it in creates no import cycle. Descriptions are read by
// small language models: short, plain, one example at most. The add_* commands are safe to repeat: the same range
// (zoom) or the same file at the same time (audio, image) updates the existing item instead of adding a second one.

import { type ZodTypeAny, z } from "zod";
import type { CommandContext, CommandDef, CommandResult } from "./commands.js";
import { newId } from "./ids.js";
import { EASES, MAX_ZOOM, type Project } from "./schema.js";
import { timelineDuration } from "./timeline.js";
import {
  addZoom,
  removeZoom,
  SAME_RANGE_TOLERANCE,
  updateZoom,
  type ZoomPatch,
  zoomEnd,
  zoomFromStyle,
  zoomsOf,
} from "./zoom.js";

const fmt = (x: number) => `${Number(x.toFixed(2))}s`;

/** Define a command with the argument type inferred from its schema. */
function define<S extends ZodTypeAny>(d: {
  name: string;
  description: string;
  schema: S;
  run: (ctx: CommandContext, args: z.infer<S>) => Promise<CommandResult>;
}): CommandDef {
  return {
    name: d.name,
    description: d.description,
    schema: d.schema,
    readOnly: false,
    irreversible: false,
    run: d.run as CommandDef["run"],
  };
}

/** Apply an edit to the session with a label for the history. */
async function edit(ctx: CommandContext, label: string, fn: (p: Project) => Project) {
  await ctx.session.apply(fn, { label, source: ctx.source ?? "manual" });
}

/**
 * Like {@link edit}, but does nothing (and adds no history entry) when the result equals the current project.
 * This is what makes the `add_*` commands safe to repeat. Returns whether anything changed.
 */
async function editIfChanged(
  ctx: CommandContext,
  label: string,
  fn: (p: Project) => Project,
): Promise<boolean> {
  const before = ctx.session.project;
  if (JSON.stringify(fn(before)) === JSON.stringify(before)) return false;
  await edit(ctx, label, fn);
  return true;
}

const NOTHING_CHANGED = " It was already like this, so nothing changed.";

const startArg = (what: string) =>
  z.number().min(0).describe(`${what}, in seconds on the timeline`);

// ---------------------------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------------------------

const easeArg = z
  .enum(EASES)
  .optional()
  .describe("How the zoom moves: linear, ease-in, ease-out or ease-in-out (default, smooth)");
const focusArg = (axis: string) =>
  z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(`${axis} of the point to keep in view, 0 to 1 (0.5 = centre)`);

const addZoomSchema = z.object({
  start: startArg("When the zoom starts"),
  end: startArg("When the zoom ends"),
  scale: z
    .number()
    .min(1.02)
    .max(MAX_ZOOM)
    .default(1.15)
    .describe("How much closer: 1.15 = 15% closer, 1.25 = 25%. Punch-ins usually use 1.1 to 1.25."),
  style: z
    .enum(["punch-in", "push-in"])
    .default("punch-in")
    .describe(
      "punch-in jumps to the zoom and holds it; push-in glides slowly from normal to the zoom",
    ),
  startScale: z
    .number()
    .min(1)
    .max(MAX_ZOOM)
    .optional()
    .describe("Advanced: begin at this zoom instead (a push-in begins at 1)"),
  ease: easeArg,
  x: focusArg("Horizontal position"),
  y: focusArg("Vertical position"),
});

const updateZoomSchema = z.object({
  zoomId: z.string().describe("Zoom id from get_project"),
  start: startArg("New start").optional(),
  end: startArg("New end").optional(),
  scale: z.number().min(1.02).max(MAX_ZOOM).optional().describe("New zoom amount"),
  startScale: z
    .number()
    .min(1)
    .max(MAX_ZOOM)
    .optional()
    .describe("Advanced: the zoom it begins at (1 makes it a push-in)"),
  ease: easeArg,
  x: focusArg("Horizontal position"),
  y: focusArg("Vertical position"),
});

const zoomCommands: CommandDef[] = [
  define({
    name: "add_zoom",
    description:
      "Zoom in on the picture for part of the video (times are timeline seconds). Use style punch-in with scale 1.1 to 1.25 for emphasis on a talking head; push-in for a slow glide. Safe to repeat: the same time range is updated, not doubled.",
    schema: addZoomSchema,
    async run(ctx, a) {
      if (a.end <= a.start) throw new Error("The zoom must end after it starts.");
      const total = timelineDuration(ctx.session.project);
      if (a.start >= total - 1e-3) {
        throw new Error(`The video is only ${fmt(total)} long; the zoom starts after the end.`);
      }
      const existing = zoomsOf(ctx.session.project).find(
        (z) =>
          Math.abs(z.start - a.start) < SAME_RANGE_TOLERANCE &&
          Math.abs(zoomEnd(z) - a.end) < SAME_RANGE_TOLERANCE,
      );
      const zoom = zoomFromStyle({
        id: existing?.id ?? newId("zoom"),
        start: a.start,
        duration: a.end - a.start,
        scale: a.scale,
        style: a.style,
        ...(a.startScale !== undefined ? { startScale: a.startScale } : {}),
        ...(a.ease ? { ease: a.ease } : {}),
        ...(a.x !== undefined ? { x: a.x } : {}),
        ...(a.y !== undefined ? { y: a.y } : {}),
      });
      const changed = existing
        ? await editIfChanged(ctx, "Update zoom", (p) =>
            updateZoom(p, zoom.id, {
              start: zoom.start,
              duration: zoom.duration,
              fromScale: zoom.fromScale,
              toScale: zoom.toScale,
              ease: zoom.ease,
              x: zoom.x,
              y: zoom.y,
            }),
          )
        : await editIfChanged(ctx, "Add zoom", (p) => addZoom(p, zoom));
      const kind = zoom.fromScale === zoom.toScale ? "punch-in" : "push-in";
      return {
        summary: `${existing ? "Updated the" : "Added a"} ${kind} to ${zoom.toScale}x from ${fmt(a.start)} to ${fmt(a.end)}.${changed ? "" : NOTHING_CHANGED}`,
        data: { zoomId: zoom.id },
      };
    },
  }),

  define({
    name: "update_zoom",
    description:
      "Change a zoom's time range, amount, easing or focus point. Only the fields you give change. Use get_project to find zoom ids.",
    schema: updateZoomSchema,
    async run(ctx, a) {
      const current = zoomsOf(ctx.session.project).find((z) => z.id === a.zoomId);
      if (!current) throw new Error(`Unknown zoom "${a.zoomId}". Call get_project to see zooms.`);
      const start = a.start ?? current.start;
      const end = a.end ?? zoomEnd(current);
      if (end <= start) throw new Error("The zoom must end after it starts.");
      const patch: ZoomPatch = { start, duration: end - start };
      if (a.scale !== undefined) {
        patch.toScale = a.scale;
        // A hold stays a hold when its amount changes.
        if (a.startScale === undefined && current.fromScale === current.toScale) {
          patch.fromScale = a.scale;
        }
      }
      if (a.startScale !== undefined) patch.fromScale = a.startScale;
      if (a.ease !== undefined) patch.ease = a.ease;
      if (a.x !== undefined) patch.x = a.x;
      if (a.y !== undefined) patch.y = a.y;
      await edit(ctx, "Update zoom", (p) => updateZoom(p, a.zoomId, patch));
      return { summary: "Zoom updated." };
    },
  }),

  define({
    name: "remove_zoom",
    description: "Delete a zoom. Use get_project to find zoom ids.",
    schema: z.object({ zoomId: z.string() }),
    async run(ctx, a) {
      await edit(ctx, "Remove zoom", (p) => removeZoom(p, a.zoomId));
      return { summary: "Zoom removed." };
    },
  }),
];

/** The effects commands: zoom, audio layer and image overlays. Append them to `COMMANDS`. */
export const EFFECT_COMMANDS: readonly CommandDef[] = [...zoomCommands];

/**
 * The zooms of a project in the compact form `get_project` shows. Times are rounded to milliseconds.
 */
export function describeEffects(p: Project) {
  const r = (x: number) => Number(x.toFixed(3));
  return {
    zooms: zoomsOf(p).map((z) => ({
      id: z.id,
      start: r(z.start),
      end: r(zoomEnd(z)),
      fromScale: z.fromScale,
      toScale: z.toScale,
      ease: z.ease,
      x: z.x,
      y: z.y,
    })),
  };
}
