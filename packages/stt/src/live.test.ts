// Live tests: real whisper-cli, real Hugging Face and GitHub downloads, real synthesised speech.
// Skipped unless DAX_LIVE_TESTS=1 (they need the network, about 100 MB of downloads and espeak-ng).
//   DAX_LIVE_TESTS=1 NODE_USE_ENV_PROXY=1 pnpm --filter @dax/stt test -- live
// Optional: DAX_WHISPER_CLI (use this binary instead of downloading), DAX_STT_MODEL (default base.en-q5_1),
// DAX_LIVE_DIR (cache folder, default ~/.cache/dax/live/stt).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir } from "../test-support/helpers.js";
import { ensureBinary, RUNTIME_ASSETS } from "./binary.js";
import { downloadFile, sha256File } from "./download.js";
import { createTranscriber } from "./factory.js";
import { modelUrl, SPEECH_MODELS, SpeechModelManager } from "./models.js";

const live = process.env.DAX_LIVE_TESTS === "1";
const cacheDir = process.env.DAX_LIVE_DIR ?? join(homedir(), ".cache", "dax", "live", "stt");
const modelId = process.env.DAX_STT_MODEL ?? "base.en-q5_1";

function has(cmd: string, arg = "--version"): boolean {
  try {
    execFileSync(cmd, [arg], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!live)("live: real whisper.cpp", () => {
  let work: string;
  let speech: string;
  const gotSpeech = has("espeak-ng") && has("ffmpeg", "-version");

  beforeAll(() => {
    mkdirSync(cacheDir, { recursive: true });
    work = tempDir("dax-stt-live-");
    if (!gotSpeech) return;
    // "Um" and "uh" are spoken by the synthesiser; 1.5 s of silence in front, 3 s behind.
    const raw = join(work, "raw.wav");
    speech = join(work, "speech.wav");
    execFileSync("espeak-ng", [
      "-v",
      "en-us",
      "-s",
      "150",
      "-w",
      raw,
      "Hello everyone and welcome back to the channel. Um, today we are going to talk about, uh, video editing.",
    ]);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      raw,
      "-af",
      "adelay=1500|1500,apad=pad_dur=3",
      "-ar",
      "16000",
      "-ac",
      "1",
      speech,
    ]);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("downloads a model from Hugging Face with resume, and the SHA-256 matches the catalog", async () => {
    const info = SPEECH_MODELS.find((m) => m.id === "tiny.en-q5_1");
    if (!info) throw new Error("catalog entry missing");
    const dest = join(work, info.file);
    const ac = new AbortController();
    // Stop after ~4 MB, then resume from the partial file.
    await downloadFile(modelUrl(info), dest, {
      sha256: info.sha256,
      signal: ac.signal,
      onProgress: (p) => {
        if (p.receivedBytes > 4_000_000) ac.abort();
      },
    }).catch((e: Error) => expect((e as { code?: string }).code).toBe("cancelled"));
    expect(statSync(`${dest}.part`).size).toBeGreaterThan(0);
    const resumed = Date.now();
    await downloadFile(modelUrl(info), dest, { sha256: info.sha256 });
    expect(statSync(dest).size).toBe(info.bytes);
    expect(await sha256File(dest)).toBe(info.sha256);
    console.log(`resumed download finished in ${((Date.now() - resumed) / 1000).toFixed(1)} s`);
  }, 600_000);

  it.skipIf(
    !RUNTIME_ASSETS.some((a) => a.platform === process.platform && a.arch === process.arch),
  )(
    "installs the official whisper-cli release for this OS and it runs",
    async () => {
      if (process.env.DAX_WHISPER_CLI) return; // user supplied their own
      const found = await ensureBinary({ dataDir: cacheDir });
      expect(existsSync(found.path)).toBe(true);
      const out = execFileSync(found.path, ["--help"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toMatch(/usage/i);
    },
    600_000,
  );

  it.skipIf(!gotSpeech)(
    "transcribes synthesised speech with word times close to the truth",
    async () => {
      const t = createTranscriber({
        dataDir: cacheDir,
        modelId,
        binaryPath: process.env.DAX_WHISPER_CLI,
      });
      const manager = new SpeechModelManager({ dataDir: cacheDir });
      await manager.install(modelId);
      const stages = new Set<string>();
      const started = Date.now();
      const result = await t.transcribe(speech, { onProgress: (p) => stages.add(p.stage) });
      const wall = (Date.now() - started) / 1000;
      const text = result.words.map((w) => w.text.toLowerCase().replace(/[^a-z']/g, "")).join(" ");
      console.log(
        `[live] ${modelId}: ${wall.toFixed(1)} s wall for ${result.words.at(-1)?.end.toFixed(1)} s of audio`,
      );
      console.log(`[live] text: ${text}`);
      console.log(
        `[live] words: ${result.words.map((w) => `${w.text}@${w.start.toFixed(2)}-${w.end.toFixed(2)}`).join(" ")}`,
      );
      expect(text).toContain("welcome");
      expect(text).toContain("video editing");
      expect(stages).toContain("recognising");
      // The speech starts 1.5 s into the file; the first word must not be stamped at 0.
      const first = result.words[0];
      expect(first?.start ?? 0).toBeGreaterThan(1.2);
      expect(first?.start ?? 99).toBeLessThan(2.4);
      // Nothing is stamped inside the 3 s of trailing silence (the file is about 11 s long).
      const lastEnd = result.words.at(-1)?.end ?? 0;
      expect(lastEnd).toBeLessThan(readDuration(speech) - 2);
    },
    900_000,
  );

  it.skipIf(!gotSpeech)(
    "cancels a running transcription and leaves no whisper-cli behind",
    async () => {
      const t = createTranscriber({
        dataDir: cacheDir,
        modelId,
        binaryPath: process.env.DAX_WHISPER_CLI,
      });
      await new SpeechModelManager({ dataDir: cacheDir }).install(modelId);
      await t.setup();
      const ac = new AbortController();
      const run = t.transcribe(speech, {
        signal: ac.signal,
        onProgress: (p) => p.stage === "recognising" && ac.abort(),
      });
      await expect(run).rejects.toMatchObject({ code: "cancelled" });
      await new Promise((r) => setTimeout(r, 1500));
      let leftover = "";
      try {
        leftover = execFileSync("pgrep", ["-f", `${work}`], { encoding: "utf8" });
      } catch {
        // pgrep exits 1 when nothing matches: that is the good outcome.
      }
      expect(leftover.trim()).toBe("");
    },
    900_000,
  );
});

/** Duration of a WAV from its size (16 kHz mono 16-bit, 44-byte header from ffmpeg). */
function readDuration(wav: string): number {
  return (readFileSync(wav).length - 44) / 32000;
}
