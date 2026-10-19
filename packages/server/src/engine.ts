// The server's application logic with no HTTP in it: project, commands, jobs, chat runs, settings and the local model.
// routes.ts maps requests onto these methods; every state change ends in a coalesced `state` event for WebSocket clients.

import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import {
  type CommandContext,
  type CommandOutcome,
  getCommand,
  OVERLAY_PRESETS,
  type Transcriber,
  tryRunCommand,
} from "@dax/core";
import {
  type AgentEvent,
  type CommandResponse,
  type JobInfo,
  PROVIDER_KINDS,
  type PresetInfo,
  type ProviderKind,
  type ProviderStatus,
  type Settings,
  type StateResponse,
  type WsEvent,
} from "@dax/protocol";
import { ProcessRegistry } from "./ffmpeg-run.js";
import { HttpError } from "./http-util.js";
import type {
  AgentRunner,
  AgentRunnerFactory,
  LocalModelController,
  LocalModelStatus,
  ProviderRegistry,
  RunnerEnv,
} from "./interfaces.js";
import { JobManager } from "./jobs.js";
import type { Logger } from "./logger.js";
import { MediaPipeline } from "./media-pipeline.js";
import { resolveInsideRoots } from "./paths.js";
import { ProjectManager } from "./project-manager.js";
import { AppStateStore, SecretStore, SettingsStore } from "./stores.js";
import { SERVER_VERSION } from "./version.js";

/** How long provider status is reused before the registry is asked again. */
const PROVIDER_TTL_MS = 5000;
/** Answer for a manual edit that arrives while an AI run is active. */
const BUSY_MESSAGE = "An AI edit is in progress. Wait for it to finish or cancel it first.";
/** After a cancel, how long to wait for a runner that ignores the abort signal before freeing the `busy` flag anyway. */
const CANCEL_GRACE_MS = 5000;

/** Fully resolved settings for an {@link Engine}. */
export interface EngineConfig {
  dataDir: string;
  allowedRoots: readonly string[];
  runner: AgentRunner | AgentRunnerFactory;
  providers: ProviderRegistry;
  localModel: LocalModelController;
  /** Speech-to-text used by `transcribe` and the cut commands; absent means those commands report that transcription is unavailable. */
  transcriber?: Transcriber;
  log: Logger;
  /** Sends an event to every connected WebSocket client. */
  emit: (event: WsEvent) => void;
  /** True when at least one WebSocket client is connected (skips building state nobody will read). */
  hasListeners: () => boolean;
}

interface ChatRun {
  runId: string;
  abort: AbortController;
  finish: () => void;
}

/** Owns all mutable server state. One instance per server. */
export class Engine {
  readonly settings: SettingsStore;
  readonly secrets: SecretStore;
  readonly jobs: JobManager;
  readonly media: MediaPipeline;
  readonly projects: ProjectManager;
  private readonly processes = new ProcessRegistry();
  private chat: ChatRun | undefined;
  private localTask: AbortController | undefined;
  /** Set from the moment an export is accepted until it ends; aborting it kills FFmpeg. */
  private exportAbort: AbortController | undefined;
  private providerCache: { at: number; value: ProviderStatus[] } | undefined;
  private broadcastScheduled = false;
  private broadcastChain: Promise<void> = Promise.resolve();
  private commandChain: Promise<unknown> = Promise.resolve();
  private closing = false;

  constructor(private readonly cfg: EngineConfig) {
    this.settings = new SettingsStore(cfg.dataDir, cfg.log);
    this.secrets = new SecretStore(cfg.dataDir, cfg.log);
    this.jobs = new JobManager((job, change) => {
      cfg.emit({ type: "job", job });
      if (change !== "progress") this.scheduleBroadcast();
    });
    this.media = new MediaPipeline({
      cacheDir: join(cfg.dataDir, "cache"),
      allowedRoots: cfg.allowedRoots,
      jobs: this.jobs,
      registry: this.processes,
      log: cfg.log,
      onChange: () => this.scheduleBroadcast(),
    });
    this.projects = new ProjectManager({
      dataDir: cfg.dataDir,
      allowedRoots: cfg.allowedRoots,
      appState: new AppStateStore(cfg.dataDir),
      log: cfg.log,
      onChange: () => this.afterChange(),
    });
  }

  /** Load settings and secrets and open the last (or a new) project. */
  async init(): Promise<void> {
    await Promise.all([this.settings.load(), this.secrets.load()]);
    await this.projects.init();
  }

  /** The folders imports and exports are limited to. */
  get allowedRoots(): readonly string[] {
    return this.cfg.allowedRoots;
  }

  // ---------- change notification ----------

  /** Called whenever the project may have changed: look for new media and push state. */
  private afterChange(): void {
    if (this.closing) return;
    this.media.ensureAssets(this.projects.session.project);
    this.scheduleBroadcast();
  }

