import { createHash, randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer, tempDir } from "../test-support/helpers.js";
import {
  MODEL_LICENSE,
  MODEL_REPO_REVISION,
  modelUrl,
  SPEECH_MODELS,
  type SpeechModelInfo,
  SpeechModelManager,
} from "./models.js";

const fake = randomBytes(200_000);
const fakeInfo: SpeechModelInfo = {
  id: "test",
  file: "ggml-test.bin",
  bytes: fake.length,
  sha256: createHash("sha256").update(fake).digest("hex"),
  multilingual: true,
  quantization: "f16",
  approxRamMB: 1,
  description: "test",
};
let dir: string;
let server: TestServer | undefined;
beforeAll(() => {
  dir = tempDir();
});
afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("catalog", () => {
  it("covers tiny, base and small, each with .en and quantised variants", () => {
    const ids = SPEECH_MODELS.map((m) => m.id);
    for (const size of ["tiny", "base", "small"]) {
      for (const id of [size, `${size}.en`, `${size}-q5_1`, `${size}.en-q5_1`])
        expect(ids).toContain(id);
    }
  });

  it("has unique ids and well-formed entries", () => {
    expect(new Set(SPEECH_MODELS.map((m) => m.id)).size).toBe(SPEECH_MODELS.length);
    for (const m of SPEECH_MODELS) {
      expect(m.file).toBe(`ggml-${m.id}.bin`);
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes).toBeGreaterThan(30_000_000);
      expect(m.multilingual).toBe(!m.id.includes(".en"));
      expect(m.quantization).toBe(m.id.endsWith("-q5_1") ? "q5_1" : "f16");
    }
  });

  it("quantised models are smaller than their full-size twins", () => {
    const size = (id: string) => SPEECH_MODELS.find((m) => m.id === id)?.bytes ?? 0;
    expect(size("base.en-q5_1")).toBeLessThan(size("base.en") / 2);
  });

  it("points at a pinned Hugging Face revision, not a moving branch", () => {
    const first = SPEECH_MODELS[0] as SpeechModelInfo;
    const url = modelUrl(first);
    expect(url).toBe(
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_REPO_REVISION}/${first.file}`,
    );
    expect(url).not.toMatch(/resolve\/main/);
  });

  it("records the MIT licence of weights and runtime", () => {
    expect(MODEL_LICENSE.spdx).toBe("MIT");
    expect(MODEL_LICENSE.weights).toMatch(/OpenAI/);
    expect(MODEL_LICENSE.runtime).toMatch(/ggml authors/);
  });
});

describe("SpeechModelManager", () => {
  it("installs a model from a mirror, verifies it and lists it as installed", async () => {
    server = await startServer(Buffer.alloc(0), {}, { "ggml-test.bin": fake });
    const mgr = new SpeechModelManager({
      dataDir: dir,
      baseUrl: server.url,
      extraModels: [fakeInfo],
    });
    expect(await mgr.isInstalled("test")).toBe(false);
    const seen: number[] = [];
    const path = await mgr.install("test", { onProgress: (p) => seen.push(p.fraction) });
    expect(path).toBe(mgr.pathOf("test"));
    expect(seen.at(-1)).toBe(1);
    expect(await mgr.isInstalled("test")).toBe(true);
    expect(await mgr.verify("test")).toBe(true);
    const listed = (await mgr.list()).find((m) => m.id === "test");
    expect(listed).toMatchObject({ installed: true, path });
  });

  it("does not download again once installed", async () => {
    server = await startServer(Buffer.alloc(0), {}, { "ggml-test.bin": fake });
    const mgr = new SpeechModelManager({
      dataDir: dir,
      baseUrl: server.url,
      extraModels: [fakeInfo],
    });
    await mgr.install("test");
    expect(server.requests).toHaveLength(0);
  });

  it("verify() notices a file of the right size but wrong content", async () => {
    const mgr = new SpeechModelManager({ dataDir: dir, extraModels: [fakeInfo] });
    writeFileSync(mgr.pathOf("test"), randomBytes(fake.length));
    expect(await mgr.isInstalled("test")).toBe(true);
    expect(await mgr.verify("test")).toBe(false);
  });

  it("remove() deletes the model and any partial download", async () => {
    const mgr = new SpeechModelManager({ dataDir: dir, extraModels: [fakeInfo] });
    writeFileSync(`${mgr.pathOf("test")}.part`, "x");
    await mgr.remove("test");
    expect(existsSync(mgr.pathOf("test"))).toBe(false);
    expect(existsSync(`${mgr.pathOf("test")}.part`)).toBe(false);
    await mgr.remove("test"); // already gone: no error
  });

  it("refuses a mirror that serves the wrong bytes", async () => {
    server = await startServer(Buffer.alloc(0), {}, { "ggml-test.bin": randomBytes(fake.length) });
    const mgr = new SpeechModelManager({
      dataDir: dir,
      baseUrl: server.url,
      extraModels: [fakeInfo],
    });
    await expect(mgr.install("test")).rejects.toMatchObject({ code: "hash-mismatch" });
    expect(await mgr.isInstalled("test")).toBe(false);
  });

  it("names the valid ids for an unknown model", () => {
    const mgr = new SpeechModelManager({ dataDir: dir });
    expect(() => mgr.pathOf("huge")).toThrow(/Unknown speech model "huge".*base\.en/);
  });

  it("recommends a smaller download on small machines and the multilingual twin on request", () => {
    const mgr = new SpeechModelManager({ dataDir: dir });
    const gb = 1024 ** 3;
    expect(mgr.recommend({ totalMemBytes: 2 * gb })).toBe("base.en-q5_1");
    expect(mgr.recommend({ totalMemBytes: 6 * gb })).toBe("base.en");
    expect(mgr.recommend({ totalMemBytes: 16 * gb })).toBe("small.en-q5_1");
    expect(mgr.recommend({ totalMemBytes: 16 * gb, multilingual: true })).toBe("small-q5_1");
    for (const m of [2, 6, 16]) {
      for (const multilingual of [false, true]) {
        expect(SPEECH_MODELS.map((x) => x.id)).toContain(
          mgr.recommend({ totalMemBytes: m * gb, multilingual }),
        );
      }
    }
  });
});
