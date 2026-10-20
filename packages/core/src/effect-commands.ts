// The registry commands for the effects layers: zooms (add_zoom, update_zoom, remove_zoom), music and sound effects
// (add_audio, update_audio, remove_audio, set_ducking) and image overlays (add_image_overlay, update_image_overlay,
// remove_image_overlay). Kept out of commands.ts to keep that file readable; commands.ts appends EFFECT_COMMANDS to COMMANDS.
// This file imports only TYPES from commands.ts, so wiring it in creates no import cycle. Descriptions are read by
// small language models: short, plain, one example at most. The add_* commands are safe to repeat: the same range
// (zoom) or the same file at the same time (audio, image) updates the existing item instead of adding a second one.

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { type ZodTypeAny, z } from "zod";
import {
  addAudioClip,
  audioClipEnd,
  audioClipFrom,
  audioClipLength,
  audioClips,
  DEFAULT_MUSIC_VOLUME,
  duckingOf,
  isAudioSource,
  removeAudioClip,
  setDucking,
  updateAudioClip,
} from "./audio-layer.js";
import type { CommandContext, CommandDef, CommandResult } from "./commands.js";
import { checkAllowedPath } from "./connector.js";
import { newId } from "./ids.js";
import {
  addImageOverlay,
  getImagePreset,
  IMAGE_PRESETS,
  imageOverlayFromPreset,
  imagesOf,
  removeImageOverlay,
  updateImageOverlay,
} from "./image-overlays.js";
import { probe } from "./media.js";
import {
  type Asset,
  AUDIO_ROLES,
  EASES,
  IMAGE_ANIMATIONS,
  IMAGE_POSITIONS,
  MAX_ZOOM,
  type Project,
} from "./schema.js";
import { addAsset, ownAsset, timelineDuration } from "./timeline.js";
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

/**
 * Find or import the file a command refers to. `assetId` uses a known asset; `path` opens a file (inside the
 * allowed folders) and reuses the asset if that file was imported before. `accept` says what the command needs.
 * Returns the asset and whether it still has to be added to the project. Throws an error with a plain message
 * for a missing file, a path outside the allowed folders, or a file of the wrong kind.
 */
export async function resolveMediaAsset(
  ctx: CommandContext,
  args: { path?: string | undefined; assetId?: string | undefined },
  accept: "audio" | "image",
): Promise<{ asset: Asset; isNew: boolean }> {
  const project = ctx.session.project;
  const what = accept === "audio" ? "a music or sound file" : "a picture (PNG or JPG)";
  if (args.assetId && args.path) throw new Error("Give either path or assetId, not both.");
  if (!args.assetId && !args.path) throw new Error(`Give a path to ${what}, or an assetId.`);
  let asset: Asset | undefined;
  let isNew = false;
  if (args.assetId) {
    asset = ownAsset(project, args.assetId);
    if (!asset) throw new Error(`Unknown asset "${args.assetId}". Call get_project to see assets.`);
  } else if (args.path) {
    const abs = await checkAllowedPath(args.path, ctx);
    asset = Object.values(project.assets).find((a) => a.path === abs);
    if (!asset) {
      if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
      asset = await probe(abs);
      isNew = true;
    }
  }
  if (!asset) throw new Error(`Give a path to ${what}, or an assetId.`);
  const ok = accept === "audio" ? isAudioSource(asset) : asset.kind === "image";
  if (!ok) {
    const found = asset.kind === "video" && !asset.hasAudio ? "a video with no sound" : asset.kind;
    throw new Error(`${basename(asset.path)} is ${found}; this needs ${what}.`);
  }
  return { asset, isNew };
}

/** Add `asset` to the project unless it is already there. */
const withAsset = (p: Project, asset: Asset): Project =>
  ownAsset(p, asset.id) ? p : addAsset(p, asset);

const startArg = (what: string) =>
  z.number().finite().min(0).describe(`${what}, in seconds on the timeline`);

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
  scale: z.number().finite().min(1.02).max(MAX_ZOOM).optional().describe("New zoom amount"),
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

// ---------------------------------------------------------------------------------------------
// Music and sound effects
// ---------------------------------------------------------------------------------------------

const volumeArg = z
  .number()
  .min(0)
  .max(2)
  .optional()
  .describe(`Loudness: 1 = as recorded. Music defaults to ${DEFAULT_MUSIC_VOLUME}, effects to 1.`);

