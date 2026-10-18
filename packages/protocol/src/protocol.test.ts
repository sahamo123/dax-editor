import { describe, expect, it } from "vitest";
import {
  API,
  ApiKeyRequestSchema,
  ChatRequestSchema,
  CommandRequestSchema,
  FILMSTRIP_FRAME_WIDTH,
  filmstripFrameCount,
  ImportRequestSchema,
  JobStartedSchema,
  LocalModelInstallRequestSchema,
  LocalModelStatusSchema,
  mediaUrl,
  PROVIDER_KINDS,
  ProjectNewRequestSchema,
  SettingsSchema,
  WaveformSchema,
  waveformRate,
} from "./index.js";

describe("protocol schemas", () => {
  it("defaults command args to an empty object", () => {
    expect(CommandRequestSchema.parse({ name: "split" }).args).toEqual({});
    expect(() => CommandRequestSchema.parse({ args: {} })).toThrow();
  });

  it("limits imports and chat length", () => {
    expect(() => ImportRequestSchema.parse({ paths: [] })).toThrow();
    expect(ImportRequestSchema.parse({ paths: ["/a.mp4"] }).paths).toHaveLength(1);
    expect(() => ChatRequestSchema.parse({ message: "" })).toThrow();
    expect(() => ChatRequestSchema.parse({ message: "x".repeat(8001) })).toThrow();
  });

  it("defaults a new project's name", () => {
    expect(ProjectNewRequestSchema.parse({}).name).toBe("Untitled");
  });

  it("accepts only known providers", () => {
    expect(PROVIDER_KINDS).toContain("local");
    expect(() => ApiKeyRequestSchema.parse({ kind: "other", apiKey: "k" })).toThrow();
    expect(
      SettingsSchema.parse({
        activeProvider: "local",
        providers: { "openai-compatible": { baseUrl: "http://127.0.0.1:11434/v1" } },
      }).activeProvider,
    ).toBe("local");
    expect(() =>
      SettingsSchema.parse({
        activeProvider: "local",
        providers: { local: { baseUrl: "not a url" } },
      }),
    ).toThrow();
  });

  it("accepts the local model status the server sends, with or without the optional fields", () => {
    expect(
      LocalModelStatusSchema.parse({ installed: false, running: false, detail: "Not downloaded" }),
    ).toEqual({ installed: false, running: false, detail: "Not downloaded" });
    expect(
      LocalModelStatusSchema.parse({
        installed: true,
        running: true,
        detail: "Ready",
        supported: true,
        modelId: "m1",
        label: "Model one",
        description: "Small and quick.",
        sizeBytes: 2_100_000_000,
        baseUrl: "http://127.0.0.1:9999/v1",
      }).label,
    ).toBe("Model one");
    // `detail` is how the UI explains the state, so a status without it is a protocol violation.
    expect(() => LocalModelStatusSchema.parse({ installed: true, running: false })).toThrow();
    expect(() =>
      LocalModelStatusSchema.parse({ installed: true, running: false, detail: "x", sizeBytes: -1 }),
    ).toThrow();
  });

  it("validates the local model install request and the job-started reply", () => {
    expect(LocalModelInstallRequestSchema.parse({})).toEqual({});
    expect(LocalModelInstallRequestSchema.parse({ modelId: "m1" }).modelId).toBe("m1");
    expect(() => LocalModelInstallRequestSchema.parse({ modelId: "" })).toThrow();
    expect(JobStartedSchema.parse({ jobId: "j1" }).jobId).toBe("j1");
    expect(() => JobStartedSchema.parse({})).toThrow();
  });

  it("describes the media formats clients rely on", () => {
    expect(filmstripFrameCount(0.5)).toBe(4);
    expect(filmstripFrameCount(10.2)).toBe(11);
    expect(filmstripFrameCount(99999)).toBe(120);
    expect(FILMSTRIP_FRAME_WIDTH).toBe(96);
    expect(waveformRate(60)).toBe(50);
    expect(waveformRate(4000)).toBe(5);
    const wave = { version: 1, duration: 2, peaksPerSecond: 50, peaks: [0, 0.5, 1] };
    expect(WaveformSchema.parse(wave)).toEqual(wave);
    // A bare array (what the editor once guessed) is not the format.
    expect(() => WaveformSchema.parse([0, 0.5])).toThrow();
    expect(() => WaveformSchema.parse({ ...wave, peaks: [2] })).toThrow();
  });

  it("builds media URLs with the token and escaped ids", () => {
    const u = new URL(
      mediaUrl("http://127.0.0.1:4317/", "tok", "asset 1", "thumb.jpg", { t: 2.5 }),
    );
    expect(u.pathname).toBe(`${API.media}/asset%201/thumb.jpg`);
    expect(u.searchParams.get("token")).toBe("tok");
    expect(u.searchParams.get("t")).toBe("2.5");
  });
});
