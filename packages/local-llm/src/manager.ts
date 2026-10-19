/**
 * `LocalModelManager`: the single object the engine server talks to. It ties together hardware
 * detection, the catalog, the llama.cpp runtime installer, the model downloader and the
 * `llama-server` process, and keeps everything under one data directory:
 *
 *     <dataDir>/runtime/<tag>-<platform>-<arch>-<backend>/   llama.cpp build
 *     <dataDir>/models/<modelId>/                            model.gguf + manifest.json
 *     <dataDir>/run/llama-server.pid.json                    leftover-process guard
 *
 * It never decides *when* to download; callers invoke `install()` after the user agrees.
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_MODEL_ID,
  getModel,
  MODEL_CATALOG,
  type ModelEntry,
  recommendModel,
} from "./catalog.js";
import { downloadFile } from "./download.js";
import { LocalLlmError } from "./errors.js";
import { detectHardware, type HardwareInfo } from "./hardware.js";
import {
  type EnsureRuntimeOptions,
  ensureRuntime,
  findInstalledRuntime,
  type RuntimeBackend,
  type RuntimeInfo,
  recommendBackend,
  removeRuntime,
} from "./runtime.js";
import { LlamaServer, type LlamaServerOptions, type ServerState } from "./server.js";

/** Progress of {@link LocalModelManager.install}, reported to `onProgress` and to listeners. */
export interface InstallProgress {
  /** Which part is running: first the llama.cpp `runtime`, then the `model` file. */
  part: "runtime" | "model";
  /** Step inside the part, e.g. `downloading`, `verifying`, `extracting`. */
  step: string;
  /** Bytes received so far for the current file (0 while resolving or extracting). */
  receivedBytes: number;
  /** Size of the current file when known. */
  totalBytes: number | undefined;
  /** Transfer rate in bytes per second (model downloads only). */
  bytesPerSecond: number;
  /** Overall progress from 0 to 1 across runtime and model; the model dominates the size. */
  fraction: number;
}

/** Everything the UI needs to draw the local-model card. */
export interface LocalModelStatus {
  /** Whether a llama.cpp runtime is installed (or provided through `DAX_LLAMA_SERVER`). */
  runtime: {
    installed: boolean;
    tag?: string;
    backend?: string;
    source?: RuntimeInfo["source"];
    /** True when the installed build's SHA-256 was checked against a digest (see {@link RuntimeInfo.verified}). */
    verified?: boolean;
  };
  /** Models that are completely downloaded. */
  installedModels: { id: string; sizeBytes: number }[];
  /** The model recommended for this machine and the machine facts behind it. */
  recommendation: { modelId: string; reason: string; fits: boolean; sizeBytes: number };
  /** Detected hardware (cached after the first call). */
  hardware: HardwareInfo;
  /** An installation in progress, if any. */
  installing: { modelId: string; progress: InstallProgress | undefined } | undefined;
  /** State of the model server. */
  server: {
    state: ServerState;
    modelId: string | undefined;
    baseUrl: string | undefined;
    loadTimeMs: number | undefined;
    /** Description of the last failure (crash or failed start), cleared by a successful start. */
    lastError: string | undefined;
  };
}

/** What a running server offers to the agent. */
export interface ServerHandle {
  /** OpenAI-compatible base URL, `http://127.0.0.1:<port>/v1`. */
  baseUrl: string;
  /** Bearer token to send, or `undefined` if authentication is off. */
  apiKey: string | undefined;
  /** Catalog id of the loaded model; also a fine value for the request's `model` field. */
  modelId: string;
  /** Seconds-free load time in milliseconds. */
  loadTimeMs: number | undefined;
}

/** Notifications for {@link LocalModelManager.onEvent}. */
export type LocalModelEvent =
  | { type: "install-progress"; modelId: string; progress: InstallProgress }
  | { type: "install-finished"; modelId: string }
  | { type: "install-failed"; modelId: string; error: string }
  | { type: "server-state"; state: ServerState }
  | { type: "server-crashed"; error: string };

