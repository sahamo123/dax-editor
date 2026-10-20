// Checks the FFmpeg argument list that extractAudio builds: its input must be opened with the
// file-only protocol whitelist. A stand-in FFmpeg records its arguments, so no FFmpeg is needed.

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractAudio } from "./audio.js";

const posix = process.platform !== "win32";

describe.skipIf(!posix)("extractAudio input", () => {
  let dir: string;
  const oldBin = process.env.DAX_FFMPEG;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-stt-in-"));
  });
  afterEach(() => {
    if (oldBin === undefined) delete process.env.DAX_FFMPEG;
    else process.env.DAX_FFMPEG = oldBin;
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens the input with the file-only protocol whitelist before its -i", async () => {
    const record = join(dir, "args.txt");
    const bin = join(dir, "fake-ffmpeg");
    // Writes its arguments one per line and exits 0 without making an output file.
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\nexit 0\n`);
    chmodSync(bin, 0o755);
    process.env.DAX_FFMPEG = bin;
    const source = join(dir, "talk.mp4");
    writeFileSync(source, "not really video");

    await extractAudio(source, { outPath: join(dir, "out.wav") }).catch(() => undefined);

    const args = readFileSync(record, "utf8")
      .split("\n")
      .filter((l) => l !== "");
    const i = args.indexOf("-i");
    expect(i).toBeGreaterThan(0);
    expect(args.slice(i - 2, i)).toEqual(["-protocol_whitelist", "file"]);
    expect(args[i + 1]).toBe(source);
  });
});
