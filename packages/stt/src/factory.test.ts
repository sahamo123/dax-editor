import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  addAsset,
  appendClip,
  emptyProject,
  runCommand,
  Session,
  type Transcriber,
} from "@dax/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  fixturePath,
  hasFfmpeg,
  hasTar,
  startServer,
  type TestServer,
  tempDir,
  writeWav,
} from "../test-support/helpers.js";
import type { RuntimeAsset } from "./binary.js";
import { createTranscriber, type SetupProgress } from "./factory.js";
import type { SpeechModelInfo } from "./models.js";

const ok = process.platform !== "win32" && hasTar() && hasFfmpeg();
let root: string;
let server: TestServer | undefined;
let runtime: Omit<RuntimeAsset, "url">;
let runtimeBytes: Buffer;
const modelBytes = Buffer.alloc(50_000, 7);
const model: SpeechModelInfo = {
  id: "fake.en",
  file: "ggml-fake.en.bin",
  bytes: modelBytes.length,
  sha256: createHash("sha256").update(modelBytes).digest("hex"),
  multilingual: false,
  quantization: "f16",
  approxRamMB: 1,
  description: "test model",
};

beforeAll(() => {
  root = tempDir();
  // A runtime package whose whisper-cli is the fake one.
  const pkg = join(root, "pkg-src", "pkg");
  mkdirSync(pkg, { recursive: true });
  copyFileSync(
    join(import.meta.dirname, "..", "test-support", "fake-whisper-cli.mjs"),
    join(pkg, "whisper-cli"),
  );
  chmodSync(join(pkg, "whisper-cli"), 0o755);
  const archive = join(root, "rt.tar.gz");
  if (hasTar()) execFileSync("tar", ["-czf", archive, "-C", join(root, "pkg-src"), "."]);
  runtimeBytes = hasTar() ? readFileSync(archive) : Buffer.alloc(0);
  runtime = {
    version: "vtest",
    platform: process.platform,
    arch: process.arch,
    sha256: createHash("sha256").update(runtimeBytes).digest("hex"),
    bytes: runtimeBytes.length,
    archive: "tar.gz",
    binaryPath: "pkg/whisper-cli",
  };
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  for (const v of ["FAKE_MODE", "FAKE_JSON"]) delete process.env[v];
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function serve(): Promise<{ assets: RuntimeAsset[]; baseUrl: string }> {
  server = await startServer(
    Buffer.alloc(0),
    {},
    { "rt.tar.gz": runtimeBytes, [model.file]: modelBytes },
  );
  return { assets: [{ ...runtime, url: `${server.url}/rt.tar.gz` }], baseUrl: server.url };
}

describe.skipIf(!ok)(
  "createTranscriber (offline, fake runtime and model on a local server)",
  () => {
    it("installs the runtime and model on first use, then transcribes", async () => {
      const { assets, baseUrl } = await serve();
      const wav = join(root, "speech.wav");
      writeWav(wav, [{ sec: 5 }]);
      process.env.FAKE_JSON = fixturePath("jfk.tiny.en.full.json");
      const progress: SetupProgress[] = [];
      const t = createTranscriber({
        dataDir: join(root, "data1"),
        modelId: "fake.en",
        extraModels: [model],
        modelBaseUrl: baseUrl,
        runtimeAssets: assets,
        onSetupProgress: (p) => progress.push(p),
        tempDir: root,
      });
      const before = await t.status();
      expect(before).toMatchObject({ ready: false, model: { id: "fake.en", installed: false } });
      expect(before.binary).toBeUndefined();

      const transcript = await t.transcribe(wav);
      expect(transcript.words).toHaveLength(22);
      expect(progress.some((p) => p.what === "runtime")).toBe(true);
      expect(progress.some((p) => p.what === "model")).toBe(true);

      const after = await t.status();
      expect(after.ready).toBe(true);
      expect(after.binary?.source).toBe("installed");

      // A second call does not download anything again.
      const requests = server?.requests.length;
      await t.transcribe(wav);
      expect(server?.requests.length).toBe(requests);
    });

    it("can be set up ahead of time for a 'Set up speech recognition' button", async () => {
      const { assets, baseUrl } = await serve();
      const t = createTranscriber({
        dataDir: join(root, "data2"),
        modelId: "fake.en",
        extraModels: [model],
        modelBaseUrl: baseUrl,
        runtimeAssets: assets,
      });
      await t.setup();
      expect((await t.status()).ready).toBe(true);
    });

    it("with autoInstall off, says what is missing instead of downloading", async () => {
      const { assets, baseUrl } = await serve();
      const t = createTranscriber({
        dataDir: join(root, "data3"),
        modelId: "fake.en",
        extraModels: [model],
        modelBaseUrl: baseUrl,
        runtimeAssets: assets,
        autoInstall: false,
      });
      await expect(t.transcribe(join(root, "x.wav"))).rejects.toMatchObject({
        code: "binary-missing",
      });
      expect(server?.requests).toHaveLength(0);
    });

    it("recovers after a failed setup: the next call tries again", async () => {
      const { assets, baseUrl } = await serve();
      let calls = 0;
      const flaky: typeof fetch = (input, init) => {
        if (++calls <= 3) return Promise.reject(new Error("network down"));
        return fetch(input, init);
      };
      const wav = join(root, "flaky.wav");
      writeWav(wav, [{ sec: 3 }]);
      process.env.FAKE_JSON = fixturePath("jfk.tiny.en.full.json");
      const t = createTranscriber({
        dataDir: join(root, "data4"),
        modelId: "fake.en",
        extraModels: [model],
        modelBaseUrl: baseUrl,
        runtimeAssets: assets,
        fetchImpl: flaky,
        tempDir: root,
      });
      // downloadFile retries twice by itself, so three failures exhaust the first setup attempt.
      await expect(t.transcribe(wav)).rejects.toMatchObject({ code: "download-failed" });
      expect((await t.transcribe(wav)).words.length).toBeGreaterThan(0);
    });

    it("plugs into core: the transcribe command stores the transcript and remove_fillers can use it", async () => {
      const { assets, baseUrl } = await serve();
      const wav = join(root, "core.wav");
      const duration = writeWav(wav, [{ sec: 22 }]);
      process.env.FAKE_JSON = fixturePath("phrases-disfluencies.tiny.en.full.json");
      const transcriber: Transcriber = createTranscriber({
        dataDir: join(root, "data5"),
        modelId: "fake.en",
        extraModels: [model],
        modelBaseUrl: baseUrl,
        runtimeAssets: assets,
        tempDir: root,
        snapToSpeech: false,
        silenceFilter: false,
      });
      const asset = { id: "a1", path: wav, kind: "audio" as const, duration, hasAudio: true };
      const session = new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));
      const ctx = { session, transcriber };
      const r = await runCommand(ctx, "transcribe", { language: "en" });
      expect(r.summary).toMatch(/Transcribed 37 word/);
      const transcript = session.project.assets.a1?.transcript;
      expect(transcript?.words.map((w) => w.text)).toContain("Um,");
      const read = await runCommand(ctx, "get_transcript", {});
      expect(JSON.stringify(read.data)).toContain("Hello, everyone");
      const removed = await runCommand(ctx, "remove_fillers", {});
      expect(removed.summary).toMatch(/filler|removed|Removed/i);
    });
  },
);
