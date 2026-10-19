// Tests for the embedded local model controller, using a fake manager: no disk model files, no runtime, no network.

import type { LocalModelStatus as ManagerStatus, ServerHandle } from "@dax/local-llm";
import { describe, expect, it } from "vitest";
import {
  chooseInstalledModel,
  createLocalModelController,
  localConnection,
  type ModelManager,
  runtimeSupported,
  toProtocolStatus,
} from "./local-model.js";

const GiB = 1024 ** 3;
const RECOMMENDED = "gemma-4-e2b-qat-q4_0"; // catalog default, 3_349_516_256 bytes, 16 384-token window
const QWEN_SMALL = "qwen3.5-2b-q4km"; // another catalog entry, used as an installed fallback

/** A complete manager status with nothing installed and the model stopped; tests override the parts they care about. */
function managerStatus(over: Partial<ManagerStatus> = {}): ManagerStatus {
  return {
    runtime: { installed: false },
    installedModels: [],
    recommendation: {
      modelId: RECOMMENDED,
      reason: "test machine",
      fits: true,
      sizeBytes: 3_349_516_256,
    },
    hardware: {
      platform: "linux",
      arch: "x64",
      cpuModel: "",
      cpuThreads: 8,
      totalMemBytes: 16 * GiB,
      freeMemBytes: 8 * GiB,
      appleSilicon: false,
      gpus: [],
    },
    installing: undefined,
    server: {
      state: "stopped",
      modelId: undefined,
      baseUrl: undefined,
      loadTimeMs: undefined,
      lastError: undefined,
    },
    ...over,
  };
}

/** A manager double that records what it was asked and returns what the test sets. */
class FakeManager implements ModelManager {
  /** What `status()` returns. */
  statusValue: ManagerStatus = managerStatus();
  /** What `current()` returns; `undefined` means the server is not running. */
  handle: ServerHandle | undefined;
  /** Arguments of every `install` call. */
  installs: {
    modelId: string | undefined;
    onProgress?: (p: { fraction: number }) => void;
    signal?: AbortSignal;
  }[] = [];
  /** Arguments of every `start` call. */
  starts: { modelId?: string; signal?: AbortSignal; contextSize?: number }[] = [];
  /** How many times `stop` ran. */
  stops = 0;
  /** How many times `uninstall` ran. */
  uninstalls = 0;

  async status(): Promise<ManagerStatus> {
    return this.statusValue;
  }
  async install(
    modelId?: string,
    options: { onProgress?: (p: { fraction: number }) => void; signal?: AbortSignal } = {},
  ): Promise<{ modelId: string; path: string; sizeBytes: number }> {
    this.installs.push({ modelId, ...options });
    options.onProgress?.({ fraction: 0.5 });
    return { modelId: modelId ?? RECOMMENDED, path: "/fake/model.gguf", sizeBytes: 1 };
  }
  async start(
    options: { modelId?: string; signal?: AbortSignal; contextSize?: number } = {},
  ): Promise<ServerHandle> {
    this.starts.push(options);
    return {
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "k",
      modelId: options.modelId ?? RECOMMENDED,
      loadTimeMs: 1,
    };
  }
  async stop(): Promise<void> {
    this.stops += 1;
  }
  async uninstall(): Promise<void> {
    this.uninstalls += 1;
  }
  current(): ServerHandle | undefined {
    return this.handle;
  }
}

describe("chooseInstalledModel", () => {
  it("prefers the recommended model, then the default, then the first installed one", () => {
    expect(chooseInstalledModel([QWEN_SMALL, RECOMMENDED], RECOMMENDED)).toBe(RECOMMENDED);
    expect(chooseInstalledModel([QWEN_SMALL, RECOMMENDED], "qwen3.5-4b-q4km")).toBe(RECOMMENDED);
    expect(chooseInstalledModel([QWEN_SMALL], RECOMMENDED)).toBe(QWEN_SMALL);
    expect(chooseInstalledModel([], RECOMMENDED)).toBeUndefined();
  });
});

describe("runtimeSupported", () => {
  it("is true for the platforms llama.cpp publishes and false for the rest", () => {
    expect(runtimeSupported("linux", "x64")).toBe(true);
    expect(runtimeSupported("darwin", "arm64")).toBe(true);
    expect(runtimeSupported("win32", "x64")).toBe(true);
    expect(runtimeSupported("freebsd", "x64")).toBe(false);
    expect(runtimeSupported("linux", "ia32")).toBe(false);
  });
});