  /** Push a fresh `state` event soon. Many calls in the same tick produce one event. */
  scheduleBroadcast(): void {
    if (this.broadcastScheduled || this.closing) return;
    this.broadcastScheduled = true;
    setImmediate(() => {
      this.broadcastScheduled = false;
      // Chained so events always go out in the order they were scheduled.
      this.broadcastChain = this.broadcastChain.then(async () => {
        if (!this.cfg.hasListeners()) return;
        try {
          this.cfg.emit({ type: "state", state: await this.buildState() });
        } catch (err) {
          this.cfg.log.error(`could not build state: ${String(err)}`);
        }
      });
    });
  }

  // ---------- state ----------

  /** Assemble everything the UI needs to draw itself. */
  async buildState(): Promise<StateResponse> {
    const session = this.projects.session;
    const state: StateResponse = {
      project: session.project,
      history: session.history(),
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      presets: OVERLAY_PRESETS.map(
        (p): PresetInfo => ({
          id: p.id,
          label: p.label,
          category: p.category,
          description: p.description,
          animation: p.animation,
          defaultDuration: p.defaultDuration,
          defaultText: p.defaultText,
          ...(p.defaultSubtitle !== undefined ? { defaultSubtitle: p.defaultSubtitle } : {}),
        }),
      ),
      jobs: this.jobs.list(),
      settings: this.settings.get(),
      providers: await this.providerStatuses(),
      busy: this.chat !== undefined,
      serverVersion: SERVER_VERSION,
    };
    const path = this.projects.projectPath;
    if (path !== undefined) state.projectPath = path;
    const saveError = session.saveError;
    if (saveError !== undefined) state.saveError = this.cfg.log.redact(saveError);
    return state;
  }

  private runnerEnv(): RunnerEnv {
    return {
      settings: this.settings.get(),
      getApiKey: async (kind) => this.secrets.get(kind),
    };
  }

  /** Provider availability from the injected registry, cached briefly, with `hasApiKey` filled in from the secret store. Never exposes keys. */
  async providerStatuses(force = false): Promise<ProviderStatus[]> {
    const now = Date.now();
    if (!force && this.providerCache && now - this.providerCache.at < PROVIDER_TTL_MS) {
      return this.withKeyFlags(this.providerCache.value);
    }
    let list: ProviderStatus[];
    try {
      list = await withTimeout(this.cfg.providers.list(this.runnerEnv()), 4000);
    } catch (err) {
      this.cfg.log.warn(`provider status check failed: ${String(err)}`);
      list = PROVIDER_KINDS.map((kind) => ({
        kind,
        available: false,
        detail: "Could not check this provider",
      }));
    }
    this.providerCache = { at: now, value: list };
    return this.withKeyFlags(list);
  }

  private withKeyFlags(list: ProviderStatus[]): ProviderStatus[] {
    return list.map((s) => ({ ...s, hasApiKey: this.secrets.has(s.kind) }));
  }

  /** Forget cached provider status (after settings, key or local-model changes). */
  invalidateProviders(): void {
    this.providerCache = undefined;
    this.scheduleBroadcast();
  }

  // ---------- settings ----------

  /** Replace the settings (validated) and push state. */
  async updateSettings(next: unknown): Promise<Settings> {
    const saved = await this.settings.set(next);
    this.invalidateProviders();
    return saved;
  }

  /** Store an API key for a provider. The key is registered for log redaction. */
  async setApiKey(kind: ProviderKind, apiKey: string): Promise<void> {
    await this.secrets.set(kind, apiKey);
    this.invalidateProviders();
  }

  /** Delete the stored API key for a provider. */
  async removeApiKey(kind: ProviderKind): Promise<void> {
    await this.secrets.remove(kind);
    this.invalidateProviders();
  }

  // ---------- commands ----------

  /** True while an AI run is in progress. */
  get busy(): boolean {
    return this.chat !== undefined;
  }

  private commandContext(extra: Partial<CommandContext> = {}): CommandContext {
    return {
      session: this.projects.session,
      source: "manual",
      allowedRoots: [...this.cfg.allowedRoots],
      ...(this.cfg.transcriber ? { transcriber: this.cfg.transcriber } : {}),
      ...extra,
    };
  }

