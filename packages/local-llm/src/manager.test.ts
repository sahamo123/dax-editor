import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ModelEntry } from "./catalog.js";
import { MODEL_CATALOG } from "./catalog.js";
import { DownloadAbortedError, HashMismatchError, LocalLlmError } from "./errors.js";
import type { HardwareInfo } from "./hardware.js";
import {
  type InstallProgress,
  type LocalModelEvent,
  LocalModelManager,
  type LocalModelManagerOptions,
} from "./manager.js";
import { startFileServer, type TestFileServer } from "./test-helpers/file-server.js";

const fake = join(import.meta.dirname, "test-helpers", "fake-llama-server.mjs");
const modelBytes = randomBytes(900_000);
const modelHash = createHash("sha256").update(modelBytes).digest("hex");

const hardware = (gib: number): HardwareInfo => ({
  platform: process.platform,
  arch: process.arch,
  cpuModel: "test cpu",
  cpuThreads: 4,
  totalMemBytes: gib * 1024 ** 3,
  freeMemBytes: gib * 1024 ** 3,
  appleSilicon: false,
  gpus: [],
});

let files: TestFileServer;
let dir: string;
let catalog: ModelEntry[];
const managers: LocalModelManager[] = [];

beforeAll(async () => {
  files = await startFileServer({ "/small.gguf": modelBytes });
});
afterAll(async () => {
  await files.close();
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dax-mgr-"));
  files.behavior = {};
  files.requests.length = 0;
  const base = MODEL_CATALOG[0] as ModelEntry;
  const small = (id: string, extra: Partial<ModelEntry> = {}): ModelEntry => ({
    ...base,
    id,
    url: `${files.url}/small.gguf`,
    source: { ...base.source, file: "small.gguf" },
    sizeBytes: modelBytes.length,
    sha256: modelHash,
    minRamBytes: 1024 ** 3,
    ...extra,
  });
  catalog = [small("tiny-a", { recommendedFor: "small" }), small("tiny-b")];
});
afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.stop()));
  rmSync(dir, { recursive: true, force: true });
});

function make(extra: Partial<LocalModelManagerOptions> = {}, env: Record<string, string> = {}) {
  const m = new LocalModelManager({
    dataDir: dir,
    catalog,
    detect: async () => hardware(8),
    runtime: { binaryPath: fake },
    server: {
      launcher: { command: process.execPath, args: [fake] },
      healthPollMs: 25,
      env: { FAKE_LOAD_MS: "100", ...env },
    },
    ...extra,
  });
  managers.push(m);
  return m;
}

/**
 * A fetch for the runtime manager that holds every release-API call until `release()` is called,
 * so a start can be parked in the runtime lookup for as long as a test needs. The release answer
 * is an error, so a start that does get past the gate fails rather than downloading anything.
 */
function gatedReleaseApi(): { fetch: typeof fetch; release: () => void } {
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  const fetchGated: typeof fetch = async (input, init) => {
    if (String(input).includes("/repos/")) {
      await gate;
      return new Response("unavailable", { status: 503 });
    }
    return await fetch(input, init);
  };
  return { fetch: fetchGated, release: () => open() };
}