const addAudioSchema = z.object({
  path: z.string().min(1).optional().describe("Full path of a music or sound file to import"),
  assetId: z.string().optional().describe("Or an audio asset that is already imported"),
  role: z
    .enum(AUDIO_ROLES)
    .default("music")
    .describe("music is lowered under speech automatically; sfx is a short sound that is not"),
  start: startArg("Where it starts").default(0),
  length: z
    .number()
    .positive()
    .optional()
    .describe(
      "How long it plays, in seconds. Default: the whole file, or the rest of the video when loop is true.",
    ),
  loop: z.boolean().default(false).describe("Repeat the file to fill length (music beds)"),
  sourceStart: z
    .number()
    .finite()
    .min(0)
    .optional()
    .describe("Start this far into the file, in seconds"),
  volume: volumeArg,
  fadeIn: z
    .number()
    .finite()
    .min(0)
    .max(60)
    .optional()
    .describe("Fade in, seconds (music default 1)"),
  fadeOut: z
    .number()
    .finite()
    .min(0)
    .max(60)
    .optional()
    .describe("Fade out, seconds (music default 2)"),
});

const updateAudioSchema = z.object({
  audioId: z.string().describe("Audio clip id from get_project"),
  start: startArg("New start").optional(),
  length: z.number().finite().positive().optional().describe("New length in seconds"),
  sourceStart: z.number().finite().min(0).optional().describe("Start this far into the file"),
  loop: z.boolean().optional().describe("Repeat the file to fill the length"),
  role: z.enum(AUDIO_ROLES).optional().describe("music ducks under speech; sfx does not"),
  volume: volumeArg,
  fadeIn: z.number().finite().min(0).max(60).optional().describe("Fade in, seconds"),
  fadeOut: z.number().finite().min(0).max(60).optional().describe("Fade out, seconds"),
});

const duckingSchema = z.object({
  enabled: z.boolean().optional().describe("false stops music dropping under speech"),
  amountDb: z
    .number()
    .min(3)
    .max(30)
    .optional()
    .describe("About how many dB quieter the music gets while someone speaks (default 12)"),
  releaseSeconds: z
    .number()
    .min(0.05)
    .max(3)
    .optional()
    .describe("How long the music takes to come back up afterwards (default 0.4)"),
});

const audioCommands: CommandDef[] = [
  define({
    name: "add_audio",
    description:
      "Add background music or a sound effect from an audio file (path or assetId). Music is lowered automatically while someone speaks (see set_ducking). Times are timeline seconds. For a bed under the whole video use loop true; for a whoosh at 12s use role sfx, start 12. Safe to repeat: the same file at the same start is updated.",
    schema: addAudioSchema,
    async run(ctx, a) {
      const { asset, isNew } = await resolveMediaAsset(ctx, a, "audio");
      const project = ctx.session.project;
      const total = timelineDuration(project);
      let length = a.length;
      if (length === undefined && a.loop) {
        if (total - a.start < 0.1) {
          throw new Error("There is no video after that start to fill. Give a length.");
        }
        length = total - a.start;
      }
      const sourceEnd = asset.duration;
      const sliceLength = sourceEnd - (a.sourceStart ?? 0);
      const longest = a.loop
        ? (length ?? sliceLength)
        : Math.min(length ?? sliceLength, sliceLength);
      const music = a.role === "music";
      // Default fades for music, kept short enough to fit a short clip.
      const fadeIn = a.fadeIn ?? (music ? Math.min(1, longest * 0.4) : 0);
      const fadeOut = a.fadeOut ?? (music ? Math.min(2, longest * 0.4) : 0);
      const clip = audioClipFrom({
        assetId: asset.id,
        start: a.start,
        role: a.role,
        ...(a.sourceStart !== undefined ? { sourceStart: a.sourceStart } : {}),
        ...(length !== undefined ? { length } : {}),
        loop: a.loop,
        ...(a.volume !== undefined ? { volume: a.volume } : {}),
        fadeIn,
        fadeOut,
        assetDuration: asset.duration,
      });
      const existing = audioClips(project).find(
        (c) =>
          c.assetId === asset.id &&
          (c.role ?? "music") === a.role &&
          Math.abs(c.start - a.start) < SAME_RANGE_TOLERANCE,
      );
      const changed = existing
        ? await editIfChanged(ctx, "Update audio", (p) =>
            updateAudioClip(p, existing.id, {
              start: clip.start,
              in: clip.in,
              out: clip.out,
              length: clip.length ?? clip.out - clip.in,
              loop: clip.loop,
              volume: clip.volume,
              fadeIn: clip.fadeIn,
              fadeOut: clip.fadeOut,
            }),
          )
        : await editIfChanged(ctx, `Add ${a.role === "music" ? "music" : "sound effect"}`, (p) =>
            addAudioClip(isNew ? withAsset(p, asset) : p, clip),
          );
      const id = existing?.id ?? clip.id;
      const placed = audioClips(ctx.session.project).find((c) => c.id === id);
      const len = placed ? audioClipLength(placed) : longest;
      const ducks = music && duckingOf(ctx.session.project).enabled;
      return {
        summary: `${existing ? "Updated" : "Added"} ${music ? "music" : "a sound effect"} "${basename(asset.path)}" from ${fmt(a.start)} for ${fmt(len)}${ducks ? "; it will drop under speech" : ""}.${changed ? "" : NOTHING_CHANGED}`,
        data: { audioId: id, assetId: asset.id },
      };
    },
  }),

  define({
    name: "update_audio",
    description:
      "Change a music or sound-effect clip: when it starts, how long it plays, loudness, fades, looping. Only the fields you give change. Use get_project to find audio ids.",
    schema: updateAudioSchema,
    async run(ctx, a) {
      const patch: Parameters<typeof updateAudioClip>[2] = {};
      if (a.start !== undefined) patch.start = a.start;
      if (a.length !== undefined) patch.length = a.length;
      if (a.sourceStart !== undefined) patch.in = a.sourceStart;
      if (a.loop !== undefined) patch.loop = a.loop;
      if (a.role !== undefined) patch.role = a.role;
      if (a.volume !== undefined) patch.volume = a.volume;
      if (a.fadeIn !== undefined) patch.fadeIn = a.fadeIn;
      if (a.fadeOut !== undefined) patch.fadeOut = a.fadeOut;
      await edit(ctx, "Update audio", (p) => updateAudioClip(p, a.audioId, patch));
      return { summary: "Audio updated." };
    },
  }),

  define({
    name: "remove_audio",
    description: "Delete a music or sound-effect clip. Use get_project to find audio ids.",
    schema: z.object({ audioId: z.string() }),
    async run(ctx, a) {
      await edit(ctx, "Remove audio", (p) => removeAudioClip(p, a.audioId));
      return { summary: "Audio removed." };
    },
  }),

  define({
    name: "set_ducking",
    description:
      "Control how music drops while someone speaks on the main track: on or off, how deep (dB), how fast it comes back. Applies to all music; sound effects are never lowered.",
    schema: duckingSchema,
    async run(ctx, a) {
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      await edit(ctx, "Set ducking", (p) => setDucking(p, patch));
      const d = duckingOf(ctx.session.project);
      const hasMusic = audioClips(ctx.session.project).some((c) => (c.role ?? "music") === "music");
      return {
        summary: `${
          d.enabled
            ? `Ducking on: music drops about ${d.amountDb} dB under speech and recovers in ${d.releaseSeconds}s.`
            : "Ducking off: music keeps its level under speech."
        }${hasMusic ? "" : " There is no music yet; this applies once you add some."}`,
      };
    },
  }),
];

