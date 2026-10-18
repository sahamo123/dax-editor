// Preview-side model of text overlays: how each animation preset changes over time and where each line of text
// sits in the frame. Every constant mirrors the FFmpeg filter builder in packages/core/src/overlay-filters.ts so the
// preview approximates the export; if that file changes, change this one too. Pure maths, no DOM.

import type { Overlay } from "@dax/core";

/** Seconds an overlay takes to fade/slide in and out (the core `EDGE`). */
export const EDGE_SECONDS = 0.4;
/** Longest text that gets the letter-by-letter typewriter effect; longer text fades in instead. */
export const TYPEWRITER_MAX_CHARS = 80;
/** Slide distances as a fraction of the frame, matching the export (`H * 0.06`, `W * 0.3`). */
const SLIDE_UP_FRACTION = 0.06;
const SLIDE_LEFT_FRACTION = 0.3;
/** drawtext's line box for the bundled Inter font, as a multiple of the font size. */
export const LINE_HEIGHT = 1.21;

/** The overlay fields the animation model reads. */
export type OverlayTiming = Pick<Overlay, "start" | "duration" | "animation" | "text">;

/** What an overlay looks like at one instant. */
export interface OverlayFrame {
  /** False before the overlay starts and after it ends. */
  visible: boolean;
  /** 0 to 1 opacity of text and box together. */
  opacity: number;
  /** Horizontal offset as a fraction of frame width (negative = left). */
  offsetX: number;
  /** Vertical offset as a fraction of frame height (positive = down). */
  offsetY: number;
  /** Text scale, 1 when at rest. */
  scale: number;
  /** For the typewriter effect: how many characters are shown. `null` means all of them. */
  visibleChars: number | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Seconds of fade/slide at each end of an overlay of the given length (a third of it at most). */
export function edgeSeconds(duration: number): number {
  return Math.min(EDGE_SECONDS, duration / 3);
}

/** True when the typewriter effect applies to this text (it falls back to a fade for long text). */
export function usesTypewriter(o: Pick<Overlay, "animation" | "text">): boolean {
  return o.animation === "typewriter" && [...o.text].length <= TYPEWRITER_MAX_CHARS;
}

/** Seconds between letters for the typewriter effect. */
export function typewriterStep(duration: number, chars: number): number {
  return Math.min(0.08, (duration * 0.6) / Math.max(1, chars));
}

/**
 * Opacity envelope: 0 before the start, ramps to 1 over `fadeIn`, holds, ramps to 0 over `fadeOut` ending at the
 * end time, then 0. This is the same piecewise function the export uses for `alpha`.
 */
export function fadeEnvelope(
  t: number,
  start: number,
  end: number,
  fadeIn: number,
  fadeOut: number,
): number {
  if (t < start) return 0;
  if (t < start + fadeIn) return (t - start) / fadeIn;
  if (t < end - fadeOut) return 1;
  if (t < end) return (end - t) / fadeOut;
  return 0;
}

/** Compute how an overlay looks at timeline time `t`. Matches the export's per-animation expressions. */
export function overlayFrame(o: OverlayTiming, t: number): OverlayFrame {
  const s = o.start;
  const e = o.start + o.duration;
  const hidden: OverlayFrame = {
    visible: false,
    opacity: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    visibleChars: null,
  };
  if (t < s || t > e) return hidden;
  const edge = edgeSeconds(o.duration);
  const frame: OverlayFrame = { ...hidden, visible: true, opacity: 1 };

  if (usesTypewriter(o)) {
    const chars = [...o.text].length;
    const step = typewriterStep(o.duration, chars);
    frame.visibleChars = Math.min(chars, Math.floor((t - s) / step + 1e-9) + 1);
    // Prefixes are fully opaque; only the final one fades out at the end.
    frame.opacity = t < e - edge ? 1 : fadeEnvelope(t, e - edge, e, 0.0001, edge);
    return frame;
  }

  frame.opacity = o.animation === "none" ? 1 : fadeEnvelope(t, s, e, edge, edge);
  const entrance = clamp01((t - s) / (edge + 0.1));
  const remaining = (1 - entrance) ** 3;
  if (o.animation === "slide-up") frame.offsetY = SLIDE_UP_FRACTION * remaining;
  if (o.animation === "slide-left") frame.offsetX = -SLIDE_LEFT_FRACTION * remaining;
  if (o.animation === "pop") frame.scale = 0.5 + 0.5 * clamp01((t - s) / 0.25);
  return frame;
}

/** The style fields the layout reads. */
export type OverlayLayoutInput = Pick<
  Overlay,
  "text" | "subtitle" | "animation" | "style" | "duration" | "start"
>;

/** One line of text to draw, positioned in units of the frame (1 cqw = 1% of frame width, 1 cqh = 1% of height). */
export interface TextPart {
  key: "main" | "sub";
  text: string;
  /** True for the part the typewriter effect reveals letter by letter. */
  typed: boolean;
  /** Font size in cqh (1/100 of the frame height). */
  sizeCqh: number;
  bold: boolean;
  color: string;
  /** Background box behind the text, or null. */
  box: { color: string; opacity: number } | null;
  /** Padding around the text inside the box, in cqh (zero without a box). */
  padCqh: number;
  /** Horizontal anchor: `center` centres on the frame, `left` starts at `leftCqw`. */
  hAlign: "center" | "left";
  leftCqw: number;
  /** Top of the text (not of its box), in cqh from the top of the frame. */
  topCqh: number;
  /** Where scaling (the `pop` animation) pivots, matching what stays fixed in the export. */
  originX: "center" | "left";
  originY: "top" | "center" | "bottom";
}

const lineCount = (text: string) => text.split("\n").length;

/**
 * Lay out the lines of an overlay inside the frame. `fontSize` is defined for a 1080-pixel-high frame and scales with
 * the frame, so the size in frame-height units is `fontSize / 1080` regardless of the real preview size.
 */
export function layoutOverlay(o: OverlayLayoutInput): TextPart[] {
  const st = o.style;
  const size = (st.fontSize / 1080) * 100;
  const lines = lineCount(o.text);
  const textH = size * LINE_HEIGHT * lines;
  const box = st.box && st.box.opacity > 0 ? st.box : null;
  const padFor = (s: number) => (box ? s * 0.3 : 0);

  const mainTop = (): number => {
    switch (st.position) {
      case "top":
        return 10;
      case "bottom":
        return 92 - textH;
      case "lower-third":
        return 72;
      default:
        return 50 - textH / 2;
    }
  };
  const originY: TextPart["originY"] =
    st.position === "center" ? "center" : st.position === "bottom" ? "bottom" : "top";

  if (usesTypewriter(o)) {
    return [
      {
        key: "main",
        text: o.text,
        typed: true,
        sizeCqh: size,
        bold: st.bold,
        color: st.color,
        box,
        padCqh: padFor(size),
        hAlign: "left",
        leftCqw: 10,
        topCqh: mainTop(),
        originX: "left",
        originY,
      },
    ];
  }

  if (st.position === "lower-third") {
    const subSize = size * 0.6;
    const plateH = size * 1.25 + size * 0.3 * 2;
    const parts: TextPart[] = [
      {
        key: "main",
        text: o.text,
        typed: false,
        sizeCqh: size,
        bold: st.bold,
        color: st.color,
        // The name plate is always a solid accent box, whatever the style's own box says.
        box: { color: st.accent, opacity: 1 },
        padCqh: size * 0.3,
        hAlign: "left",
        leftCqw: 8,
        topCqh: 72,
        originX: "left",
        originY: "top",
      },
    ];
    if (o.subtitle) {
      parts.push({
        key: "sub",
        text: o.subtitle,
        typed: false,
        sizeCqh: subSize,
        bold: false,
        color: st.color,
        box,
        padCqh: padFor(subSize),
        hAlign: "left",
        leftCqw: 8,
        topCqh: 72 + plateH,
        originX: "left",
        originY: "top",
      });
    }
    return parts;
  }

  const top = mainTop();
  const parts: TextPart[] = [
    {
      key: "main",
      text: o.text,
      typed: false,
      sizeCqh: size,
      bold: st.bold,
      color: st.color,
      box,
      padCqh: padFor(size),
      hAlign: "center",
      leftCqw: 50,
      topCqh: top,
      originX: "center",
      originY,
    },
  ];
  if (o.subtitle) {
    parts.push({
      key: "sub",
      text: o.subtitle,
      typed: false,
      sizeCqh: size * 0.55,
      bold: false,
      color: st.color,
      box,
      // The export reuses the main line's box border for the second line.
      padCqh: padFor(size),
      hAlign: "center",
      leftCqw: 50,
      topCqh: top + size * 1.4,
      originX: "center",
      originY,
    });
  }
  return parts;
}
