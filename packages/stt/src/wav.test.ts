import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir, writeWav } from "../test-support/helpers.js";
import { computeEnergyEnvelope } from "./timing.js";
import { parseWavHeader, readWavInfo, writeWavParts } from "./wav.js";

let dir: string;
beforeAll(() => {
  dir = tempDir();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function header(opts: { extra?: Buffer; dataLen: number }): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(16000, 12);
  fmt.writeUInt32LE(32000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const data = Buffer.alloc(8);
  data.write("data", 0, "ascii");
  data.writeUInt32LE(opts.dataLen, 4);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, fmt, opts.extra ?? Buffer.alloc(0), data]);
}

describe("parseWavHeader", () => {
  it("reads duration from the data chunk size", () => {
    const h = header({ dataLen: 64000 });
    expect(parseWavHeader(h, h.length + 64000)?.durationSec).toBeCloseTo(2);
  });

  it("skips extra chunks such as LIST before the data", () => {
    const list = Buffer.alloc(8 + 6);
    list.write("LIST", 0, "ascii");
    list.writeUInt32LE(6, 4);
    const h = header({ dataLen: 32000, extra: list });
    const info = parseWavHeader(h, h.length + 32000);
    expect(info?.durationSec).toBeCloseTo(1);
    expect(info?.dataOffset).toBe(h.length);
  });

  it("trusts the file size when a streamed header says 0 or 0xFFFFFFFF", () => {
    for (const dataLen of [0, 0xffffffff]) {
      const h = header({ dataLen });
      expect(parseWavHeader(h, h.length + 16000)?.durationSec).toBeCloseTo(0.5);
    }
  });

  it("returns undefined when the header is cut short, and throws for non-WAV bytes", () => {
    expect(parseWavHeader(Buffer.from("RIFF"), 4)).toBeUndefined();
    expect(() => parseWavHeader(Buffer.from("hello world, definitely not a wav"), 33)).toThrow(
      /not a WAV/,
    );
  });
});

describe("writeWavParts", () => {
  it("concatenates ranges with silent gaps and reports the new duration", async () => {
    const src = join(dir, "src.wav");
    writeWav(src, [{ sec: 1 }, { sec: 3, amp: 0 }, { sec: 1 }]);
    const dst = join(dir, "dst.wav");
    const dur = await writeWavParts(
      src,
      dst,
      [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ],
      0.5,
    );
    expect(dur).toBeCloseTo(2.5);
    expect((await readWavInfo(dst)).durationSec).toBeCloseTo(2.5);
    const env = await computeEnergyEnvelope(dst);
    expect(env.db[50]).toBeGreaterThan(60); // first tone
    expect(env.db[125]).toBeLessThan(-20); // inserted gap
    expect(env.db[200]).toBeGreaterThan(60); // second tone
  });

  it("clamps ranges that run past the end of the source", async () => {
    const src = join(dir, "short.wav");
    writeWav(src, [{ sec: 1 }]);
    const dst = join(dir, "short-out.wav");
    expect(await writeWavParts(src, dst, [{ start: 0.5, end: 9 }])).toBeCloseTo(0.5);
  });
});
