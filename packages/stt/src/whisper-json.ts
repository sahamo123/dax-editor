// Parses the JSON that `whisper-cli -ojf` writes into plain words with times in seconds.
// Pure: no process, no filesystem. Tested against JSON captured from the real binary.

import { z } from "zod";

/** One recognised word with timing in the audio file's own time (seconds) and the engine's confidence. */
export interface RawWord {
  /** Word text as the engine wrote it, including attached punctuation such as `Hello,`. */
  text: string;
  /** Start in seconds from the start of the audio that was transcribed. */
  start: number;
  /** End in seconds; never smaller than `start`. */
  end: number;
  /** Mean token probability 0..1 when the engine reported it; `undefined` for the segment-only fallback. */
  probability?: number;
}

/** Result of {@link parseWhisperJson}. */
export interface ParsedWhisper {
  /** Language code the engine used or detected, e.g. `en`. */
  language?: string;
  /** Words in spoken order. Special tokens and non-speech tags are already removed. */
  words: RawWord[];
}

const TokenSchema = z.object({
  text: z.string(),
  offsets: z.object({ from: z.number(), to: z.number() }),
  p: z.number().optional(),
});

const SegmentSchema = z.object({
  offsets: z.object({ from: z.number(), to: z.number() }),
  text: z.string(),
  tokens: z.array(TokenSchema).optional(),
});

const WhisperJsonSchema = z.object({
  result: z.object({ language: z.string().optional() }).optional(),
  transcription: z.array(SegmentSchema),
});

/** True for engine control tokens such as `[_BEG_]`, `[_TT_380]` or `<|endoftext|>`. */
export function isSpecialToken(text: string): boolean {
  const t = text.trim();
  return /^\[_[A-Za-z0-9_]*\]$/.test(t) || /^<\|[^|]*\|>$/.test(t);
}

/** A token with no letter or digit in any script: punctuation, ellipsis, dash. */
function isPunctuationOnly(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text);
}

/**
 * Parse `whisper-cli -ojf` (or `-oj`) JSON text.
 *
 * - Sub-word tokens are merged into words: a token that starts with a space begins a new word.
 * - Special tokens are dropped. Punctuation tokens are appended to the previous word's text but do
 *   not extend its end time (the engine stamps them with the following pause).
 * - Non-speech tags such as `[BLANK_AUDIO]`, `(music)` or `[ Silence ]` are removed.
 * - With plain `-oj` output (no tokens) words are spread across their segment in proportion to length.
 *
 * Throws an `Error` that names the problem when the text is not JSON or lacks `transcription`.
 */
export function parseWhisperJson(jsonText: string): ParsedWhisper {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `whisper-cli wrote output that is not valid JSON (${(err as Error).message}). First bytes: ${JSON.stringify(jsonText.slice(0, 80))}`,
    );
  }
  const parsed = WhisperJsonSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `whisper-cli JSON has an unexpected shape: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  }
  const words: RawWord[] = [];
  for (const seg of parsed.data.transcription) {
    if (seg.tokens && seg.tokens.length > 0) words.push(...wordsFromTokens(seg.tokens));
    else words.push(...wordsFromSegmentText(seg.text, seg.offsets.from, seg.offsets.to));
  }
  // A leftover word with no letter or number (a stray quote or dash) is not speech.
  const speech = stripNonSpeechTags(words).filter((w) => /[\p{L}\p{N}]/u.test(w.text));
  return { language: parsed.data.result?.language, words: speech };
}

interface Acc {
  text: string;
  start: number;
  end: number;
  pSum: number;
  pCount: number;
}

function wordsFromTokens(tokens: z.infer<typeof TokenSchema>[]): RawWord[] {
  const out: RawWord[] = [];
  let cur: Acc | undefined;
  const flush = () => {
    if (!cur) return;
    out.push({
      text: cur.text,
      start: cur.start,
      end: Math.max(cur.start, cur.end),
      probability: cur.pCount ? cur.pSum / cur.pCount : undefined,
    });
    cur = undefined;
  };
  for (const tok of tokens) {
    if (isSpecialToken(tok.text)) continue;
    const from = tok.offsets.from / 1000;
    const to = tok.offsets.to / 1000;
    if (isPunctuationOnly(tok.text)) {
      const mark = tok.text.trim();
      if (/^[[({*♪"'¿¡«]+$/u.test(mark) && (!cur || /^\s/.test(tok.text))) {
        // An opening bracket or quote begins the next word (and the tag `[BLANK_AUDIO]`).
        flush();
        cur = { text: mark, start: from, end: from, pSum: 0, pCount: 0 };
      } else if (cur) {
        // Closing marks and punctuation join the previous word without stretching its end time.
        cur.text += mark;
      }
      continue;
    }
    if (!cur || /^\s/.test(tok.text)) {
      flush();
      cur = { text: tok.text.trim(), start: from, end: to, pSum: 0, pCount: 0 };
    } else {
      cur.text += tok.text;
      cur.end = to;
    }
    if (tok.p !== undefined) {
      cur.pSum += tok.p;
      cur.pCount += 1;
    }
  }
  flush();
  return out;
}

function wordsFromSegmentText(text: string, fromMs: number, toMs: number): RawWord[] {
  const parts = text.split(/\s+/).filter((p) => p.length > 0);
  const totalChars = parts.reduce((n, p) => n + p.length, 0);
  if (totalChars === 0) return [];
  const start = fromMs / 1000;
  const span = Math.max(0, (toMs - fromMs) / 1000);
  let at = start;
  return parts.map((p) => {
    const len = (p.length / totalChars) * span;
    const w = { text: p, start: at, end: at + len };
    at += len;
    return w;
  });
}

/** Non-speech annotations the engine writes in place of speech. */
const TAG_OPEN = /^[[(*♪]/u;
const TAG_CLOSE = /[\])*♪][.,!?]*$/u;

/**
 * Remove annotations such as `[BLANK_AUDIO]`, `[Music]`, `(applause)`, `*laughs*`, `[ Silence ]` and
 * lone `♪`. A tag may span up to eight words; an opening bracket with no closing one is kept as speech.
 */
export function stripNonSpeechTags(words: RawWord[]): RawWord[] {
  const out: RawWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    if (!TAG_OPEN.test(w.text)) {
      out.push(w);
      continue;
    }
    // Find where the tag closes (possibly on this very word).
    let close = -1;
    for (let j = i; j < Math.min(words.length, i + 8); j++) {
      const text = words[j]?.text ?? "";
      const body = j === i ? text.slice(1) : text;
      if (TAG_CLOSE.test(body) || (j === i && /^♪+$/u.test(text))) {
        close = j;
        break;
      }
    }
    if (close === -1) out.push(w);
    else i = close;
  }
  return out;
}