// ---------------------------------------------------------------------------------------------
// Image overlays
// ---------------------------------------------------------------------------------------------

const imagePresetIds = IMAGE_PRESETS.map((p) => p.id) as [string, ...string[]];

const imageFields = {
  position: z.enum(IMAGE_POSITIONS).optional().describe("Where it sits on the frame"),
  width: z
    .number()
    .min(0.02)
    .max(1)
    .optional()
    .describe("Width as a fraction of the frame, e.g. 0.15 = 15%"),
  opacity: z.number().finite().min(0).max(1).optional().describe("0 clear to 1 solid"),
  animation: z.enum(IMAGE_ANIMATIONS).optional().describe("How it enters and leaves"),
};

const addImageSchema = z.object({
  path: z.string().min(1).optional().describe("Full path of a PNG or JPG file to import"),
  assetId: z.string().optional().describe("Or a picture that is already imported"),
  preset: z
    .enum(imagePresetIds)
    .default("logo-corner")
    .describe(
      "logo-corner (small, top-right, stays), watermark (faint, bottom-right, stays), sticker-pop (centre, pops in), logo-end-card (big, centre), bug-slide (bottom-left, slides in)",
    ),
  start: startArg("When it appears").default(0),
  duration: z
    .number()
    .min(0.2)
    .max(3600)
    .optional()
    .describe("How long it stays. logo-corner and watermark default to the rest of the video."),
  ...imageFields,
});

