// Image overlays (logos, watermarks, stickers): built-in presets, pure edit operations and the FFmpeg filter
// fragments that draw them. Pictures are drawn after the clips are joined (and after zooms), so a logo stays
// put while the footage punches in. Animations reuse the text overlay vocabulary (fade, slide, pop) with the same timing.

import { newId } from "./ids.js";
import { shiftOverlaysForDelete } from "./overlays.js";
import type { Asset, ImageAnimation, ImageOverlay, ImagePosition, Project } from "./schema.js";
import { ImageOverlaySchema } from "./schema.js";

const EPS = 1e-6;

/** Seconds an image takes to fade or slide in and out. Matches the text overlays. */
const EDGE = 0.4;

/** A ready-made look for a logo, watermark or sticker. Pure data. */
export interface ImagePreset {
  /** Stable id, e.g. `logo-corner`. Saved into overlays as `preset`. */
  id: string;
  /** Name shown in the UI. */
  label: string;
  /** One sentence for tooltips and for the AI to understand when to use it. */
  description: string;
  position: ImagePosition;
  /** Fraction of the frame width. */
  width: number;
  opacity: number;
  animation: ImageAnimation;
  /** Length in seconds when none is given. Ignored when `untilEnd` is true. */
  defaultDuration: number;
  /** True for presets that stay for the whole rest of the video unless a duration is given. */
  untilEnd: boolean;
}

/** All built-in image presets, in the order the UI shows them. */
export const IMAGE_PRESETS: readonly ImagePreset[] = [
  {
    id: "logo-corner",
    label: "Logo: top-right",
    description: "Small logo in the top-right corner that fades in and stays. Good for branding.",
    position: "top-right",
    width: 0.14,
    opacity: 0.95,
    animation: "fade",
    defaultDuration: 5,
    untilEnd: true,
  },
  {
    id: "watermark",
    label: "Watermark: bottom-right",
    description: "Faint logo in the bottom-right corner for the whole video, with no animation.",
    position: "bottom-right",
    width: 0.12,
    opacity: 0.5,
    animation: "none",
    defaultDuration: 5,
    untilEnd: true,
  },
  {
    id: "sticker-pop",
    label: "Sticker: pop",
    description: "Picture in the centre that pops in. Good for emoji, icons or a product shot.",
    position: "center",
    width: 0.3,
    opacity: 1,
    animation: "pop",
    defaultDuration: 2.5,
    untilEnd: false,
  },
  {
    id: "logo-end-card",
    label: "Logo: end card",
    description: "Large centred logo that fades in. Use for the last seconds of a video.",
    position: "center",
    width: 0.35,
    opacity: 1,
    animation: "fade",
    defaultDuration: 3,
    untilEnd: false,
  },
  {
    id: "bug-slide",
    label: "Badge: slide in",
    description:
      "Badge or sticker in the bottom-left that slides in. Good for a sponsor or a link badge.",
    position: "bottom-left",
    width: 0.18,
    opacity: 1,
    animation: "slide-left",
    defaultDuration: 4,
    untilEnd: false,
  },
];

/** Look up an image preset by id, or undefined if there is no such preset. */
export function getImagePreset(id: string): ImagePreset | undefined {
  return IMAGE_PRESETS.find((p) => p.id === id);
}

/** Options for {@link imageOverlayFromPreset}. Anything omitted falls back to the preset's defaults. */
export interface ImageOverlayOptions {
  assetId: string;
  /** Timeline time, in seconds, where the picture appears. */
  start: number;
  /** Length in seconds; for an `untilEnd` preset the default is the rest of `total`. */
  duration?: number;
  /** Length of the timeline in seconds, used to size `untilEnd` presets. */
  total?: number;
  position?: ImagePosition;
  width?: number;
  opacity?: number;
  animation?: ImageAnimation;
}

/**
 * Build a concrete image overlay. `presetId` may be `custom` (the defaults of `logo-corner` without its
 * name). Throws for an unknown preset id. The result is validated.
 */
export function imageOverlayFromPreset(presetId: string, opts: ImageOverlayOptions): ImageOverlay {
  const preset = presetId === "custom" ? getImagePreset("logo-corner") : getImagePreset(presetId);
  if (!preset) throw new Error(`Unknown image preset "${presetId}"`);
  const rest = opts.total !== undefined ? Math.max(0.2, opts.total - opts.start) : undefined;
  const duration =
    opts.duration ?? (preset.untilEnd && rest !== undefined ? rest : preset.defaultDuration);
  return ImageOverlaySchema.parse({
    id: newId("img"),
    kind: "image",
    assetId: opts.assetId,
    start: opts.start,
    duration,
    position: opts.position ?? preset.position,
    width: opts.width ?? preset.width,
    opacity: opts.opacity ?? preset.opacity,
    animation: opts.animation ?? preset.animation,
    preset: presetId,
  });
}

/** The image overlays of a project, earliest first. Empty when it has none. */
export function imagesOf(p: Project): ImageOverlay[] {
  return [...(p.timeline.images ?? [])].sort((a, b) => a.start - b.start);
}

/** Throws unless `asset` is a picture the renderer can draw. */
function requireImage(p: Project, assetId: string): Asset {
  // Own-property check, as ownAsset in timeline.ts: an id such as `__proto__` must not find an inherited value.
  const asset = Object.hasOwn(p.assets, assetId) ? p.assets[assetId] : undefined;
  if (!asset) throw new Error(`Unknown asset "${assetId}"`);
  if (asset.kind !== "image") {
    throw new Error(`Asset ${asset.path} is ${asset.kind}, not a picture (use a PNG or JPG).`);
  }
  return asset;
}

