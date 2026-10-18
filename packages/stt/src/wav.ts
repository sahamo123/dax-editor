// Minimal PCM WAV reading and range copying. Whisper input is always our own 16 kHz mono 16-bit WAV
// written by FFmpeg, so only that layout is supported. Streams from disk; never loads a whole file.

import { type FileHandle, open, stat } from "node:fs/promises";
import { SttError } from "./errors.js";

/** Facts about a WAV file's audio data. */
export interface WavInfo {
  /** Byte offset where sample data begins. */
  dataOffset: number;
  /** Number of sample-data bytes (derived from the file size when the header says 0 or 0xFFFFFFFF). */
  dataBytes: number;
  /** Samples per second. */
  sampleRate: number;
  /** Channel count. */
  channels: number;
  /** Bits per sample. */
  bitsPerSample: number;
  /** Length of the audio in seconds. */
  durationSec: number;
}

/**
 * Parse a WAV header from the first bytes of a file plus the file's total size. Handles extra chunks
 * (`LIST`, `fact`) before `data`, and a `data` size of 0 or 0xFFFFFFFF (streamed output) by trusting
 * the file size. Returns `undefined` when `head` ends before the `data` chunk starts; throws
 * `bad-output` when it is not RIFF/WAVE or has no usable format chunk.
 */
export function parseWavHeader(head: Buffer, fileSize: number): WavInfo | undefined {
  if (head.length < 12) return undefined;
  if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") {
    throw new SttError("bad-output", "FFmpeg produced a file that is not a WAV.");
  }
  let pos = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (pos + 8 <= head.length) {
    const id = head.toString("ascii", pos, pos + 4);
    const len = head.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      if (pos + 24 > head.length) return undefined;
      channels = head.readUInt16LE(pos + 10);
      sampleRate = head.readUInt32LE(pos + 12);
      bits = head.readUInt16LE(pos + 22);
    }
    if (id === "data") {
      if (sampleRate <= 0 || channels <= 0 || bits <= 0) {
        throw new SttError("bad-output", "WAV has no format chunk before its data.");
      }
      const dataOffset = pos + 8;
      const available = Math.max(0, fileSize - dataOffset);
      const dataBytes = len === 0 || len === 0xffffffff || len > available ? available : len;
      const bytesPerSec = sampleRate * channels * (bits / 8);
      return {
        dataOffset,
        dataBytes,
        sampleRate,
        channels,
        bitsPerSample: bits,
        durationSec: dataBytes / bytesPerSec,
      };
    }
    pos += 8 + len + (len % 2);
  }
  return undefined;
}

/** Read {@link WavInfo} of a file on disk (reads only the first few KB). Throws `bad-output` if unusable. */
export async function readWavInfo(path: string): Promise<WavInfo> {
  const size = (await stat(path)).size;
  const fh = await open(path, "r");
  try {
    const head = Buffer.alloc(Math.min(size, 4096));
    await fh.read(head, 0, head.length, 0);
    const info = parseWavHeader(head, size);
    if (!info) throw new SttError("bad-output", "FFmpeg produced a WAV without audio data.");
    return info;
  } finally {
    await fh.close();
  }
}

/** A stretch of the source audio to copy, in seconds. */
export interface WavPartRange {
  /** Start second in the source. */
  start: number;
  /** End second in the source. */
  end: number;
}

/**
 * Write a new 16-bit mono WAV made of the `parts` of `src` in order, with `gapSec` seconds of digital
 * silence between consecutive parts. Copies in 1 MB blocks, so memory stays flat. Returns the new
 * file's duration in seconds. Throws `bad-output` if `src` is not 16-bit mono.
 */
export async function writeWavParts(
  src: string,
  dst: string,
  parts: WavPartRange[],
  gapSec = 0,
): Promise<number> {
  const info = await readWavInfo(src);
  if (info.bitsPerSample !== 16 || info.channels !== 1) {
    throw new SttError("bad-output", "Only 16-bit mono WAV files can be cut.");
  }
  const rate = info.sampleRate;
  const blocks = parts.map((p) => {
    const a = Math.max(0, Math.min(info.dataBytes / 2, Math.round(p.start * rate)));
    const b = Math.max(a, Math.min(info.dataBytes / 2, Math.round(p.end * rate)));
    return { fromSample: a, samples: b - a };
  });
  const gapSamples = Math.round(gapSec * rate);
  const total =
    blocks.reduce((n, b) => n + b.samples, 0) + gapSamples * Math.max(0, blocks.length - 1);
  const from = await open(src, "r");
  const to = await open(dst, "w");
  try {
    await to.write(wavHeader(total, rate));
    const buf = Buffer.alloc(1 << 20);
    const zeros = Buffer.alloc(Math.min(1 << 20, Math.max(2, gapSamples * 2)));
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b) continue;
      if (i > 0) await writeZeros(to, gapSamples * 2, zeros);
      let left = b.samples * 2;
      let at = info.dataOffset + b.fromSample * 2;
      while (left > 0) {
        const n = Math.min(left, buf.length);
        const { bytesRead } = await from.read(buf, 0, n, at);
        if (bytesRead <= 0) break;
        await to.write(buf, 0, bytesRead);
        at += bytesRead;
        left -= bytesRead;
      }
    }
  } finally {
    await from.close();
    await to.close();
  }
  return total / rate;
}

async function writeZeros(fh: FileHandle, bytes: number, zeros: Buffer): Promise<void> {
  let left = bytes;
  while (left > 0) {
    const n = Math.min(left, zeros.length);
    await fh.write(zeros, 0, n);
    left -= n;
  }
}

/** 44-byte canonical header for `samples` 16-bit mono samples at `rate` Hz. */
function wavHeader(samples: number, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + samples * 2, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(samples * 2, 40);
  return h;
}