/** Options for {@link LocalModelManager}. */
export interface LocalModelManagerOptions {
  /** App data directory (created when needed). */
  dataDir: string;
  /** Model list; defaults to {@link MODEL_CATALOG}. */
  catalog?: readonly ModelEntry[];
  /** Hardware detection, replaceable for tests. */
  detect?: () => Promise<HardwareInfo>;
  /** Settings forwarded to {@link ensureRuntime} (tag, binary override, mirrors). */
  runtime?: Partial<Omit<EnsureRuntimeOptions, "dataDir" | "onProgress" | "signal">>;
  /** Settings forwarded to every {@link LlamaServer} (launcher for tests, threads, ...). */
  server?: Partial<Omit<LlamaServerOptions, "binaryPath" | "modelPath">>;
  /** Fetch implementation used for all downloads, for tests. */
  fetch?: typeof fetch;
}

const ManifestSchema = z.object({
  id: z.string(),
  file: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  installedAt: z.string(),
});

/** Runtime installation weighs this much of the overall progress bar (it is about 20 MB). */
const RUNTIME_SHARE = 0.03;

/**
 * Install, start, stop and remove the embedded local model.
 *
 * Methods that change state are serialized per concern: only one `install` runs at a time and
 * only one server exists at a time.
 */
export class LocalModelManager {
  private readonly o: LocalModelManagerOptions;
  private readonly catalog: readonly ModelEntry[];
  private hardware: HardwareInfo | undefined;
  private server: LlamaServer | undefined;
  private serverModelId: string | undefined;
  private lastError: string | undefined;
  private installing:
    | { modelId: string; progress: InstallProgress | undefined; abort: AbortController }
    | undefined;
  /** Starts still in progress, keyed by model id: a second request for the same model joins the first. */
  private readonly starts = new Map<string, Promise<ServerHandle>>();
  /**
   * Bumped by every stop() and by every start that goes on to launch. A start re-checks it after
   * each await and gives up when it changed, so a stop() during the runtime lookup prevents the
   * launch without anyone waiting for the pending start.
   */
  private generation = 0;
  private readonly listeners = new Set<(event: LocalModelEvent) => void>();

  /** @param options See {@link LocalModelManagerOptions}; nothing touches the disk until used. */
  constructor(options: LocalModelManagerOptions) {
    this.o = options;
    this.catalog = options.catalog ?? MODEL_CATALOG;
  }

