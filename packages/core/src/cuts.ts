// The cut engine: finds where talking footage can be tightened and turns that into a reviewable plan.
// Deterministic (no model): audio levels and transcript timing propose every cut; each decision carries a reason,
// a confidence and a status so a person or an AI can approve, reject or undo it. Design and evidence:
// docs/research/cut-intelligence.md.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { abortError, ffmpegBin, type RunOptions } from "./exec.js";
import { newId } from "./ids.js";
import type { Project, Range, Transcript, Word } from "./schema.js";
import { assetRangesToTimeline, deleteRanges, mergeRanges } from "./timeline.js";
import { DEFAULT_FILLERS } from "./transcript.js";

// ---------- audio analysis ----------

/** Loudness of a file in short frames. `db[i]` is the level of frame i (dBFS), each `frameSeconds` long. */
export interface AudioLevels {
  frameSeconds: number;
  db: number[];
}

const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20 ms

/**
 * Measure the loudness of a file's audio in 20 ms frames (RMS in dBFS). Decodes to mono 16 kHz and
 * streams the result, so memory stays small for long files. Silence reads as -100.
 */
export function analyzeAudio(path: string, opts: RunOptions = {}): Promise<AudioLevels> {
  return new Promise((res, rej) => {
    if (opts.signal?.aborted) return rej(abortError());
    const child = spawn(
      ffmpegBin(),
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        resolve(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-f",
        "s16le",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    // Cancelling kills the decoder; the close handler then reports the cancel rather than a failed read.
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const db: number[] = [];
    let carry: Buffer = Buffer.alloc(0);
    let stderr = "";
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const bytesPerFrame = FRAME_SAMPLES * 2;
      let offset = 0;
      while (buf.length - offset >= bytesPerFrame) {
        let sum = 0;
        for (let i = 0; i < FRAME_SAMPLES; i++) {
          const s = buf.readInt16LE(offset + i * 2) / 32768;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / FRAME_SAMPLES);
        db.push(rms > 1e-5 ? 20 * Math.log10(rms) : -100);
        offset += bytesPerFrame;
      }
      carry = buf.subarray(offset);
    });
    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      rej(err);
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) rej(abortError());
      else if (code === 0) res({ frameSeconds: FRAME_SAMPLES / SAMPLE_RATE, db });
      else
        rej(
          new Error(
            `ffmpeg failed to read audio (exit ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`,
          ),
        );
    });
  });
}

/** The room-tone level: the 10th percentile of frame loudness. Quiet and noisy rooms each get their own floor. */
export function estimateFloor(levels: AudioLevels): number {
  if (levels.db.length === 0) return -100;
  const sorted = [...levels.db].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)] ?? -100;
}

/** Tuning for {@link detectSpeechSpans}. */
export interface SpeechDetectOptions {
  /** Speech starts when loudness rises this many dB above the floor. Default 10. */
  onAboveFloor?: number;
  /** Speech ends when loudness falls this many dB above the floor (lower than `onAboveFloor`, so breaths do not chatter). Default 6. */
  offAboveFloor?: number;
  /** Ignore sounds shorter than this many seconds (clicks, coughs). Default 0.15. */
  minSpeech?: number;
}

/** Find stretches of speech (anything clearly above the room tone), in source seconds. */
export function detectSpeechSpans(levels: AudioLevels, opts: SpeechDetectOptions = {}): Range[] {
  const floor = estimateFloor(levels);
  const on = floor + (opts.onAboveFloor ?? 10);
  const off = floor + (opts.offAboveFloor ?? 6);
  const minSpeech = opts.minSpeech ?? 0.15;
  const f = levels.frameSeconds;
  const spans: Range[] = [];
  let start: number | null = null;
  levels.db.forEach((v, i) => {
    if (start === null && v >= on) start = i;
    else if (start !== null && v < off) {
      spans.push({ start: start * f, end: i * f });
      start = null;
    }
  });
  if (start !== null) spans.push({ start: start * f, end: levels.db.length * f });
  return spans.filter((s) => s.end - s.start >= minSpeech);
}

// ---------- presets ----------

/** How aggressively to cut. All times are seconds. */
export interface CutParams {
  /** Pauses longer than this are shortened. */
  pauseMin: number;
  /** Total silence left in a shortened pause. */
  keepPause: number;
  /** Silence kept before the next word. */
  padPre: number;
  /** Silence kept after the last word. */
  padPost: number;
  /** Remove filler words (um, uh, ...)? `isolated` only removes ones with a clear gap on a side. */
  fillers: "off" | "standalone" | "isolated";
  /** Detect false starts ("so the, so the main point") and repeated takes as proposals. */
  retakes: boolean;
}

/** Names of the built-in presets. */
export const CUT_PRESET_NAMES = ["gentle", "standard", "tight", "podcast", "tutorial"] as const;
/** One of {@link CUT_PRESET_NAMES}. */
export type CutPresetName = (typeof CUT_PRESET_NAMES)[number];

