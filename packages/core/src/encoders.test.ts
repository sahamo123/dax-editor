import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rankEncoders, resetEncoderProbes, withEncoderFallback } from "./encoders.js";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("rankEncoders", () => {
  it("orders by preference and drops unknown encoders", () => {
    expect(rankEncoders(["mpeg4", "h264_nvenc", "vp9", "libopenh264"])).toEqual([
      "h264_nvenc",
      "libopenh264",
      "mpeg4",
    ]);
    expect(rankEncoders(["vp9"])).toEqual([]);
  });
});

describe("withEncoderFallback", () => {
  beforeEach(resetEncoderProbes);
  afterEach(resetEncoderProbes);

  it("moves to the next encoder when the failing one cannot even encode a synthetic frame", async () => {
    const tried: string[] = [];
    const fellBack: string[] = [];
    const r = await withEncoderFallback(
      async (e) => {
        tried.push(e);
        if (e === "h264_nvenc") throw new Error("Cannot load nvcuda");
        return "rendered";
      },
      {
        candidates: ["h264_nvenc", "mpeg4"],
        probe: async (e) => e !== "h264_nvenc",
        onFallback: (e) => fellBack.push(e),
      },
    );
    expect(r).toEqual({ encoder: "mpeg4", value: "rendered" });
    expect(tried).toEqual(["h264_nvenc", "mpeg4"]);
    expect(fellBack).toEqual(["h264_nvenc"]);
  });

  it("skips an encoder it already found dead on the next call", async () => {
    const opts = {
      candidates: ["h264_nvenc", "mpeg4"],
      probe: async (e: string) => e !== "h264_nvenc",
    };
    await withEncoderFallback(async (e) => {
      if (e === "h264_nvenc") throw new Error("no gpu");
    }, opts);
    const tried: string[] = [];
    await withEncoderFallback(async (e) => void tried.push(e), opts);
    expect(tried).toEqual(["mpeg4"]);
  });

  it("does not blame the encoder or try others when the failure is the job's own (probe passes)", async () => {
    const tried: string[] = [];
    await expect(
      withEncoderFallback(
        async (e) => {
          tried.push(e);
          throw new Error("moov atom not found");
        },
        { candidates: ["libx264", "mpeg4"], probe: async () => true },
      ),
    ).rejects.toThrow("moov atom");
    expect(tried).toEqual(["libx264"]);
    // Nothing was blocked, so the same encoder is offered again.
    const again: string[] = [];
    await withEncoderFallback(async (e) => void again.push(e), {
      candidates: ["libx264", "mpeg4"],
      probe: async () => true,
    });
    expect(again).toEqual(["libx264"]);
  });

  it("never retries after an abort", async () => {
    const ac = new AbortController();
    const tried: string[] = [];
    await expect(
      withEncoderFallback(
        async (e) => {
          tried.push(e);
          ac.abort();
          throw new Error("killed");
        },
        { candidates: ["a", "b"], signal: ac.signal, probe: async () => false },
      ),
    ).rejects.toThrow();
    expect(tried).toEqual(["a"]);
  });

  it("throws the last error when every encoder is dead", async () => {
    await expect(
      withEncoderFallback(
        async (e) => {
          throw new Error(`${e} broke`);
        },
        { candidates: ["a", "b"], probe: async () => false },
      ),
    ).rejects.toThrow("b broke");
  });
});

// Simulates the common field failure: the preferred encoder is listed by FFmpeg but fails when used ("Cannot load nvcuda").
describe.skipIf(!hasFfmpeg() || process.platform === "win32")("export encoder fallback", () => {
  let dir: string;
  const oldBin = process.env.DAX_FFMPEG;

  beforeEach(() => {
    resetEncoderProbes();
    dir = mkdtempSync(join(tmpdir(), "dax-enc-"));
  });
  afterEach(() => {
    if (oldBin === undefined) delete process.env.DAX_FFMPEG;
    else process.env.DAX_FFMPEG = oldBin;
    resetEncoderProbes();
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to a working encoder instead of failing the export", async () => {
    const src = join(dir, "src.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=d=1:s=160x120:r=15",
        "-f",
        "lavfi",
        "-i",
        "sine=d=1",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        "-shortest",
        src,
      ],
      { stdio: "inherit" },
    );
    const asset = await probe(src);
    const project = appendClip(
      addAsset(emptyProject("fb", { width: 160, height: 120, fps: 15 }), asset),
      asset.id,
    );

    // A wrapper that makes libx264 (the first choice here) fail like an encoder with no hardware behind it.
    const wrapper = join(dir, "ffmpeg-wrapper.sh");
    writeFileSync(
      wrapper,
      '#!/bin/sh\nfor a in "$@"; do if [ "$a" = "libx264" ]; then echo "Cannot load libnvcuda.so" >&2; exit 1; fi; done\nexec ffmpeg "$@"\n',
    );
    chmodSync(wrapper, 0o755);
    process.env.DAX_FFMPEG = wrapper;

    const out = join(dir, "out.mp4");
    const r = await exportProject(project, out);
    expect(r.encoder).not.toBe("libx264");
    expect(existsSync(out)).toBe(true);
    expect((await probe(out)).duration).toBeGreaterThan(0.8);
  }, 60_000);
});