describe("toProtocolStatus", () => {
  it("says what can be downloaded when nothing is installed", () => {
    const s = toProtocolStatus(managerStatus(), true);
    expect(s).toMatchObject({
      installed: false,
      running: false,
      supported: true,
      modelId: RECOMMENDED,
      label: "Gemma 4 E2B (recommended)",
      sizeBytes: 3_349_516_256,
      detail: "Not downloaded (3.3 GB)",
    });
    expect(s).not.toHaveProperty("baseUrl");
  });

  it("reports an installed model that is not running", () => {
    const s = toProtocolStatus(
      managerStatus({ installedModels: [{ id: RECOMMENDED, sizeBytes: 3_349_516_256 }] }),
      true,
    );
    expect(s).toMatchObject({ installed: true, running: false, modelId: RECOMMENDED });
    expect(s.detail).toBe("Gemma 4 E2B (recommended) is installed (3.3 GB) and not running");
  });

  it("reports the loaded model and its base URL while running", () => {
    const s = toProtocolStatus(
      managerStatus({
        installedModels: [{ id: RECOMMENDED, sizeBytes: 1 }],
        server: {
          state: "running",
          modelId: QWEN_SMALL,
          baseUrl: "http://127.0.0.1:8123/v1",
          loadTimeMs: 40,
          lastError: undefined,
        },
      }),
      true,
    );
    expect(s).toMatchObject({
      running: true,
      installed: true,
      modelId: QWEN_SMALL,
      baseUrl: "http://127.0.0.1:8123/v1",
    });
    expect(s.detail).toBe("Qwen3.5 2B (basic) is running");
  });

  it("falls back to the first installed model when the recommended one is absent", () => {
    const s = toProtocolStatus(
      managerStatus({ installedModels: [{ id: QWEN_SMALL, sizeBytes: 1 }] }),
      true,
    );
    expect(s).toMatchObject({ installed: true, modelId: QWEN_SMALL, label: "Qwen3.5 2B (basic)" });
  });

  it("shows download progress as a whole percentage", () => {
    const s = toProtocolStatus(
      managerStatus({
        installing: {
          modelId: RECOMMENDED,
          progress: {
            part: "model",
            step: "downloading",
            receivedBytes: 1,
            totalBytes: 2,
            bytesPerSecond: 0,
            fraction: 0.424,
          },
        },
      }),
      true,
    );
    expect(s.detail).toBe("Downloading Gemma 4 E2B (recommended) (42%)");
  });

  it("names the download without a percentage before any progress arrives", () => {
    const s = toProtocolStatus(
      managerStatus({ installing: { modelId: RECOMMENDED, progress: undefined } }),
      true,
    );
    expect(s.detail).toBe("Downloading Gemma 4 E2B (recommended)");
  });

  it("keeps only the first line of a crash report in the status", () => {
    const s = toProtocolStatus(
      managerStatus({
        installedModels: [{ id: RECOMMENDED, sizeBytes: 1 }],
        server: {
          state: "crashed",
          modelId: RECOMMENDED,
          baseUrl: undefined,
          loadTimeMs: undefined,
          lastError:
            "llama-server exited unexpectedly (code 1, signal null). Last output:\nout of memory",
        },
      }),
      true,
    );
    expect(s.running).toBe(false);
    expect(s.detail).toBe(
      "Gemma 4 E2B (recommended) stopped unexpectedly: llama-server exited unexpectedly (code 1, signal null). Last output:",
    );
  });

  it("explains a failed start instead of showing a plain stop", () => {
    const s = toProtocolStatus(
      managerStatus({
        installedModels: [{ id: RECOMMENDED, sizeBytes: 1 }],
        server: {
          state: "stopped",
          modelId: undefined,
          baseUrl: undefined,
          loadTimeMs: undefined,
          lastError: "no free port",
        },
      }),
      true,
    );
    expect(s.detail).toBe("Could not start Gemma 4 E2B (recommended): no free port");
  });

  it("says the model cannot run here when llama.cpp publishes no build for the platform", () => {
    const s = toProtocolStatus(managerStatus(), false);
    expect(s).toMatchObject({ supported: false, installed: false, running: false });
    expect(s.detail).toBe(
      "Not available on this computer: no local model runtime is published for it",
    );
  });
});