/** The built-in presets. Design defaults from the research notes, to be tuned by the evals. */
export const CUT_PRESETS: Record<CutPresetName, CutParams> = {
  gentle: {
    pauseMin: 0.9,
    keepPause: 0.5,
    padPre: 0.15,
    padPost: 0.2,
    fillers: "off",
    retakes: false,
  },
  standard: {
    pauseMin: 0.6,
    keepPause: 0.3,
    padPre: 0.1,
    padPost: 0.12,
    fillers: "standalone",
    retakes: true,
  },
  tight: {
    pauseMin: 0.35,
    keepPause: 0.15,
    padPre: 0.06,
    padPost: 0.08,
    fillers: "standalone",
    retakes: true,
  },
  podcast: {
    pauseMin: 1.2,
    keepPause: 0.6,
    padPre: 0.15,
    padPost: 0.2,
    fillers: "isolated",
    retakes: false,
  },
  tutorial: {
    pauseMin: 0.8,
    keepPause: 0.4,
    padPre: 0.1,
    padPost: 0.15,
    fillers: "standalone",
    retakes: false,
  },
};

// ---------- the plan ----------

/** Why a stretch is proposed for removal. */
export type CutKind = "pause" | "filler" | "head" | "tail" | "false_start" | "retake";

/** One proposed removal. `range` is in the source file's time. */
export interface CutDecision {
  id: string;
  kind: CutKind;
  range: Range;
  /** Plain-language reason, shown to the user and the model. */
  reason: string;
  /** 0 to 1. How sure the engine is that cutting this is right. */
  confidence: number;
  /** `approved` decisions are applied by default; `proposed` ones need a person (or the AI) to opt in. */
  status: "approved" | "proposed";
}

/** The result of {@link planCuts}: every proposed cut with its reason, and the totals. */
export interface CutPlan {
  id: string;
  assetId: string;
  preset: CutPresetName;
  params: CutParams;
  decisions: CutDecision[];
  /** Length of the source in seconds, and how much the approved decisions would remove. */
  duration: number;
  approvedSeconds: number;
  proposedSeconds: number;
}

/** Input to {@link planCuts}. Give `words` for the best result; otherwise `speech` spans are used. */
export interface PlanInput {
  assetId: string;
  duration: number;
  preset?: CutPresetName;
  /** Override individual preset values. */
  overrides?: Partial<CutParams>;
  words?: Word[];
  speech?: Range[];
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

function isFiller(w: Word, fillers: Set<string>): boolean {
  return fillers.has(norm(w.text));
}

/** Split words into sentences or phrases at pauses of at least `gap` seconds. */
function phrases(words: Word[], gap = 0.5): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.start - prev.end >= gap) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

const tokens = (ws: Word[]) => ws.map((w) => norm(w.text)).filter(Boolean);

function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Propose cuts for one asset. Works from word timings when given (best), else from speech spans.
 * The plan only describes cuts; nothing changes until {@link applyCutPlan}.
 */