const imageCommands: CommandDef[] = [
  define({
    name: "add_image_overlay",
    description:
      "Put a picture (logo, watermark, sticker; PNG or JPG with a path or assetId) over the video. Pick a preset, then adjust position, width, opacity, start and duration. Times are timeline seconds. Safe to repeat: the same picture at the same start is updated.",
    schema: addImageSchema,
    async run(ctx, a) {
      const { asset, isNew } = await resolveMediaAsset(ctx, a, "image");
      const project = ctx.session.project;
      const total = timelineDuration(project);
      if (total > 0 && a.start >= total - 1e-3) {
        throw new Error(
          `The video is only ${fmt(total)} long; the picture would start after the end.`,
        );
      }
      const image = imageOverlayFromPreset(a.preset, {
        assetId: asset.id,
        start: a.start,
        total,
        ...(a.duration !== undefined ? { duration: a.duration } : {}),
        ...(a.position ? { position: a.position } : {}),
        ...(a.width !== undefined ? { width: a.width } : {}),
        ...(a.opacity !== undefined ? { opacity: a.opacity } : {}),
        ...(a.animation ? { animation: a.animation } : {}),
      });
      const existing = imagesOf(project).find(
        (o) => o.assetId === asset.id && Math.abs(o.start - a.start) < SAME_RANGE_TOLERANCE,
      );
      const changed = existing
        ? await editIfChanged(ctx, "Update image overlay", (p) =>
            updateImageOverlay(p, existing.id, {
              start: image.start,
              duration: image.duration,
              position: image.position,
              width: image.width,
              opacity: image.opacity,
              animation: image.animation,
            }),
          )
        : await editIfChanged(ctx, `Add ${getImagePreset(a.preset)?.label ?? "image"}`, (p) =>
            addImageOverlay(isNew ? withAsset(p, asset) : p, image),
          );
      return {
        summary: `${existing ? "Updated" : "Added"} "${basename(asset.path)}" at ${fmt(image.start)} for ${fmt(image.duration)} (${image.position}).${changed ? "" : NOTHING_CHANGED}`,
        data: { imageId: existing?.id ?? image.id, assetId: asset.id },
      };
    },
  }),

  define({
    name: "update_image_overlay",
    description:
      "Change a picture overlay's timing, position, size, opacity or animation. Only the fields you give change. Use get_project to find image ids.",
    schema: z.object({
      imageId: z.string().describe("Image overlay id from get_project"),
      start: startArg("New start").optional(),
      duration: z
        .number()
        .finite()
        .min(0.2)
        .max(3600)
        .optional()
        .describe("New length, in seconds"),
      ...imageFields,
    }),
    async run(ctx, a) {
      const { imageId, ...rest } = a;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      await edit(ctx, "Update image overlay", (p) => updateImageOverlay(p, imageId, patch));
      return { summary: "Image overlay updated." };
    },
  }),

  define({
    name: "remove_image_overlay",
    description: "Delete a picture overlay. Use get_project to find image ids.",
    schema: z.object({ imageId: z.string() }),
    async run(ctx, a) {
      await edit(ctx, "Remove image overlay", (p) => removeImageOverlay(p, a.imageId));
      return { summary: "Image overlay removed." };
    },
  }),
];

/** The effects commands: zoom, audio layer and image overlays. Append them to `COMMANDS`. */
export const EFFECT_COMMANDS: readonly CommandDef[] = [
  ...zoomCommands,
  ...audioCommands,
  ...imageCommands,
];

/**
 * The zooms, audio clips, images and ducking of a project in the compact form `get_project` shows. Times are rounded
 * to milliseconds and asset paths are reduced to file names. The lists are paged by `offset` and `limit` (like the
 * clips and overlays), and the full counts are returned too so the caller can say what is left.
 */
export function describeEffects(p: Project, offset = 0, limit = Number.POSITIVE_INFINITY) {
  const r = (x: number) => Number(x.toFixed(3));
  const zooms = zoomsOf(p);
  const audio = audioClips(p);
  const images = imagesOf(p);
  const page = <T>(xs: T[]): T[] => xs.slice(offset, offset + limit);
  return {
    zoomCount: zooms.length,
    audioCount: audio.length,
    imageCount: images.length,
    zooms: page(zooms).map((z) => ({
      id: z.id,
      start: r(z.start),
      end: r(zoomEnd(z)),
      fromScale: z.fromScale,
      toScale: z.toScale,
      ease: z.ease,
      x: z.x,
      y: z.y,
    })),
    audio: page(audio).map((c) => ({
      id: c.id,
      assetId: c.assetId,
      file: basename(p.assets[c.assetId]?.path ?? ""),
      role: c.role ?? "music",
      start: r(c.start),
      end: r(audioClipEnd(c)),
      volume: c.volume,
      fadeIn: c.fadeIn,
      fadeOut: c.fadeOut,
      loop: c.loop ?? false,
    })),
    images: page(images).map((o) => ({
      id: o.id,
      assetId: o.assetId,
      file: basename(p.assets[o.assetId]?.path ?? ""),
      start: r(o.start),
      end: r(o.start + o.duration),
      position: o.position,
      width: o.width,
      opacity: o.opacity,
      animation: o.animation,
      preset: o.preset,
    })),
    ducking: duckingOf(p),
  };
}