describe("createLocalModelController", () => {
  it("maps status through the manager and the platform check", async () => {
    const manager = new FakeManager();
    const controller = createLocalModelController({ manager, platform: "freebsd", arch: "x64" });
    expect(await controller.status()).toMatchObject({ supported: false, installed: false });
  });

  it("installs the recommended model when no id is given and forwards progress and cancellation", async () => {
    const manager = new FakeManager();
    const controller = createLocalModelController({ manager });
    const progress: number[] = [];
    const abort = new AbortController();
    await controller.install(undefined, {
      onProgress: (f) => progress.push(f),
      signal: abort.signal,
    });
    expect(manager.installs).toHaveLength(1);
    expect(manager.installs[0]?.modelId).toBeUndefined();
    expect(progress).toEqual([0.5]);
    // The server aborts the task's signal on cancel; the manager must see that same signal.
    abort.abort();
    expect(manager.installs[0]?.signal?.aborted).toBe(true);
  });

  it("starts the installed model with its catalog context window", async () => {
    const manager = new FakeManager();
    manager.statusValue = managerStatus({ installedModels: [{ id: RECOMMENDED, sizeBytes: 1 }] });
    const controller = createLocalModelController({ manager });
    await controller.start({ onProgress: () => undefined, signal: new AbortController().signal });
    expect(manager.starts).toEqual([
      expect.objectContaining({ modelId: RECOMMENDED, contextSize: 16_384 }),
    ]);
  });

  it("refuses to start when nothing is installed, without starting a process", async () => {
    const manager = new FakeManager();
    const controller = createLocalModelController({ manager });
    await expect(
      controller.start({ onProgress: () => undefined, signal: new AbortController().signal }),
    ).rejects.toThrow("No local model is installed yet");
    expect(manager.starts).toHaveLength(0);
  });

  it("delegates stop and uninstall to the manager", async () => {
    const manager = new FakeManager();
    const controller = createLocalModelController({ manager });
    await controller.stop();
    await controller.uninstall?.();
    expect(manager.stops).toBe(1);
    expect(manager.uninstalls).toBe(1);
  });

  it("reports a connection only while the server runs, with its key and window", async () => {
    const manager = new FakeManager();
    const controller = createLocalModelController({ manager });
    expect(await controller.connection()).toBeUndefined();
    manager.handle = {
      baseUrl: "http://127.0.0.1:7/v1",
      apiKey: "secret-key",
      modelId: RECOMMENDED,
      loadTimeMs: 1,
    };
    expect(await controller.connection()).toEqual({
      baseUrl: "http://127.0.0.1:7/v1",
      apiKey: "secret-key",
      modelId: RECOMMENDED,
      contextTokens: 16_384,
    });
  });
});

describe("localConnection", () => {
  it("asks an embedded controller for its connection, key included", async () => {
    const manager = new FakeManager();
    manager.handle = {
      baseUrl: "http://127.0.0.1:7/v1",
      apiKey: "k",
      modelId: RECOMMENDED,
      loadTimeMs: 1,
    };
    const connection = await localConnection(createLocalModelController({ manager }));
    expect(connection).toMatchObject({ baseUrl: "http://127.0.0.1:7/v1", apiKey: "k" });
  });

  it("reads an injected controller through its status when it has no connection method", async () => {
    const running = {
      async status() {
        return toProtocolStatus(
          managerStatus({
            server: {
              state: "running",
              modelId: RECOMMENDED,
              baseUrl: "http://127.0.0.1:9/v1",
              loadTimeMs: 1,
              lastError: undefined,
            },
          }),
          true,
        );
      },
    } as unknown as Parameters<typeof localConnection>[0];
    expect(await localConnection(running)).toEqual({
      baseUrl: "http://127.0.0.1:9/v1",
      modelId: RECOMMENDED,
      contextTokens: 16_384,
    });
    const stopped = {
      async status() {
        return toProtocolStatus(managerStatus(), true);
      },
    } as unknown as Parameters<typeof localConnection>[0];
    expect(await localConnection(stopped)).toBeUndefined();
  });
});