export function planCuts(input: PlanInput): CutPlan {
  const presetName = input.preset ?? "standard";
  const p: CutParams = { ...CUT_PRESETS[presetName], ...input.overrides };
  const left = Math.max(p.padPost, p.keepPause / 2);
  const right = Math.max(p.padPre, p.keepPause / 2);
  const fillerSet = new Set(DEFAULT_FILLERS);
  const decisions: CutDecision[] = [];
  const add = (d: Omit<CutDecision, "id">) => {
    if (d.range.end - d.range.start >= 0.05) decisions.push({ id: newId("cut"), ...d });
  };

  // The "voiced items" are words when we have a transcript, otherwise speech spans.
  const allWords = input.words?.filter((w) => w.end > w.start) ?? [];
  const removeFillers = p.fillers !== "off" && allWords.length > 0;
  const kept = removeFillers ? allWords.filter((w) => !isFiller(w, fillerSet)) : allWords;
  const items: Range[] = allWords.length > 0 ? kept : (input.speech ?? []);
  const fillers = removeFillers ? allWords.filter((w) => isFiller(w, fillerSet)) : [];

  if (items.length === 0) {
    return finish(input, presetName, p, decisions);
  }

  // Head and tail silence.
  const first = items[0] as Range;
  const last = items[items.length - 1] as Range;
  if (first.start - p.padPre > 0.25) {
    add({
      kind: "head",
      range: { start: 0, end: first.start - p.padPre },
      reason: `${(first.start).toFixed(1)}s of silence before the first word`,
      confidence: 0.95,
      status: "approved",
    });
  }
  if (input.duration - last.end - p.padPost > 0.25) {
    add({
      kind: "tail",
      range: { start: last.end + p.padPost, end: input.duration },
      reason: `${(input.duration - last.end).toFixed(1)}s of silence after the last word`,
      confidence: 0.95,
      status: "approved",
    });
  }

  // Gaps between consecutive voiced items: shorten long pauses, and clear out filler words.
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i] as Range;
    const b = items[i + 1] as Range;
    const gap = b.start - a.end;
    const inside = fillers.filter((f) => f.start >= a.end - 0.01 && f.end <= b.start + 0.01);
    const removable = inside.filter((f) => {
      if (p.fillers !== "isolated") return true;
      return f.start - a.end >= 0.25 || b.start - f.end >= 0.25;
    });
    const start = a.end + left;
    const end = b.start - right;
    if (removable.length > 0 && end - start >= 0.05) {
      add({
        kind: "filler",
        range: {
          start: Math.min(start, removable[0]?.start ?? start),
          end: Math.max(end, removable[removable.length - 1]?.end ?? end),
        },
        reason: `filler "${removable.map((f) => f.text.trim()).join(" ")}" at ${(removable[0]?.start ?? 0).toFixed(1)}s`,
        confidence: 0.9,
        status: "approved",
      });
    } else if (gap > p.pauseMin && end - start >= 0.05) {
      add({
        kind: "pause",
        range: { start, end },
        reason: `${gap.toFixed(1)}s pause shortened to ${(left + right).toFixed(2)}s`,
        confidence: 0.95,
        status: "approved",
      });
    }
  }

  // Fillers at the very start or end of the speech are covered by head/tail only if outside; handle ones before the first kept word.
  for (const f of fillers) {
    if (
      f.end <= first.start - 0.01 &&
      first.start - p.padPre - f.start > 0 &&
      !decisions.some((d) => d.range.start <= f.start && d.range.end >= f.end)
    ) {
      add({
        kind: "filler",
        range: {
          start: Math.max(0, f.start - 0.02),
          end: Math.min(first.start - p.padPre, f.end + 0.02),
        },
        reason: `filler "${f.text.trim()}" at ${f.start.toFixed(1)}s`,
        confidence: 0.9,
        status: "approved",
      });
    }
  }

  // False starts and repeated takes (proposals only; they need a person's judgement).
  if (p.retakes && allWords.length > 0) {
    const ph = phrases(kept);
    for (let i = 0; i + 1 < ph.length; i++) {
      const a = ph[i] as Word[];
      const b = ph[i + 1] as Word[];
      const ta = tokens(a);
      const tb = tokens(b);
      const before = ph[i - 1]?.[ph[i - 1]?.length ? (ph[i - 1] as Word[]).length - 1 : 0];
      const start = (before ? before.end : 0) + left;
      const end = (b[0] as Word).start - right;
      if (end - start < 0.05) continue;
      if (
        ta.length >= 2 &&
        ta.length <= 8 &&
        ta[0] === tb[0] &&
        ta[1] === tb[1] &&
        tb.length > ta.length
      ) {
        add({
          kind: "false_start",
          range: { start: Math.max(start, (a[0] as Word).start - 0.02), end },
          reason: `false start: "${a.map((w) => w.text.trim()).join(" ")}" is restated right after`,
          confidence: 0.75,
          status: "proposed",
        });
      } else if (ta.length >= 4 && similarity(ta, tb) >= 0.8) {
        add({
          kind: "retake",
          range: { start, end },
          reason: `repeated take: "${a.map((w) => w.text.trim()).join(" ")}" is said again (similarity ${similarity(ta, tb).toFixed(2)})`,
          confidence: 0.6,
          status: "proposed",
        });
      }
    }
  }

  return finish(input, presetName, p, decisions);
}

function finish(
  input: PlanInput,
  preset: CutPresetName,
  params: CutParams,
  decisions: CutDecision[],
): CutPlan {
  decisions.sort((a, b) => a.range.start - b.range.start);
  const sum = (status: CutDecision["status"]) =>
    mergeRanges(decisions.filter((d) => d.status === status).map((d) => d.range)).reduce(
      (n, r) => n + (r.end - r.start),
      0,
    );
  return {
    id: newId("plan"),
    assetId: input.assetId,
    preset,
    params,
    decisions,
    duration: input.duration,
    approvedSeconds: sum("approved"),
    proposedSeconds: sum("proposed"),
  };
}

/** Which decisions {@link applyCutPlan} should apply. */
export interface ApplyOptions {
  /** Also apply `proposed` decisions. */
  includeProposed?: boolean;
  /** Apply only these decision ids (overrides status). */
  only?: string[];
  /** Skip these decision ids. */
  exclude?: string[];
}

/** The source-time ranges a plan would remove under `opts`, merged. */
export function planRanges(plan: CutPlan, opts: ApplyOptions = {}): Range[] {
  const chosen = plan.decisions.filter((d) => {
    if (opts.exclude?.includes(d.id)) return false;
    if (opts.only) return opts.only.includes(d.id);
    return d.status === "approved" || opts.includeProposed === true;
  });
  return mergeRanges(chosen.map((d) => d.range));
}

/**
 * Remove the chosen decisions from the project, everywhere the timeline uses the asset.
 * Ranges already cut earlier are skipped. Returns the project unchanged if nothing is left to cut.
 */
export function applyCutPlan(p: Project, plan: CutPlan, opts: ApplyOptions = {}): Project {
  const timeline = assetRangesToTimeline(p, plan.assetId, planRanges(plan, opts));
  return timeline.length === 0 ? p : deleteRanges(p, timeline);
}

/** Convenience: a transcript's words, or an empty list. */
export function wordsOf(t?: Transcript): Word[] {
  return t?.words ?? [];
}