describe("LocalModelManager", () => {
  it("stop() during a start that is still looking up the runtime keeps the server from launching", async () => {
    // Install with the binary override, so the runtime is not needed to get the model on disk.
    await make().install("tiny-a");
    const gate = gatedReleaseApi();
    const m = make({
      runtime: {
        apiBase: files.url,
        downloadBase: files.url,
        allowUnverified: true,
        fetch: gate.fetch,
      },
    });
    const launches: string[] = [];
    m.onEvent((e) => {
      if (e.type === "server-state" && e.state === "starting") launches.push(e.state);
    });
    const pending = m.start({ modelId: "tiny-a" });
    const outcome = pending.then(
      () => "started",
      (error: unknown) => error,
    );
    await new Promise((r) => setTimeout(r, 100)); // let the start reach the release API
    // stop() must return while the start is still parked: it must not wait for the start.
    await m.stop();
    gate.release();
    const error = await outcome;
    expect(error).toBeInstanceOf(LocalLlmError);
    expect(String((error as Error).message)).toMatch(/cancelled/);
    expect(launches).toEqual([]);
    expect(m.serverProcess).toBeUndefined();
  });

  it("a start for another model does not share the pending start, and the old start is cancelled", async () => {
    await make().install("tiny-a");
    const gate = gatedReleaseApi();
    const m = make({
      runtime: {
        apiBase: files.url,
        downloadBase: files.url,
        allowUnverified: true,
        fetch: gate.fetch,
      },
    });
    const first = m.start({ modelId: "tiny-a" }).then(
      () => "started",
      (error: unknown) => error,
    );
    await new Promise((r) => setTimeout(r, 100));
    // tiny-b is not installed, so its own start must fail on its own terms; before the fix it
    // joined tiny-a's pending start and waited for the gate.
    const other = m.start({ modelId: "tiny-b" }).then(
      () => "started",
      (error: unknown) => error,
    );
    const otherError = await Promise.race([
      other,
      new Promise((r) => setTimeout(() => r("hung"), 2000)),
    ]);
    gate.release();
    expect(otherError).toBeInstanceOf(LocalLlmError);
    expect(String((otherError as Error).message)).toMatch(/not installed/);
    const firstError = await first;
    expect(firstError).toBeInstanceOf(LocalLlmError);
    expect(String((firstError as Error).message)).toMatch(/cancelled/);
  });

  it("reports an empty status with a recommendation before anything is installed", async () => {
    const s = await make().status();
    expect(s.installedModels).toEqual([]);
    expect(s.recommendation.modelId).toBe("tiny-a");
    expect(s.recommendation.fits).toBe(true);
    expect(s.runtime.installed).toBe(true); // the override binary exists
    expect(s.server.state).toBe("stopped");
    expect(s.installing).toBeUndefined();
    expect(s.hardware.cpuModel).toBe("test cpu");
  });

  it("installs a model with progress, writes a manifest and shows it in status", async () => {
    const m = make();
    const progress: InstallProgress[] = [];
    const events: LocalModelEvent["type"][] = [];
    m.onEvent((e) => events.push(e.type));
    const result = await m.install("tiny-a", { onProgress: (p) => progress.push(p) });
    expect(result.sizeBytes).toBe(modelBytes.length);
    expect(statSync(result.path).size).toBe(modelBytes.length);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every((p) => p.fraction >= 0 && p.fraction <= 1)).toBe(true);
    expect(progress.at(-1)?.part).toBe("model");
    expect(progress.at(-1)?.fraction).toBeCloseTo(1, 1);
    expect(events).toContain("install-progress");
    expect(events.at(-1)).toBe("install-finished");
    const s = await m.status();
    expect(s.installedModels).toEqual([{ id: "tiny-a", sizeBytes: modelBytes.length }]);
  });

  it("installs the recommended model when no id is given", async () => {
    const result = await make().install();
    expect(result.modelId).toBe("tiny-a");
  });

  it("does nothing when the model is already installed", async () => {
    const m = make();
    await m.install("tiny-a");
    const requests = files.requests.length;
    await m.install("tiny-a");
    expect(files.requests.length).toBe(requests);
  });

  it("refuses a second concurrent installation", async () => {
    files.behavior = { chunkDelayMs: 10 };
    const m = make();
    const first = m.install("tiny-a");
    await expect(m.install("tiny-b")).rejects.toBeInstanceOf(LocalLlmError);
    await first;
  });

  it("cancels an installation and resumes it later from the partial file", async () => {
    files.behavior = { chunkDelayMs: 10 };
    const m = make();
    const install = m.install("tiny-a", {
      onProgress: (p) => {
        if (p.receivedBytes > 200_000) m.cancelInstall();
      },
    });
    await expect(install).rejects.toBeInstanceOf(DownloadAbortedError);
    expect((await m.status()).installedModels).toEqual([]);
    expect((await m.status()).installing).toBeUndefined();

    files.behavior = {};
    files.requests.length = 0;
    await m.install("tiny-a");
    expect(files.requests[0]?.range).toMatch(/^bytes=\d+-$/);
    expect((await m.status()).installedModels).toHaveLength(1);
  });

  it("rejects a model whose hash does not match the catalog and records no manifest", async () => {
    catalog = [{ ...(catalog[0] as ModelEntry), sha256: "0".repeat(64) }];
    const m = make({ catalog });
    const events: LocalModelEvent[] = [];
    m.onEvent((e) => events.push(e));
    await expect(m.install("tiny-a")).rejects.toBeInstanceOf(HashMismatchError);
    expect((await m.status()).installedModels).toEqual([]);
    expect(events.at(-1)?.type).toBe("install-failed");
  });

  it("rejects unknown model ids", async () => {
    await expect(make().install("nope")).rejects.toThrow(/Unknown model/);
  });

  it("starts the server, exposes baseUrl/apiKey/model, and stops it", async () => {
    const m = make();
    await m.install("tiny-a");
    const handle = await m.start();
    expect(handle.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(handle.modelId).toBe("tiny-a");
    expect(handle.apiKey).toBeTruthy();
    expect(m.current()?.baseUrl).toBe(handle.baseUrl);
    const s = await m.status();
    expect(s.server.state).toBe("running");
    expect(s.server.baseUrl).toBe(handle.baseUrl);
    expect(s.server.loadTimeMs).toBeGreaterThan(0);

    const again = await m.start();
    expect(again.baseUrl).toBe(handle.baseUrl); // same server, no restart

    await m.stop();
    expect((await m.status()).server.state).toBe("stopped");
    expect(m.current()).toBeUndefined();
    await expect(fetch(`${handle.baseUrl.replace("/v1", "")}/health`)).rejects.toThrow();
  });

  it("refuses to start with no model installed", async () => {
    await expect(make().start()).rejects.toThrow(/No local model is installed/);
  });

  it("switches models by restarting", async () => {
    const m = make();
    await m.install("tiny-a");
    await m.install("tiny-b");
    const a = await m.start({ modelId: "tiny-a" });
    const b = await m.start({ modelId: "tiny-b" });
    expect(b.modelId).toBe("tiny-b");
    expect(b.baseUrl).not.toBe(a.baseUrl);
  });

  it("surfaces a crash in status and events, and can start again afterwards", async () => {
    const m = make({}, { FAKE_EXIT_AFTER_MS: "700" });
    await m.install("tiny-a");
    const events: LocalModelEvent["type"][] = [];
    m.onEvent((e) => events.push(e.type));
    await m.start();
    await new Promise<void>((resolve) => {
      const off = m.onEvent((e) => {
        if (e.type === "server-crashed") {
          off();
          resolve();
        }
      });
    });
    const s = await m.status();
    expect(s.server.state).toBe("crashed");
    expect(s.server.lastError).toMatch(/exited unexpectedly/);
    expect(events).toContain("server-crashed");
    expect(m.current()).toBeUndefined();
    const restarted = await m.start();
    expect(restarted.baseUrl).toBeTruthy();
  });

  it("records the last error when the server fails to start", async () => {
    const m = make({}, { FAKE_FAIL_STARTUP: "1" });
    await m.install("tiny-a");
    await expect(m.start()).rejects.toThrow(/exited during start-up/);
    const s = await m.status();
    expect(s.server.state).toBe("stopped");
    expect(s.server.lastError).toMatch(/failed to load model/);
  });

  it("falls back to the CPU runtime when the GPU build fails to start", async () => {
    // Runtimes are real archives here so the manager has two different builds to choose from.
    const { makeTarGz, makeZip } = await import("./test-helpers/archives.js");
    const { runtimeAssetCandidates } = await import("./runtime.js");
    const tag = "b7";
    const binary = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const asset = (backend: "cpu" | "vulkan") => {
      const name = runtimeAssetCandidates(tag, {
        platform: process.platform,
        arch: process.arch,
        backend,
      })[0] as string;
      const entries = [
        { path: `${tag}/` },
        { path: `${tag}/${binary}`, content: backend, mode: 0o755 },
      ];
      return [
        name,
        name.endsWith(".zip")
          ? makeZip(entries.slice(1).map((e) => ({ ...e, path: binary })))
          : makeTarGz(entries),
      ] as const;
    };
    const assets = new Map([asset("cpu"), asset("vulkan")]);
    for (const [name, data] of assets) files.set(`/dl/${name}`, data);
    const api = [
      {
        tag_name: tag,
        assets: [...assets].map(([name, data]) => ({
          name,
          size: data.length,
          browser_download_url: `${files.url}/dl/${name}`,
        })),
      },
    ];
    files.set("/repos/ggml-org/llama.cpp/releases", Buffer.from(JSON.stringify(api)));
    const gpuMachine = {
      ...hardware(16),
      gpus: [{ kind: "nvidia" as const, discrete: true, vramBytes: 12 * 1024 ** 3 }],
    };
    const failOnce = join(dir, "fail-once");
    const used: string[] = [];
    const m = make({
      detect: async () => gpuMachine,
      // The fake API publishes no digest, so this test opts in to an unverified install; the test
      // is about choosing between builds, not about verification.
      runtime: { apiBase: files.url, downloadBase: files.url, allowUnverified: true },
      // The "binary" is a data file; the launcher runs the fake server and we record which build was asked for.
      server: {
        launcher: { command: process.execPath, args: [fake] },
        healthPollMs: 25,
        env: { FAKE_LOAD_MS: "50", FAKE_FAIL_ONCE_FILE: failOnce },
      },
    });
    m.onEvent((e) => {
      if (e.type === "server-state" && e.state === "starting") used.push("start");
    });
    await m.install("tiny-a");
    const handle = await m.start();
    expect(handle.baseUrl).toBeTruthy();
    expect(used).toHaveLength(2); // first attempt (vulkan) failed, second (cpu) worked
    const status = await m.status();
    expect(status.runtime.backend).toBe("vulkan"); // status reports the preferred build
    expect(existsSync(join(dir, "runtime"))).toBe(true);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(dir, "runtime")).sort()).toEqual([
      `${tag}-${process.platform}-${process.arch}-cpu`,
      `${tag}-${process.platform}-${process.arch}-vulkan`,
    ]);
  });

  it("uninstalls one model or everything, stopping the server first", async () => {
    const m = make();
    await m.install("tiny-a");
    await m.install("tiny-b");
    await m.start({ modelId: "tiny-a" });
    await m.uninstall("tiny-a");
    expect((await m.status()).server.state).toBe("stopped");
    expect((await m.status()).installedModels.map((x) => x.id)).toEqual(["tiny-b"]);
    await m.uninstall();
    expect((await m.status()).installedModels).toEqual([]);
    expect(existsSync(join(dir, "models"))).toBe(false);
  });

  it("detects a truncated model file and reports it as not installed", async () => {
    const m = make();
    const { path } = await m.install("tiny-a");
    const { truncateSync } = await import("node:fs");
    truncateSync(path, 1000);
    expect((await m.status()).installedModels).toEqual([]);
  });
});