  /** Run one registry command as a manual edit. Failures come back as `{ ok: false }`, never as exceptions. */
  async runCommand(name: string, args: Record<string, unknown>): Promise<CommandResponse> {
    const def = getCommand(name);
    if (!def) return { ok: false, error: `Unknown command "${name}".` };
    if (!def.readOnly && this.chat) {
      return {
        ok: false,
        error: "An AI edit is in progress. Wait for it to finish or cancel it first.",
      };
    }
    try {
      await this.guardPath(name, args);
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
    if (name === "export_video") return this.startExport(args);
    // Edits are applied one at a time so two requests cannot interleave their read-modify-write.
    return this.serial(async () => {
      // Checked again here: an AI run may have started while this call waited for its turn (the check above ran earlier).
      if (!def.readOnly && this.chat) return { ok: false, error: BUSY_MESSAGE };
      return toResponse(await tryRunCommand(this.commandContext(), name, args));
    });
  }

  /** Import files by path through `import_media`; each one becomes a history entry and gets a proxy job. */
  async importFiles(paths: string[]): Promise<CommandResponse> {
    if (this.chat)
      return {
        ok: false,
        error: "An AI edit is in progress. Wait for it to finish or cancel it first.",
      };
    return this.serial(async () => {
      // Checked again inside the queue for the same reason as in runCommand.
      if (this.chat) return { ok: false, error: BUSY_MESSAGE } as const;
      const assetIds: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];
      for (const path of paths) {
        try {
          await this.guardPath("import_media", { path });
          const out = await tryRunCommand(this.commandContext(), "import_media", { path });
          if (out.ok) {
            const id = (out.data as { assetId?: unknown } | undefined)?.assetId;
            if (typeof id === "string") assetIds.push(id);
          } else {
            failed.push({ path, error: out.error });
          }
        } catch (err) {
          failed.push({ path, error: errorMessage(err) });
        }
      }
      if (assetIds.length === 0) {
        return { ok: false, error: failed[0]?.error ?? "Nothing was imported" } as const;
      }
      return {
        ok: true,
        summary: `Imported ${assetIds.length} file(s).${failed.length ? ` ${failed.length} failed.` : ""}`,
        data: { assetIds, failed },
      } as const;
    });
  }