function withImages(p: Project, images: ImageOverlay[]): Project {
  const next = structuredClone(p);
  next.timeline.images = images;
  return next;
}

/** Add a validated image overlay. Throws if its fields are invalid, its id exists, or its asset is not a picture. */
export function addImageOverlay(p: Project, image: ImageOverlay): Project {
  const valid = ImageOverlaySchema.parse(image);
  requireImage(p, valid.assetId);
  const all = p.timeline.images ?? [];
  if (all.some((o) => o.id === valid.id))
    throw new Error(`Image overlay "${valid.id}" already exists`);
  return withImages(p, [...all, valid]);
}

/** Fields of an image overlay that {@link updateImageOverlay} can change. */
export interface ImageOverlayPatch {
  start?: number;
  duration?: number;
  position?: ImagePosition;
  width?: number;
  opacity?: number;
  animation?: ImageAnimation;
}

/** Change an image overlay's timing, position, size, opacity or animation. Throws for an unknown id or invalid values. */
export function updateImageOverlay(p: Project, id: string, patch: ImageOverlayPatch): Project {
  const all = p.timeline.images ?? [];
  const current = all.find((o) => o.id === id);
  if (!current) throw new Error(`Unknown image overlay "${id}"`);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const valid = ImageOverlaySchema.parse({ ...current, ...defined });
  return withImages(
    p,
    all.map((o) => (o.id === id ? valid : o)),
  );
}

/** Remove an image overlay. Throws if it does not exist. */
export function removeImageOverlay(p: Project, id: string): Project {
  const all = p.timeline.images ?? [];
  if (!all.some((o) => o.id === id)) throw new Error(`Unknown image overlay "${id}"`);
  return withImages(
    p,
    all.filter((o) => o.id !== id),
  );
}

/** Keep images attached to the footage they were placed over after the range [from, to) is deleted (same rule as text overlays). */
export function shiftImagesForDelete(
  images: readonly ImageOverlay[],
  from: number,
  to: number,
): ImageOverlay[] {
  return shiftOverlaysForDelete(images, from, to);
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** A number as FFmpeg expression text: fixed precision, no exponent, no trailing zeros. */
const num = (x: number) => Number(x.toFixed(4)).toString();

/** Input options that make FFmpeg read a still picture as a video of `duration` seconds at `fps`. Add `-i <path>` after them. */
export function imageInputArgs(o: ImageOverlay, fps: number): string[] {
  return ["-loop", "1", "-framerate", String(fps), "-t", num(o.duration)];
}

/**
 * Filter fragments that draw one image overlay on a `W`x`H` stream. `imageLabel` is the picture's input pad
 * (such as `[3:v]`), `inLabel` the stream below it and `outLabel` the result. Times are timeline seconds: the
 * picture's frames are shifted to `start`, so FFmpeg's `t` is timeline time in every expression.
 */
export function imageOverlayFilters(
  o: ImageOverlay,
  imageLabel: string,
  inLabel: string,
  outLabel: string,
  W: number,
  H: number,
): string[] {
  const s = o.start;
  const e = o.start + o.duration;
  const edge = Math.min(EDGE, o.duration / 3);
  const pxW = Math.max(16, Math.floor((W * o.width) / 2) * 2);
  const margin = Math.round(W * 0.035);

  // Entrance progress, 0 to 1 (same curve and timing as the text overlays).
  const entrance = `min(1,max(0,(t-${num(s)})/${num(edge + 0.1)}))`;
  const left = o.position === "top-left" || o.position === "bottom-left";
  const right = o.position === "top-right" || o.position === "bottom-right";
  const top = o.position === "top-left" || o.position === "top-right" || o.position === "top";
  const bottom =
    o.position === "bottom-left" || o.position === "bottom-right" || o.position === "bottom";
  let x = left ? `${margin}` : right ? `W-w-${margin}` : "(W-w)/2";
  let y = top ? `${margin}` : bottom ? `H-h-${margin}` : "(H-h)/2";
  if (o.animation === "slide-up") y = `${y}+${num(H * 0.06)}*pow(1-${entrance},3)`;
  if (o.animation === "slide-left") x = `${x}-${num(W * 0.3)}*pow(1-${entrance},3)`;

  const chain = [
    "format=rgba",
    // Shift first: everything after this sees timeline time, so expressions and fades can use it directly.
    `setpts=PTS-STARTPTS+${num(s)}/TB`,
  ];
  if (o.animation === "pop") {
    const grow = `min(1,max(0,(t-${num(s)})/0.25))`;
    chain.push(`scale=w='trunc(${pxW}*(0.5+0.5*${grow})/2)*2':h=-2:eval=frame`);
  } else {
    chain.push(`scale=w=${pxW}:h=-2`);
  }
  if (o.opacity < 1 - EPS) chain.push(`colorchannelmixer=aa=${num(o.opacity)}`);
  if (o.animation !== "none") {
    chain.push(
      `fade=t=in:st=${num(s)}:d=${num(edge)}:alpha=1`,
      `fade=t=out:st=${num(e - edge)}:d=${num(edge)}:alpha=1`,
    );
  }
  const pic = outLabel.replace("]", "_img]");
  return [
    `${imageLabel}${chain.join(",")}${pic}`,
    // eof_action=pass: before and after its frames the picture is simply not drawn.
    `${inLabel}${pic}overlay=x='${x}':y='${y}':eof_action=pass${outLabel}`,
  ];
}
