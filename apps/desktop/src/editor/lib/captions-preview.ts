// Preview-side captions: which words are on screen at a time, grouped into lines exactly as the export does.
// This mirrors captionWords/captionLines and the look constants in packages/core/src/captions.ts (the core package
// cannot be imported in a browser); a test compares the two on the same project so they cannot drift silently.

import type { CaptionSettings, Project } from "@dax/core";
import { mainClips } from "./project";

/** One spoken word placed on the timeline (seconds). */
export interface PreviewWord {
  text: string;
  start: number;
  end: number;
}

/** A few words shown together. */
export interface PreviewLine {
  start: number;
  end: number;
  words: PreviewWord[];
}

/** Every transcribed word that survives on the timeline, moved to timeline time and sorted. */
export function previewCaptionWords(p: Project): PreviewWord[] {
  const out: PreviewWord[] = [];
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

const SENTENCE_END = /[.!?]["')\]]*$/;

/** Group words into lines: at most `maxWords`, a new line after a pause of 0.7 s or the end of a sentence. */
export function previewCaptionLines(p: Project, maxWords = 4): PreviewLine[] {
  const words = previewCaptionWords(p);
  const lines: PreviewLine[] = [];
  let cur: PreviewWord[] = [];
  const flush = (nextStart: number | undefined) => {
    const first = cur[0];
    const last = cur[cur.length - 1];
    if (!first || !last) return;
    // Let the line linger a moment, but never into the next one.
    const linger =
      nextStart === undefined ? 0.35 : Math.min(0.35, Math.max(0, nextStart - last.end - 0.02));
    lines.push({ start: first.start, end: last.end + linger, words: cur });
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

/** The caption on screen at a moment: the line, and for `bold-pop` which word is being spoken. */
export interface ActiveCaption {
  line: PreviewLine;
  /** Index of the word being spoken, or -1 between words. */
  activeWord: number;
}

/** The caption line showing at time `t`, if any (binary search over sorted, non-overlapping lines). */
export function captionAt(lines: readonly PreviewLine[], t: number): ActiveCaption | null {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = lines[mid];
    if (!line) return null;
    if (t < line.start) hi = mid - 1;
    else if (t >= line.end) lo = mid + 1;
    else {
      // The word being spoken is the last one that has started (as the export's per-word events do).
      let activeWord = -1;
      line.words.forEach((w, i) => {
        if (t >= w.start) activeWord = i;
      });
      return { line, activeWord };
    }
  }
  return null;
}

/** How a caption style is drawn, as fractions of the frame height. Mirrors `buildAss`. */
export interface CaptionLook {
  /** Font size in cqh. */
  sizeCqh: number;
  bold: boolean;
  /** Opaque-ish box behind the text (`classic`). */
  boxed: boolean;
  /** Outline thickness in cqh (0 for none). */
  outlineCqh: number;
  /** Distance from the frame edge for top/bottom positions, in cqh. */
  marginCqh: number;
}

/** Look constants for a caption style. */
export function captionLook(style: CaptionSettings["style"]): CaptionLook {
  const sizeCqh = style === "bold-pop" ? 7.5 : style === "minimal" ? 4.5 : 5;
  const boxed = style === "classic";
  return {
    sizeCqh,
    bold: style === "bold-pop",
    boxed,
    outlineCqh: boxed ? 0 : style === "bold-pop" ? sizeCqh * 0.08 : 0.2,
    marginCqh: 7,
  };
}