  /** Check, with symlinks resolved, that a command's file path is inside the allowed folders. The command re-checks lexically as well. */
  private async guardPath(name: string, args: Record<string, unknown>): Promise<void> {
    if ((name === "import_media" || name === "export_video") && typeof args.path === "string") {
      await resolveInsideRoots(args.path, this.cfg.allowedRoots);
    }
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.commandChain.then(fn, fn);
    this.commandChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Run `export_video` as a background job. Validation failures (path not allowed, file exists) are
   * answered directly; once FFmpeg is running the HTTP response says "started" and the job reports progress.
   */
  private startExport(args: Record<string, unknown>): Promise<CommandResponse> {
    // A synchronous flag, not the job list: the job is only created at the first progress tick, 1-2 s after the
    // start, and two exports requested in that window would both pass an `isRunning` check.
    if (this.exportAbort || this.jobs.isRunning("export")) {
      return Promise.resolve({ ok: false, error: "An export is already running." });
    }
    const abort = new AbortController();
    this.exportAbort = abort;
    return new Promise<CommandResponse>((resolve) => {
      let job: ReturnType<JobManager["create"]> | undefined;
      let responded = false;
      const respond = (r: CommandResponse) => {
        if (!responded) {
          responded = true;
          resolve(r);
        }
      };
      const label = typeof args.path === "string" ? basename(args.path) : "video";
      // The job is created on first progress so that early validation errors leave no failed job behind.
      const ensureJob = () => {
        job ??= this.jobs.create("export", `Export ${label}`);
        return job;
      };
      const ctx = this.commandContext({
        signal: abort.signal,
        // FFmpeg is tracked so shutdown kills it instead of orphaning it.
        onProcess: (child) => this.processes.add(child),
        onProgress: (fraction) => {
          const j = ensureJob();
          j.progress(fraction);
          respond({ ok: true, summary: `Export of ${label} started.`, data: { jobId: j.id } });
        },
      });
      void tryRunCommand(ctx, "export_video", args).then((out) => {
        if (this.exportAbort === abort) this.exportAbort = undefined;
        if (out.ok) {
          const j = ensureJob();
          const path = (out.data as { path?: unknown } | undefined)?.path;
          j.done(typeof path === "string" ? path : undefined);
          respond({
            ok: true,
            summary: out.summary,
            data: { ...asObject(out.data), jobId: j.id },
          });
        } else {
          job?.fail(out.error);
          respond({ ok: false, error: out.error });
        }
      });
    });
  }

  // ---------- project operations (guarded against AI runs) ----------

  /** Throws 409 while an AI run is in progress; switching projects under it would be confusing. */
  assertIdle(): void {
    if (this.chat) throw new HttpError(409, "An AI edit is in progress. Cancel it first.");
  }

  // ---------- chat ----------

  /** Start an AI run for `message`. Returns the run id immediately; events stream over the WebSocket. Throws 409 if a run is already active. */
  startChat(message: string): string {
    if (this.chat) throw new HttpError(409, "An AI run is already in progress.");
    const runId = randomUUID();
    const abort = new AbortController();
    let finished = false;
    let terminal = false;
    const emit = (event: AgentEvent) => {
      if (finished) return;
      if (event.type === "done" || event.type === "error") terminal = true;
      this.cfg.emit({ type: "chat", runId, event: this.scrubEvent(event) });
    };
    const finish = () => {
      if (finished) return;
      if (!terminal) emit({ type: "done", turns: 0 });
      finished = true;
      if (this.chat?.runId === runId) this.chat = undefined;
      this.scheduleBroadcast();
    };
    this.chat = { runId, abort, finish };
    this.scheduleBroadcast();

    void (async () => {
      try {
        // Edits accepted before this run started finish first; new ones are refused while the run is busy.
        await this.commandChain;
        const runner = await this.resolveRunner();
        await runner.run(message, {
          session: this.projects.session,
          onEvent: emit,
          signal: abort.signal,
          allowedRoots: this.cfg.allowedRoots,
        });
        if (abort.signal.aborted) emit({ type: "status", text: "Cancelled." });
      } catch (err) {
        if (abort.signal.aborted) emit({ type: "status", text: "Cancelled." });
        else emit({ type: "error", message: errorMessage(err) });
      } finally {
        finish();
      }
    })();
    return runId;
  }

  /** Abort the active AI run. Returns false if none is running. */
  cancelChat(): boolean {
    const run = this.chat;
    if (!run) return false;
    run.abort.abort();
    // A runner that ignores the signal must not leave the UI stuck on "busy".
    setTimeout(() => run.finish(), CANCEL_GRACE_MS).unref();
    return true;
  }

  private async resolveRunner(): Promise<AgentRunner> {
    const r = this.cfg.runner;
    if (typeof r === "function") return r(this.runnerEnv());
    return r;
  }

  /** Remove registered secrets from text the runner produced before it reaches a client. */
  private scrubEvent(event: AgentEvent): AgentEvent {
    const redact = this.cfg.log.redact;
    switch (event.type) {
      case "text":
      case "status":
        return { ...event, text: redact(event.text) };
      case "error":
        return { ...event, message: redact(event.message) };
      case "tool_result":
        return { ...event, summary: redact(event.summary) };
      default:
        return event;
    }
  }

  // ---------- local model ----------

  /** Current local-model status from the injected controller. */
  localModelStatus(): Promise<LocalModelStatus> {
    return this.cfg.localModel.status();
  }

  /** Download the local model as a `model-download` job. Returns the job id; throws 409 if a local-model task is already running. */
  installLocalModel(modelId?: string): string {
    return this.startLocalTask("model-download", "Downloading the local model", (task) =>
      this.cfg.localModel.install(modelId, task),
    );
  }

  /** Start the local model as a `model-start` job. Returns the job id. */
  startLocalModel(): string {
    return this.startLocalTask("model-start", "Starting the local model", (task) =>
      this.cfg.localModel.start(task),
    );
  }

  /** Stop the local model. */
  async stopLocalModel(): Promise<void> {
    await this.cfg.localModel.stop();
    this.invalidateProviders();
  }

  /** Abort a running install or start. Returns false if nothing was running. */
  cancelLocalTask(): boolean {
    if (!this.localTask) return false;
    this.localTask.abort();
    return true;
  }

  private startLocalTask(
    kind: JobInfo["kind"],
    label: string,
    fn: (task: { onProgress: (f: number) => void; signal: AbortSignal }) => Promise<void>,
  ): string {
    if (this.localTask) throw new HttpError(409, "A local model task is already running.");
    const job = this.jobs.create(kind, label);
    const abort = new AbortController();
    this.localTask = abort;
    void fn({ onProgress: (f) => job.progress(f), signal: abort.signal })
      .then(() => job.done())
      .catch((err) => job.fail(abort.signal.aborted ? "Cancelled" : errorMessage(err)))
      .finally(() => {
        this.localTask = undefined;
        this.invalidateProviders();
      });
    return job.id;
  }

  // ---------- shutdown ----------

  /** Stop everything: abort AI and model tasks, kill FFmpeg children, stop the local model and flush the project. Safe to call once. */
  async shutdown(): Promise<void> {
    this.closing = true;
    this.chat?.abort.abort();
    this.localTask?.abort();
    this.exportAbort?.abort();
    this.media.shutdown();
    this.processes.killAll();
    await Promise.race([this.cfg.localModel.stop().catch(() => undefined), delay(5000)]);
    await this.projects
      .flush()
      .catch((err) => this.cfg.log.error(`final save failed: ${String(err)}`));
  }
}

function toResponse(out: CommandOutcome): CommandResponse {
  if (!out.ok) return { ok: false, error: out.error };
  return { ok: true, summary: out.summary, ...(out.data !== undefined ? { data: out.data } : {}) };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** A message safe to send to a client for an unexpected error. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
