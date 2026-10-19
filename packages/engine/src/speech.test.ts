// Tests for the default speech-to-text engine: missing runtime or model becomes "transcription unavailable", nothing else changes.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcriber, Transcript } from "@dax/core";
import { SttError } from "@dax/stt";
import { afterEach, describe, expect, it } from "vitest";
import { createSpeechTranscriber, unavailableReason, withUnavailableMessages } from "./speech.js";

let dataDir: string | undefined;

afterEach(() => {
  // Remove exactly the folder this file created.
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

/** A transcriber double that either returns a transcript or throws the given error, and records its calls. */
function fakeInner(
  outcome: Transcript | Error,
): Transcriber & { calls: { path: string; opts: unknown }[] } {
  const calls: { path: string; opts: unknown }[] = [];
  return {
    calls,
    async transcribe(path, opts) {
      calls.push({ path, opts });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe("unavailableReason", () => {
  it("names the missing runtime, the missing model, or the unsupported platform", () => {
    expect(unavailableReason(new SttError("binary-missing", "x"), "base.en")).toBe(
      "the speech recognition runtime (whisper-cli) is missing or cannot be run",
    );
    expect(unavailableReason(new SttError("model-missing", "x"), "base.en")).toBe(
      'the speech model "base.en" is not downloaded',
    );
    expect(unavailableReason(new SttError("unsupported-platform", "x"), "base.en")).toBe(
      "there is no speech recognition runtime for this computer",
    );
  });

  it("is undefined for real failures and for errors that are not from the speech package", () => {
    expect(unavailableReason(new SttError("cancelled", "x"), "base.en")).toBeUndefined();
    expect(unavailableReason(new SttError("process-failed", "x"), "base.en")).toBeUndefined();
    expect(unavailableReason(new Error("boom"), "base.en")).toBeUndefined();
    expect(unavailableReason("not an error", "base.en")).toBeUndefined();
  });
});

describe("withUnavailableMessages", () => {
  it("turns a missing runtime into 'transcription unavailable: <reason>' and keeps the original as cause", async () => {
    const original = new SttError("binary-missing", "whisper-cli was expected at /x");
    const engine = withUnavailableMessages(fakeInner(original), "base.en");
    const error = await engine.transcribe("/media/a.mp4").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "transcription unavailable: the speech recognition runtime (whisper-cli) is missing or cannot be run",
    );
    expect((error as Error).cause).toBe(original);
  });

  it("names the model when only the model is missing", async () => {
    const engine = withUnavailableMessages(
      fakeInner(new SttError("model-missing", "x")),
      "small.en-q5_1",
    );
    await expect(engine.transcribe("/media/a.mp4")).rejects.toThrow(
      'transcription unavailable: the speech model "small.en-q5_1" is not downloaded',
    );
  });

  it("passes real failures through unchanged, so they are not mistaken for a setup problem", async () => {
    const cancelled = new SttError("cancelled", "stopped");
    await expect(
      withUnavailableMessages(fakeInner(cancelled), "base.en").transcribe("/a.mp4"),
    ).rejects.toBe(cancelled);
    const other = new Error("disk on fire");
    await expect(
      withUnavailableMessages(fakeInner(other), "base.en").transcribe("/a.mp4"),
    ).rejects.toBe(other);
  });

  it("returns the transcript and forwards the language and signal unchanged", async () => {
    const transcript: Transcript = { language: "en", words: [{ text: "hi", start: 0, end: 0.4 }] };
    const inner = fakeInner(transcript);
    const abort = new AbortController();
    const result = await withUnavailableMessages(inner, "base.en").transcribe("/a.mp4", {
      language: "en",
      signal: abort.signal,
    });
    expect(result).toBe(transcript);
    expect(inner.calls).toEqual([
      { path: "/a.mp4", opts: { language: "en", signal: abort.signal } },
    ]);
  });
});

describe("createSpeechTranscriber", () => {
  it("reports 'transcription unavailable' when the whisper-cli path it is given does not exist", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-speech-"));
    const engine = createSpeechTranscriber(dataDir, {
      binaryPath: join(dataDir, "no-such-whisper-cli"),
    });
    await expect(engine.transcribe("/media/a.mp4")).rejects.toThrow(
      "transcription unavailable: the speech recognition runtime (whisper-cli) is missing or cannot be run",
    );
  });

  it("reports the missing model, and downloads nothing, when the runtime exists but the model is not installed", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "dax-speech-"));
    // process.execPath is a real executable, so the runtime check passes and the model check is what fails.
    // Nothing is fetched: automatic install is off by default.
    const engine = createSpeechTranscriber(dataDir, {
      binaryPath: process.execPath,
      modelId: "base.en",
    });
    await expect(engine.transcribe("/media/a.mp4")).rejects.toThrow(
      'transcription unavailable: the speech model "base.en" is not downloaded',
    );
  });
});
