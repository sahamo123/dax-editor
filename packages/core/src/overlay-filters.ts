// Turns text overlays into FFmpeg drawtext/drawbox filter fragments. Pure: no processes, no filesystem.
// User text is never put into the filter string; it goes into files (`textfile=`) so quotes, colons,
// percent signs and newlines in a title cannot break or inject into the filter graph.

import type { Overlay, OverlayStyle } from "./schema.js";

/** A text file the filter graph reads. The caller must write it before running FFmpeg. */
export interface TextFile {
  path: string;
  content: string;
}

/** Font files used for drawing text. Absolute paths. */
export interface FontFiles {
  regular: string;
  bold: string;
}

/** Filter fragments (not yet labelled or joined) plus the text files they read. */
export interface OverlayFilters {
  filters: string[];
  files: TextFile[];
}

/** Longest text that gets the letter-by-letter typewriter effect; longer text fades in instead. */
export const TYPEWRITER_MAX_CHARS = 80;

/** Seconds an overlay takes to fade/slide in and out. */
const EDGE = 0.4;

/** Quote a filter option value so `:`, `,`, spaces and apostrophes inside it are taken literally. */
export function quoteFilterValue(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** A path in the form FFmpeg wants inside a filter: forward slashes, quoted. Works for Windows drive letters. */
export function filterPath(path: string): string {
  return quoteFilterValue(path.replace(/\\/g, "/"));
}

const n = (x: number) => Number(x.toFixed(4)).toString();
const hex = (c: string) => `0x${c.slice(1).toUpperCase()}`;

/** Opacity envelope: 0 before `s`, ramps to 1 over `fi`, holds, ramps to 0 over `fo` ending at `e`, then 0. */
function fadeEnvelope(s: number, e: number, fi: number, fo: number): string {
  return `if(lt(t,${n(s)}),0,if(lt(t,${n(s + fi)}),(t-${n(s)})/${n(fi)},if(lt(t,${n(e - fo)}),1,if(lt(t,${n(e)}),(${n(e)}-t)/${n(fo)},0))))`;
}

/** 0 to 1 progress of the entrance over `len` seconds starting at `s`. */
const progress = (s: number, len: number) => `min(1,max(0,(t-${n(s)})/${n(len)}))`;

interface Geometry {
  size: number;
  x: string;
  y: string;
}

/** Where the main text sits, as FFmpeg expressions, for each position preset. */
function geometry(style: OverlayStyle, W: number, H: number): Geometry {
  const size = Math.max(8, Math.round(style.fontSize * (H / 1080)));
  switch (style.position) {
    case "top":
      return { size, x: "(w-text_w)/2", y: n(H * 0.1) };
    case "bottom":
      return { size, x: "(w-text_w)/2", y: `h-text_h-${n(H * 0.08)}` };
    case "lower-third":
      return { size, x: n(W * 0.08), y: n(H * 0.72) };
    default:
      return { size, x: "(w-text_w)/2", y: "(h-text_h)/2" };
  }
}

/** One drawtext filter. `extra` carries per-animation options such as `alpha` or `fontsize`. */
function drawtext(opts: {
  file: string;
  font: string;
  size: string;
  color: string;
  x: string;
  y: string;
  alpha: string;
  enable: string;
  box?: OverlayStyle["box"];
  boxBorder: number;
}): string {
  const parts = [
    `fontfile=${filterPath(opts.font)}`,
    `textfile=${filterPath(opts.file)}`,
    "expansion=none",
    `fontsize=${quoteFilterValue(opts.size)}`,
    `fontcolor=${hex(opts.color)}`,
    `x=${quoteFilterValue(opts.x)}`,
    `y=${quoteFilterValue(opts.y)}`,
    `alpha=${quoteFilterValue(opts.alpha)}`,
    `enable=${quoteFilterValue(opts.enable)}`,
  ];
  if (opts.box && opts.box.opacity > 0) {
    parts.push(
      "box=1",
      `boxcolor=${hex(opts.box.color)}@${n(opts.box.opacity)}`,
      `boxborderw=${opts.boxBorder}`,
    );
  }
  return `drawtext=${parts.join(":")}`;
}

/**
 * Build the filters for one overlay on a `W`x`H` frame. Times are timeline seconds, which is what
 * FFmpeg's `t` is when these filters run after the clips have been concatenated.
 * `dir` is where this overlay's text files will live (they are named from the overlay id).
 */
export function overlayFilters(
  o: Overlay,
  W: number,
  H: number,
  fonts: FontFiles,
  dir: string,
): OverlayFilters {
  const s = o.start;
  const e = o.start + o.duration;
  const edge = Math.min(EDGE, o.duration / 3);
  const enable = `between(t,${n(s)},${n(e)})`;
  const g = geometry(o.style, W, H);
  const font = o.style.bold ? fonts.bold : fonts.regular;
  const boxBorder = Math.round(g.size * 0.3);
  const files: TextFile[] = [];
  const filters: string[] = [];
  const base = `${dir.replace(/\\/g, "/")}/${o.id}`;

  const alpha = o.animation === "none" ? "1" : fadeEnvelope(s, e, edge, edge);
  const entrance = progress(s, edge + 0.1);
  let x = g.x;
  let y = g.y;
  let size = String(g.size);
  if (o.animation === "slide-up") y = `${g.y}+${n(H * 0.06)}*pow(1-${entrance},3)`;
  if (o.animation === "slide-left") x = `${g.x}-${n(W * 0.3)}*pow(1-${entrance},3)`;
  if (o.animation === "pop") size = `${g.size}*(0.5+0.5*${progress(s, 0.25)})`;

  const addText = (
    text: string,
    name: string,
    extra: Partial<Parameters<typeof drawtext>[0]> = {},
  ) => {
    const path = `${base}-${name}.txt`;
    files.push({ path, content: text });
    filters.push(
      drawtext({
        file: path,
        font,
        size,
        color: o.style.color,
        x,
        y,
        alpha,
        enable,
        box: o.style.box,
        boxBorder,
        ...extra,
      }),
    );
  };

  if (o.animation === "typewriter" && [...o.text].length <= TYPEWRITER_MAX_CHARS) {
    // One drawtext per prefix, each live for a short slice; left aligned so letters do not jump.
    const chars = [...o.text];
    const step = Math.min(0.08, (o.duration * 0.6) / chars.length);
    const left = n(W * 0.1);
    chars.forEach((_, i) => {
      const last = i === chars.length - 1;
      const from = s + i * step;
      const to = last ? e : s + (i + 1) * step;
      addText(chars.slice(0, i + 1).join(""), `t${i}`, {
        x: left,
        y: g.y,
        alpha: last ? fadeEnvelope(from, e, 0.0001, edge) : "1",
        enable: `between(t,${n(from)},${n(to)})`,
      });
    });
    return { filters, files };
  }

  if (o.style.position === "lower-third") {
    // Name plate in the accent colour with a smaller role plate beneath it. Both move with the
    // same expressions, so they slide and fade together.
    const subSize = Math.max(8, Math.round(g.size * 0.6));
    const titleY = H * 0.72;
    const plateH = g.size * 1.25 + boxBorder * 2;
    addText(o.text, "title", { y: n(titleY), box: { color: o.style.accent, opacity: 1 } });
    if (o.subtitle) {
      addText(o.subtitle, "sub", {
        y: n(titleY + plateH),
        size: `${subSize}`,
        font: fonts.regular,
        boxBorder: Math.round(subSize * 0.3),
      });
    }
    return { filters, files };
  }

  addText(o.text, "main");
  if (o.subtitle) {
    addText(o.subtitle, "sub", {
      y: `${g.y}+${n(g.size * 1.4)}`,
      size: `${Math.round(g.size * 0.55)}`,
      font: fonts.regular,
    });
  }
  return { filters, files };
}