  /** Subscribe to progress and state events. Returns the function that unsubscribes. */
  onEvent(listener: (event: LocalModelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: LocalModelEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // A faulty listener must not break the manager.
      }
    }
  }

  private modelDir(id: string): string {
    return join(this.o.dataDir, "models", id);
  }

  private async hw(): Promise<HardwareInfo> {
    this.hardware ??= await (this.o.detect ?? detectHardware)();
    return this.hardware;
  }

  /** Read a model's manifest and check the file is there with the recorded size. */
  private async readInstalled(
    id: string,
  ): Promise<{ path: string; sizeBytes: number } | undefined> {
    try {
      const dir = this.modelDir(id);
      const manifest = ManifestSchema.parse(
        JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")),
      );
      const path = join(dir, manifest.file);
      const { size } = await stat(path);
      return size === manifest.sizeBytes ? { path, sizeBytes: size } : undefined;
    } catch {
      return undefined;
    }
  }

  /** Describe everything the UI shows about the local model. Cheap: no hashing, no network. */
  async status(): Promise<LocalModelStatus> {
    const hardware = await this.hw();
    const rec = recommendModel(hardware, this.catalog);
    const installedModels: LocalModelStatus["installedModels"] = [];
    for (const m of this.catalog) {
      const found = await this.readInstalled(m.id);
      if (found) installedModels.push({ id: m.id, sizeBytes: found.sizeBytes });
    }
    let runtime: LocalModelStatus["runtime"] = { installed: false };
    try {
      // `ensureRuntime` would download; look for an existing install only.
      runtime = await this.peekRuntime();
    } catch {
      runtime = { installed: false };
    }
    return {
      runtime,
      installedModels,
      recommendation: {
        modelId: rec.model.id,
        reason: rec.reason,
        fits: rec.fits,
        sizeBytes: rec.model.sizeBytes,
      },
      hardware,
      installing: this.installing
        ? { modelId: this.installing.modelId, progress: this.installing.progress }
        : undefined,
      server: {
        state: this.server?.state ?? "stopped",
        modelId: this.serverModelId,
        baseUrl: this.server?.state === "running" ? this.server.baseUrl : undefined,
        loadTimeMs: this.server?.loadTimeMs,
        lastError: this.lastError,
      },
    };
  }

  private async peekRuntime(): Promise<LocalModelStatus["runtime"]> {
    const hardware = await this.hw();
    const backend = this.o.runtime?.target?.backend ?? recommendBackend(hardware);
    const info = await findInstalledRuntime({
      dataDir: this.o.dataDir,
      target: { ...this.o.runtime?.target, backend },
      ...(this.o.runtime?.tag ? { tag: this.o.runtime.tag } : {}),
      ...(this.o.runtime?.binaryPath ? { binaryPath: this.o.runtime.binaryPath } : {}),
    });
    return info
      ? {
          installed: true,
          tag: info.tag,
          backend: info.backend,
          source: info.source,
          verified: info.verified,
        }
      : { installed: false };
  }

  private async resolveRuntime(
    onProgress?: EnsureRuntimeOptions["onProgress"],
    signal?: AbortSignal,
    forceBackend?: RuntimeBackend,
  ): Promise<RuntimeInfo> {
    const hardware = await this.hw();
    const backend = forceBackend ?? this.o.runtime?.target?.backend ?? recommendBackend(hardware);
    return await ensureRuntime({
      dataDir: this.o.dataDir,
      ...this.o.runtime,
      ...(this.o.fetch && !this.o.runtime?.fetch ? { fetch: this.o.fetch } : {}),
      target: { ...this.o.runtime?.target, backend },
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * Download the llama.cpp runtime (if missing) and the model file, verified and resumable.
   * Calling it again after an interruption continues where it stopped. Does nothing if the model
   * is already complete. Only one installation can run at a time.
   *
   * @param modelId Catalog id; defaults to the model recommended for this machine.
   * @throws LocalLlmError if another installation is running, plus the download errors
   * ({@link HashMismatchError}, {@link InsufficientDiskSpaceError}, {@link DownloadAbortedError}...).
   */
  async install(
    modelId?: string,
    options: { onProgress?: (progress: InstallProgress) => void; signal?: AbortSignal } = {},
  ): Promise<{ modelId: string; path: string; sizeBytes: number }> {
    if (this.installing) {
      throw new LocalLlmError(`An installation of ${this.installing.modelId} is already running`);
    }
    const id = modelId ?? (await this.recommendedId());
    const entry = getModel(id, this.catalog);
    const abort = new AbortController();
    options.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    this.installing = { modelId: id, progress: undefined, abort };

    const report = (progress: InstallProgress) => {
      if (this.installing) this.installing.progress = progress;
      options.onProgress?.(progress);
      this.emit({ type: "install-progress", modelId: id, progress });
    };
    try {
      const existing = await this.readInstalled(id);
      if (existing) {
        this.emit({ type: "install-finished", modelId: id });
        return { modelId: id, ...existing };
      }

      await this.resolveRuntime((p) => {
        const received = p.receivedBytes ?? 0;
        const total = p.totalBytes;
        report({
          part: "runtime",
          step: p.phase,
          receivedBytes: received,
          totalBytes: total,
          bytesPerSecond: 0,
          fraction: total ? RUNTIME_SHARE * Math.min(1, received / total) : 0,
        });
      }, abort.signal);

      const dir = this.modelDir(id);
      await mkdir(dir, { recursive: true });
      const fileName = entry.source.file;
      const target = join(dir, fileName);
      const result = await downloadFile(entry.url, target, {
        sha256: entry.sha256,
        expectedSize: entry.sizeBytes,
        signal: abort.signal,
        ...(this.o.fetch ? { fetch: this.o.fetch } : {}),
        onProgress: (p) =>
          report({
            part: "model",
            step: p.phase,
            receivedBytes: p.receivedBytes,
            totalBytes: p.totalBytes ?? entry.sizeBytes,
            bytesPerSecond: p.bytesPerSecond,
            fraction:
              RUNTIME_SHARE +
              (1 - RUNTIME_SHARE) *
                Math.min(1, p.receivedBytes / (p.totalBytes ?? entry.sizeBytes)),
          }),
      });
      // The manifest is written last: its presence means "complete and verified".
      await writeFile(
        join(dir, "manifest.json"),
        JSON.stringify({
          id,
          file: fileName,
          sizeBytes: result.sizeBytes,
          sha256: result.sha256,
          installedAt: new Date().toISOString(),
        }),
      );
      this.emit({ type: "install-finished", modelId: id });
      return { modelId: id, path: result.path, sizeBytes: result.sizeBytes };
    } catch (error) {
      this.emit({
        type: "install-failed",
        modelId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.installing = undefined;
    }
  }

  /** Cancel a running {@link LocalModelManager.install}; the partial download is kept for resuming. */
  cancelInstall(): void {
    this.installing?.abort.abort();
  }

  private async recommendedId(): Promise<string> {
    return recommendModel(await this.hw(), this.catalog).model.id;
  }

  /**
   * Start the model server and wait until the model is loaded. Returns the running server if the
   * requested model is already up; switches models by restarting.
   *
   * @param options.modelId Installed catalog id. Default: the recommended model if installed,
   * otherwise the default model, otherwise the first installed one.
   * @param options.signal Cancels the start (the process is killed).
   * @param options.contextSize Context window in tokens; default is the catalog entry's value.
   * @throws LocalLlmError when no model is installed; {@link ServerError} when the process fails.
   */
  async start(
    options: { modelId?: string; signal?: AbortSignal; contextSize?: number } = {},
  ): Promise<ServerHandle> {
    const id = options.modelId ?? (await this.pickInstalled());
    // Only a start for the same model can be shared; another model gets its own attempt.
    const pending = this.starts.get(id);
    if (pending) return await pending;
    const run: Promise<ServerHandle> = this.doStart(id, options).finally(() => {
      if (this.starts.get(id) === run) this.starts.delete(id);
    });
    this.starts.set(id, run);
    return await run;
  }

  private async doStart(
    id: string,
    options: { signal?: AbortSignal; contextSize?: number },
  ): Promise<ServerHandle> {
    if (this.server?.state === "running" && this.serverModelId === id) {
      return this.handle(this.server, id);
    }
    // Taking a new generation supersedes any start still waiting for an earlier request.
    const gen = ++this.generation;
    const cancelled = () =>
      new LocalLlmError(`Starting ${id} was cancelled by a later stop() or start()`);
    // The internal stop does not take a generation: this start must survive it.
    await this.stopServer();
    const entry = getModel(id, this.catalog);
    const installed = await this.readInstalled(id);
    if (!installed) throw new LocalLlmError(`Model ${id} is not installed; call install() first`);
    let runtime: RuntimeInfo;
    try {
      runtime = await this.resolveRuntime(undefined, options.signal);
    } catch (error) {
      if (gen !== this.generation) throw cancelled();
      throw error;
    }
    // Nothing is launched once a stop() or a newer start has happened while the runtime resolved.
    if (gen !== this.generation) throw cancelled();
    this.lastError = undefined;
    for (;;) {
      const server = new LlamaServer({
        contextSize: options.contextSize ?? entry.contextTokens,
        pidFile: join(this.o.dataDir, "run", "llama-server.pid.json"),
        ...this.o.server,
        binaryPath: runtime.binaryPath,
        modelPath: installed.path,
      });
      server.on("state", (state) => this.emit({ type: "server-state", state }));
      server.on("crash", (info) => {
        this.lastError = `llama-server exited unexpectedly (code ${info.code}, signal ${info.signal}). Last output:\n${info.logTail.slice(-10).join("\n")}`;
        this.emit({ type: "server-crashed", error: this.lastError });
      });
      this.server = server;
      this.serverModelId = id;
      try {
        await server.start(options.signal);
        if (gen !== this.generation) {
          // A stop() arrived while the server was loading: take it down again.
          await server.stop();
          throw cancelled();
        }
        return this.handle(server, id);
      } catch (error) {
        // A cancelled start leaves the server fields alone: a newer start may own them now.
        if (gen !== this.generation) throw error instanceof LocalLlmError ? error : cancelled();
        this.lastError = error instanceof Error ? error.message : String(error);
        this.server = undefined;
        this.serverModelId = undefined;
        // A GPU build can fail on machines whose Vulkan driver is missing or broken. The CPU
        // build always works, so retry once with it instead of leaving the user without a model.
        if (
          runtime.backend === "vulkan" &&
          runtime.source !== "override" &&
          !options.signal?.aborted
        ) {
          runtime = await this.resolveRuntime(undefined, options.signal, "cpu");
          if (gen !== this.generation) throw cancelled();
          this.lastError = undefined;
          continue;
        }
        throw error;
      }
    }
  }

  private handle(server: LlamaServer, modelId: string): ServerHandle {
    const baseUrl = server.baseUrl;
    if (!baseUrl) throw new LocalLlmError("The server is running but has no URL");
    return { baseUrl, apiKey: server.apiKey, modelId, loadTimeMs: server.loadTimeMs };
  }

  private async pickInstalled(): Promise<string> {
    const installed: string[] = [];
    for (const m of this.catalog) if (await this.readInstalled(m.id)) installed.push(m.id);
    if (installed.length === 0)
      throw new LocalLlmError("No local model is installed; call install() first");
    const recommended = await this.recommendedId();
    return (
      [recommended, DEFAULT_MODEL_ID].find((c) => installed.includes(c)) ?? (installed[0] as string)
    );
  }

  /** The server's own handle, or `undefined` unless it is running. */
  current(): ServerHandle | undefined {
    return this.server?.state === "running" && this.serverModelId
      ? this.handle(this.server, this.serverModelId)
      : undefined;
  }

  /** The live server object, for logs and memory statistics; `undefined` when none exists. */
  get serverProcess(): LlamaServer | undefined {
    return this.server;
  }

  /**
   * Stop the model server and wait until the process is gone. Safe when nothing runs. A start
   * still in progress is cancelled: it will not launch a server. This does not wait for that start.
   */
  async stop(): Promise<void> {
    this.generation++;
    await this.stopServer();
  }

  /** Stop whatever server this manager holds, without cancelling starts (see {@link stop}). */
  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.serverModelId = undefined;
    if (server) await server.stop();
  }

  /**
   * Remove downloaded data. Stops the server first.
   * @param modelId Model to delete; omit to delete every model.
   * @param options.includeRuntime Also delete the llama.cpp runtime.
   */
  async uninstall(modelId?: string, options: { includeRuntime?: boolean } = {}): Promise<void> {
    this.cancelInstall();
    await this.stop();
    if (modelId) {
      getModel(modelId, this.catalog);
      await rm(this.modelDir(modelId), { recursive: true, force: true });
    } else {
      await rm(join(this.o.dataDir, "models"), { recursive: true, force: true });
    }
    if (options.includeRuntime) await removeRuntime(this.o.dataDir);
  }
}
