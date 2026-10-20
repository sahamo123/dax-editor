import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  fixturePath,
  hasFfmpeg,
  installFakeCli,
  tempDir,
  writeWav,
} from "../test-support/helpers.js";
import type { SttError } from "./errors.js";
import {
  buildWhisperArgs,
  describeFailure,
  isEnglishOnlyModel,
  parseProgressLine,
  type TranscribeProgress,
  type WhisperCppOptions,
  WhisperCppTranscriber,
} from "./transcriber.js";

const posix = process.platform !== "win32";
const ffmpeg = hasFfmpeg();
let dir: string;
let cli: string;
let enModel: string;
let multiModel: string;
let tone: string;
let jfk: string;

const FAKE_VARS = ["FAKE_MODE", "FAKE_JSON", "FAKE_LOG", "FAKE_PID", "FAKE_SLEEP"];

beforeAll(() => {
  dir = tempDir();
  cli = installFakeCli(dir);
  enModel = join(dir, "ggml-base.en.bin");
  multiModel = join(dir, "ggml-base.bin");
  writeFileSync(enModel, "model");
  writeFileSync(multiModel, "model");
  tone = join(dir, "tone.wav");
  writeWav(tone, [{ sec: 12 }]);
  jfk = fixturePath("jfk.tiny.en.full.json");
});
afterEach(() => {
  for (const v of FAKE_VARS) delete process.env[v];
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const make = (extra: Partial<WhisperCppOptions> = {}) =>
  new WhisperCppTranscriber({
    binaryPath: cli,
    modelPath: enModel,
    threads: 2,
    tempDir: dir,
    ...extra,
  });
const readLog = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { args: string[]; audioSec: number });

describe("pure helpers", () => {
  it("builds the argument list without a shell: every value is its own element", () => {
    const args = buildWhisperArgs({
      modelPath: "/m dir/ggml base.en.bin",
      wavPath: "/tmp/a b.wav",
      outBase: "/tmp/out x",
      threads: 3,
      language: "en",
      prompt: "um, uh",
      noSpeechThreshold: 0.4,
      suppressNonSpeech: true,
    });
    expect(args).toEqual([
      "-m",
      "/m dir/ggml base.en.bin",
      "-f",
      "/tmp/a b.wav",
      "-ojf",
      "-of",
      "/tmp/out x",
      "-t",
      "3",
      "-l",
      "en",
      "-pp",
      "-np",
      "--prompt",
      "um, uh",
      "-nth",
      "0.4",
      "-sns",
    ]);
  });

  it("omits optional flags when unset", () => {
    const args = buildWhisperArgs({
      modelPath: "m",
      wavPath: "w",
      outBase: "o",
      threads: 1,
      language: "auto",
    });
    expect(args).not.toContain("--prompt");
    expect(args).not.toContain("-sns");
    expect(args).not.toContain("-nth");
  });

  it("parses progress lines, capping the 137% that whisper.cpp prints on short audio", () => {
    expect(parseProgressLine("whisper_print_progress_callback: progress =  45%")).toBe(45);
    expect(parseProgressLine("whisper_print_progress_callback: progress = 137%")).toBe(100);
    expect(parseProgressLine("load_backend: loaded CPU backend")).toBeUndefined();
  });

  it("knows which model files are English-only", () => {
    expect(isEnglishOnlyModel("/x/ggml-base.en.bin")).toBe(true);
    expect(isEnglishOnlyModel("/x/ggml-small.en-q5_1.bin")).toBe(true);
    expect(isEnglishOnlyModel("/x/ggml-base.bin")).toBe(false);
    expect(isEnglishOnlyModel("/x/ggml-tiny-q5_1.bin")).toBe(false);
  });

  it("turns failures into advice", () => {
    expect(describeFailure(null, "SIGILL", "", "cli").message).toMatch(/illegal instruction/);
    expect(describeFailure(null, "SIGKILL", "", "cli").message).toMatch(
      /signal SIGKILL.*out of memory/,
    );
    expect(describeFailure(2, null, "failed to load model", "cli").code).toBe("model-missing");
    expect(
      describeFailure(127, null, "error while loading shared libraries: libgomp.so.1", "cli")
        .message,
    ).toMatch(/libgomp1/);
    expect(describeFailure(3, null, "kaboom", "cli").message).toMatch(/code 3.*kaboom/s);
  });
});

describe.skipIf(!posix || !ffmpeg)(
  "WhisperCppTranscriber with a fake whisper-cli (needs ffmpeg)",
  () => {
    it("turns captured whisper JSON into a core Transcript", async () => {
      process.env.FAKE_MODE = "ok";
      process.env.FAKE_JSON = jfk;
      const t = await make().transcribe(tone);
      expect(t.language).toBe("en");
      expect(t.words.map((w) => w.text).slice(0, 5)).toEqual([
        "and",
        "so",
        "my",
        "fellow",
        "Americans",
      ]);
      expect(t.words).toHaveLength(22);
      expect(t.words[0]?.start).toBeCloseTo(0.32, 2);
      for (const w of t.words) expect(w.end).toBeGreaterThanOrEqual(w.start);
    });

    it("reports ordered stages and a monotonic fraction, ending at 1", async () => {
      process.env.FAKE_JSON = jfk;
      const events: TranscribeProgress[] = [];
      await make({ onProgress: (p) => events.push(p) }).transcribe(tone, {
        onProgress: (p) => events.push(p),
      });
      const stages = events.map((e) => e.stage);
      expect(stages[0]).toBe("extracting");
      expect(stages).toContain("recognising");
      expect(stages.at(-1)).toBe("finishing");
      const per = events.filter((_, i) => i % 2 === 0); // each event reaches both listeners
      for (let i = 1; i < per.length; i++)
        expect(per[i]?.fraction).toBeGreaterThanOrEqual(per[i - 1]?.fraction ?? 0);
      expect(events.at(-1)?.fraction).toBe(1);
      expect(events.every((e) => e.fraction <= 1)).toBe(true);
    });

    it("uses -l en for English-only models and -l auto for multilingual ones, and reports the detected language", async () => {
      const log = join(dir, "lang.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      const en = await make().transcribe(tone);
      expect(en.language).toBe("en");
      const multi = await make({ modelPath: multiModel }).transcribe(tone);
      expect(multi.language).toBe("de"); // what the fake "detected"
      const forced = await make({ modelPath: multiModel }).transcribe(tone, { language: "fr" });
      expect(forced.language).toBe("fr");
      const langs = readLog(log).map((r) => r.args[r.args.indexOf("-l") + 1]);
      expect(langs).toEqual(["en", "auto", "fr"]);
    });

    it("refuses a non-English language on an English-only model, naming the fix", async () => {
      await expect(make().transcribe(tone, { language: "de" })).rejects.toMatchObject({
        code: "unsupported-language",
        message: expect.stringContaining("multilingual model"),
      });
    });

    it("passes the priming prompt only when asked", async () => {
      const log = join(dir, "prompt.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_JSON = jfk;
      await make().transcribe(tone);
      await make({ disfluencyPrompt: true }).transcribe(tone);
      await make({ initialPrompt: "Kubernetes, Tauri" }).transcribe(tone);
      const prompts = readLog(log).map((r) =>
        r.args.includes("--prompt") ? r.args[r.args.indexOf("--prompt") + 1] : undefined,
      );
      expect(prompts[0]).toBeUndefined();
      expect(prompts[1]).toMatch(/^Umm/);
      expect(prompts[2]).toBe("Kubernetes, Tauri");
    });

    it("shortens a long silence before recognition and maps word times back", async () => {
      // tone 0-2 s | silence 2-8 s | tone 8-10 s
      const wav = join(dir, "gap.wav");
      writeWav(wav, [{ sec: 2 }, { sec: 6, amp: 0 }, { sec: 2 }]);
      const log = join(dir, "gap.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      const t = await make().transcribe(wav);
      // The engine saw 2.3 + 0.5 + 2.3 = 5.1 s instead of 10 s.
      expect(readLog(log)[0]?.audioSec).toBeCloseTo(5.1, 1);
      // Fake words w0..w4 sit at squeezed 0,1,2,3,4 s. w2 falls in the removed silence and is dropped;
      // w3 is stamped 7.9 s but speech resumes at 8.0 s, so it is pulled forward.
      expect(t.words.map((w) => w.text)).toEqual(["w0", "w1", "w3", "w4"]);
      expect(t.words[2]?.start).toBeCloseTo(8.0, 1);
      expect(t.words[3]?.start).toBeCloseTo(8.9, 1);
    });

    it("can leave the audio alone when squeezing is switched off", async () => {
      const wav = join(dir, "gap2.wav");
      writeWav(wav, [{ sec: 2 }, { sec: 6, amp: 0 }, { sec: 2 }]);
      const log = join(dir, "gap2.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      await make({ squeezeSilence: false }).transcribe(wav);
      expect(readLog(log)[0]?.audioSec).toBeCloseTo(10, 1);
    });

    it("splits long audio at silences, offsets each chunk and removes its temp files", async () => {
      // tone 3 | quiet 3 | tone 3 | quiet 3 | tone 3 = 15 s; squeezed to 11.2 s.
      const wav = join(dir, "long.wav");
      writeWav(wav, [{ sec: 3 }, { sec: 3, amp: 0 }, { sec: 3 }, { sec: 3, amp: 0 }, { sec: 3 }]);
      const log = join(dir, "long.log");
      const work = join(dir, "work-long");
      mkdirSync(work);
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      const events: TranscribeProgress[] = [];
      const t = await make({
        chunking: { chunkSec: 5 },
        tempDir: work,
        silenceFilter: false,
        snapToSpeech: false,
      }).transcribe(wav, {
        onProgress: (p) => events.push(p),
      });
      const runs = readLog(log);
      expect(runs).toHaveLength(3);
      expect(runs.reduce((n, r) => n + r.audioSec, 0)).toBeCloseTo(11.2, 0);
      expect(events.some((e) => e.chunks === 3 && e.chunk === 3)).toBe(true);
      const starts = t.words.map((w) => w.start);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      // Words of the last chunk come from the last speech block (original time 11.7-15 s).
      expect(starts.at(-1)).toBeGreaterThan(11);
      expect(readdirSync(work)).toEqual([]);
    });

    it("makes a hard cut with overlap when there is no silence, without duplicating words", async () => {
      const wav = join(dir, "solid.wav");
      writeWav(wav, [{ sec: 14 }]);
      const log = join(dir, "solid.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      const t = await make({
        chunking: { chunkSec: 4, overlapSec: 2 },
        silenceFilter: false,
        snapToSpeech: false,
      }).transcribe(wav);
      const runs = readLog(log);
      expect(runs.length).toBeGreaterThan(2);
      const mids = t.words.map((w) => (w.start + w.end) / 2);
      for (let i = 1; i < mids.length; i++) expect(mids[i]).toBeGreaterThan(mids[i - 1] ?? 0);
    });

    it("gives the engine the whole file when chunking is off", async () => {
      const wav = join(dir, "whole.wav");
      writeWav(wav, [{ sec: 14 }]);
      const log = join(dir, "whole.log");
      process.env.FAKE_LOG = log;
      process.env.FAKE_MODE = "wordspersec";
      await make({ chunking: false }).transcribe(wav);
      expect(readLog(log)).toHaveLength(1);
    });

    it("returns an empty transcript for audio shorter than a tenth of a second", async () => {
      const wav = join(dir, "tiny.wav");
      writeWav(wav, [{ sec: 0.05 }]);
      expect((await make().transcribe(wav)).words).toEqual([]);
    });

    it("removes its temp folder when it finishes or fails", async () => {
      const work = join(dir, "work-clean");
      mkdirSync(work);
      process.env.FAKE_JSON = jfk;
      await make({ tempDir: work }).transcribe(tone);
      expect(readdirSync(work)).toEqual([]);
      process.env.FAKE_MODE = "fail";
      await make({ tempDir: work })
        .transcribe(tone)
        .catch(() => undefined);
      expect(readdirSync(work)).toEqual([]);
    });

    describe("failures say what to do", () => {
      const run = (mode: string, extra: Partial<WhisperCppOptions> = {}) => {
        process.env.FAKE_MODE = mode;
        return make(extra)
          .transcribe(tone)
          .then(
            () => {
              throw new Error("expected failure");
            },
            (e: SttError) => e,
          );
      };

      it("includes the engine's own words when it exits non-zero", async () => {
        const e = await run("fail");
        expect(e.code).toBe("process-failed");
        expect(e.message).toMatch(/code 3/);
        expect(e.message).toMatch(/something went wrong inside the decoder/);
      });

      it("recognises a model that will not load", async () => {
        expect((await run("modelerr")).code).toBe("model-missing");
      });

      it("recognises a missing system library", async () => {
        const e = await run("loadlib");
        expect(e.code).toBe("binary-missing");
        expect(e.message).toMatch(/libgomp/);
      });

      it("recognises an illegal-instruction crash and a kill by the OS", async () => {
        expect((await run("sigill")).message).toMatch(/illegal instruction/);
        expect((await run("killed")).message).toMatch(/SIGKILL/);
      });

      it("notices when no JSON was written or it is garbage", async () => {
        expect((await run("nojson")).code).toBe("bad-output");
        expect((await run("badjson")).message).toMatch(/not valid JSON/);
      });

      it("names a missing model file and a missing binary before starting anything", async () => {
        await expect(
          make({ modelPath: join(dir, "absent.bin") }).transcribe(tone),
        ).rejects.toMatchObject({
          code: "model-missing",
          message: expect.stringContaining("SpeechModelManager.install"),
        });
        await expect(
          make({ binaryPath: join(dir, "absent-cli") }).transcribe(tone),
        ).rejects.toMatchObject({
          code: "binary-missing",
          message: expect.stringContaining("ensureBinary"),
        });
      });

      it("says so when the file has no audio", async () => {
        const silent = join(dir, "video-only.mp4");
        execFileSync("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=d=1:s=64x64:r=10",
          silent,
        ]);
        await expect(make().transcribe(silent)).rejects.toMatchObject({ code: "no-audio" });
      });
    });

    describe("cancel and timeout", () => {
      const alive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      const waitDead = async (pid: number) => {
        for (let i = 0; i < 60 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
        return !alive(pid);
      };

      it("kills whisper-cli when the signal fires and rejects with a cancelled error", async () => {
        const pidFile = join(dir, "cancel.pid");
        process.env.FAKE_MODE = "hang";
        process.env.FAKE_PID = pidFile;
        const ac = new AbortController();
        const p = make().transcribe(tone, { signal: ac.signal });
        for (let i = 0; i < 100 && !existsSync(pidFile); i++)
          await new Promise((r) => setTimeout(r, 50));
        const pid = Number(readFileSync(pidFile, "utf8"));
        expect(alive(pid)).toBe(true);
        ac.abort();
        const err = await p.then(
          () => undefined,
          (e: SttError) => e,
        );
        expect(err?.code).toBe("cancelled");
        expect(err?.name).toBe("AbortError");
        expect(await waitDead(pid)).toBe(true);
      });

      it("does not start anything when already aborted", async () => {
        const ac = new AbortController();
        ac.abort();
        process.env.FAKE_LOG = join(dir, "never.log");
        await expect(make().transcribe(tone, { signal: ac.signal })).rejects.toMatchObject({
          code: "cancelled",
        });
        expect(existsSync(join(dir, "never.log"))).toBe(false);
      });

      it("stops a run that exceeds timeoutMs and says how to fix it", async () => {
        const pidFile = join(dir, "timeout.pid");
        process.env.FAKE_MODE = "hang";
        process.env.FAKE_PID = pidFile;
        const err = await make({ timeoutMs: 500 })
          .transcribe(tone)
          .then(
            () => undefined,
            (e: SttError) => e,
          );
        expect(err?.code).toBe("timeout");
        expect(err?.message).toMatch(/smaller model or raise timeoutMs/);
        expect(await waitDead(Number(readFileSync(pidFile, "utf8")))).toBe(true);
      });
    });
  },
);

describe.skipIf(!ffmpeg)("FFmpeg errors", () => {
  it("explains a missing FFmpeg", async () => {
    const saved = process.env.DAX_FFMPEG;
    process.env.DAX_FFMPEG = join(dir, "no-ffmpeg-here");
    try {
      await expect(make().transcribe(tone)).rejects.toMatchObject({
        code: "binary-missing",
        message: expect.stringContaining("FFmpeg was not found"),
      });
    } finally {
      if (saved === undefined) delete process.env.DAX_FFMPEG;
      else process.env.DAX_FFMPEG = saved;
    }
  });
});
