// Word-timed captions: turns the transcripts of the clips on the timeline into caption lines (in timeline time)
// and into an ASS subtitle file that FFmpeg burns in. Computed from the current timeline each time, so captions
// follow every cut, trim and reorder automatically. Pure: no filesystem or FFmpeg access.

import type { CaptionSettings, CaptionStyle, Project } from "./schema.js";
import { CaptionSettingsSchema } from "./schema.js";
import { mainClips } from "./timeline.js";

/** One spoken word placed on the timeline. */
export interface CaptionWord {
  text: string;
  /** Timeline seconds. */
  start: number;
  end: number;
}

/** A few words shown together. */
export interface CaptionLine {
  start: number;
  end: number;
  words: CaptionWord[];
}

/** Starting values for each look; the command merges these under anything the caller sets. */
export const CAPTION_STYLE_DEFAULTS: Record<CaptionStyle, Partial<CaptionSettings>> = {
  classic: { maxWords: 5, uppercase: false, position: "bottom" },
  "bold-pop": { maxWords: 3, uppercase: true, position: "center" },
  minimal: { maxWords: 6, uppercase: false, position: "bottom" },
};

/** Every transcribed word that survives on the timeline, moved to timeline time and sorted. */
export function captionWords(p: Project): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const c of mainClips(p)) {
    const transcript = p.assets[c.assetId]?.transcript;
    if (!transcript) continue;
    for (const w of transcript.words) {
      if (w.end <= c.in || w.start >= c.out) continue;
      const start = c.start + Math.max(w.start, c.in) - c.in;
      const end = c.start + Math.min(w.end, c.out) - c.in;
      const text = w.text.trim();
      if (text && end - start >= 0.02) out.push({ text, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** True if at least one clip on the timeline has a transcript, so captions would show something. */
export function hasCaptionSource(p: Project): boolean {
  return captionWords(p).length > 0;
}

const SENTENCE_END = /[.!?]["')\]]*$/;

/** Group words into lines: at most `maxWords`, a new line after a pause of 0.7 s or the end of a sentence. */
export function captionLines(p: Project, maxWords = 4): CaptionLine[] {
  const words = captionWords(p);
  const lines: CaptionLine[] = [];
  let cur: CaptionWord[] = [];
  const flush = (nextStart: number | undefined) => {
    if (cur.length === 0) return;
    const last = cur[cur.length - 1] as CaptionWord;
    // Let the line linger a moment, but never into the next one.
    const linger =
      nextStart === undefined ? 0.35 : Math.min(0.35, Math.max(0, nextStart - last.end - 0.02));
    lines.push({ start: (cur[0] as CaptionWord).start, end: last.end + linger, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = cur[cur.length - 1];
    if (
      prev &&
      (cur.length >= maxWords || w.start - prev.end > 0.7 || SENTENCE_END.test(prev.text))
    ) {
      flush(w.start);
    }
    cur.push(w);
    if (i === words.length - 1) flush(undefined);
  });
  return lines;
}

/** `#RRGGBB` to the `&H00BBGGRR&` form ASS uses. */
function assColor(hex: string, alpha = 0): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** Remove characters that ASS would read as formatting. */
const assText = (t: string) => t.replace(/[{}\\\r\n]/g, "");

/**
 * The text of an ASS subtitle file for these lines. `bold-pop` shows each line with the word being
 * spoken in the highlight colour; the other looks show the whole line at once.
 */
export function buildAss(
  lines: CaptionLine[],
  settings: CaptionSettings,
  width: number,
  height: number,
  fontName = "Inter",
): string {
  const size = Math.round(
    height * (settings.style === "bold-pop" ? 0.075 : settings.style === "minimal" ? 0.045 : 0.05),
  );
  const align = settings.position === "top" ? 8 : settings.position === "center" ? 5 : 2;
  const marginV = Math.round(height * 0.07);
  const bold = settings.style === "bold-pop" ? -1 : 0;
  // BorderStyle 3 draws an opaque box behind the text; 1 draws an outline.
  const boxed = settings.style === "classic";
  const outline = boxed
    ? Math.round(size * 0.25)
    : settings.style === "bold-pop"
      ? Math.round(size * 0.08)
      : 2;
  const back = boxed ? assColor("#000000", 0x80) : assColor("#000000", 0x40);
  const style = [
    "Default",
    fontName,
    size,
    assColor(settings.color),
    assColor(settings.highlight),
    assColor("#000000"),
    back,
    bold,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    boxed ? 3 : 1,
    outline,
    settings.style === "minimal" ? 1 : boxed ? 0 : 2,
    align,
    Math.round(width * 0.06),
    Math.round(width * 0.06),
    marginV,
    1,
  ].join(",");

  const out: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: ${style}`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];

  const word = (w: CaptionWord) => assText(settings.uppercase ? w.text.toUpperCase() : w.text);
  for (const line of lines) {
    if (settings.style === "bold-pop") {
      line.words.forEach((_, i) => {
        const from = (line.words[i] as CaptionWord).start;
        const to = line.words[i + 1]?.start ?? line.end;
        const text = line.words
          .map((w, j) =>
            j === i
              ? `{\\c${assColor(settings.highlight)}}${word(w)}{\\c${assColor(settings.color)}}`
              : word(w),
          )
          .join(" ");
        out.push(`Dialogue: 0,${assTime(from)},${assTime(to)},Default,,0,0,0,,${text}`);
      });
    } else {
      out.push(
        `Dialogue: 0,${assTime(line.start)},${assTime(line.end)},Default,,0,0,0,,${line.words.map(word).join(" ")}`,
      );
    }
  }
  return `${out.join("\n")}\n`;
}

/** Turn captions on or change their look. Pass `null` to turn them off. Unset fields keep their value or the style's default. */
export function setCaptions(p: Project, patch: Partial<CaptionSettings> | null): Project {
  const next = structuredClone(p);
  if (patch === null) {
    delete next.timeline.captions;
    return next;
  }
  const style = patch.style ?? p.timeline.captions?.style ?? "classic";
  const base = p.timeline.captions ?? { ...CAPTION_STYLE_DEFAULTS[style] };
  const styleChanged = patch.style !== undefined && patch.style !== p.timeline.captions?.style;
  next.timeline.captions = CaptionSettingsSchema.parse({
    ...base,
    ...(styleChanged ? CAPTION_STYLE_DEFAULTS[style] : {}),
    ...patch,
    style,
  });
  return next;
}
