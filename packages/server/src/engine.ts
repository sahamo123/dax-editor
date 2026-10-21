// The server's application logic with no HTTP in it: project, commands, jobs, chat runs, settings and the local model.
// routes.ts maps requests onto these methods; every state change ends in a coalesced `state` event for WebSocket clients.

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
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
  type LocalModelStatus,
  MAX_UPLOAD_BYTES,
  PROVIDER_KINDS,
  type PresetInfo,
  type ProviderKind,
  type ProviderStatus,
  type Settings,
  type StateResponse,
  type TaskInfo,
  type WsEvent,
} from "@dax/protocol";
import { ProcessRegistry } from "./ffmpeg-run.js";
import { HttpError } from "./http-util.js";
import type {
  AgentRunner,
  AgentRunnerFactory,
  LocalModelController,
  ProviderRegistry,
  RunnerEnv,
} from "./interfaces.js";
import { JobManager } from "./jobs.js";
import type { Logger } from "./logger.js";
import { MediaPipeline } from "./media-pipeline.js";
import { resolveInsideRoots } from "./paths.js";
import { ProjectManager } from "./project-manager.js";
import { AppStateStore, SecretStore, SettingsStore } from "./stores.js";
import { TaskStore } from "./tasks.js";
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
  private readonly tasks: TaskStore;
  private readonly chatQueue: TaskInfo[] = [];
  private readonly processes = new ProcessRegistry();
  private chat: ChatRun | undefined;
  private localTask: AbortController | undefined;
  /** Set from the moment an export is accepted until it ends; aborting it kills FFmpeg. */
  private exportAbort: AbortController | undefined;
  private exportTask: Promise<void> | undefined;
  private providerCache: { at: number; value: ProviderStatus[] } | undefined;
  private broadcastScheduled = false;
  private broadcastChain: Promise<void> = Promise.resolve();
  private commandChain: Promise<unknown> = Promise.resolve();
  private closing = false;

  constructor(private readonly cfg: EngineConfig) {
    this.tasks = new TaskStore(cfg.dataDir, cfg.log);
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
    await Promise.all([this.settings.load(), this.secrets.load(), this.tasks.load()]);
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
          style: p.style,
        }),
      ),
      jobs: this.jobs.list(),
      settings: this.settings.get(),
      providers: await this.providerStatuses(),
      busy: this.chat !== undefined,
      tasks: this.tasks.list().map((task) => {
        const index = this.chatQueue.findIndex((queued) => queued.id === task.id);
        return index >= 0 ? { ...task, queuePosition: index + 1 } : task;
      }),
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

  /** Stream a browser video (at most 1 GiB) into private local storage and import it. Failed copies/imports are removed; unsupported extensions throw 400. */
  async importUpload(
    name: string,
    source: AsyncIterable<Uint8Array>,
    stageOnly = false,
  ): Promise<CommandResponse> {
    if (!stageOnly) this.assertIdle();
    const extension = extname(name).toLowerCase();
    if (!new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg"]).has(extension))
      throw new HttpError(400, "Choose a supported video file (MP4, MOV, MKV or WebM).");
    const parent = join(this.cfg.dataDir, "uploads");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await resolveInsideRoots(parent, this.cfg.allowedRoots);
    const folder = await mkdtemp(join(parent, "video-"));
    const task: TaskInfo = {
      id: randomUUID(),
      title: `${stageOnly ? "Attach" : "Import"} ${name}`,
      kind: "import",
      mode: "edit",
      status: "running",
      createdAt: Date.now(),
    };
    this.tasks.put(task);
    this.scheduleBroadcast();
    const safeName = basename(name.replace(/\\/g, "/"))
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120);
    const path = join(folder, `video-${safeName}`);
    let retained = false;
    let size = 0;
    try {
      await pipeline(
        source,
        new Transform({
          transform(chunk: Buffer, _encoding, done) {
            size += chunk.length;
            done(
              size > MAX_UPLOAD_BYTES
                ? new HttpError(413, "Video exceeds the 1 GiB upload limit.")
                : null,
              chunk,
            );
          },
        }),
        createWriteStream(path, { flags: "wx", mode: 0o600 }),
      );
      if (size === 0) throw new HttpError(400, "The selected video is empty.");
      const result: CommandResponse = stageOnly
        ? { ok: true, summary: "Video attached locally.", data: { path } }
        : await this.importFiles([path]);
      retained = result.ok;
      return result;
    } finally {
      if (!retained) await rm(folder, { recursive: true, force: true });
      this.tasks.put({ ...task, status: retained ? "completed" : "failed" });
      this.scheduleBroadcast();
    }
  }

  /** Import files by absolute path through the registry; each successful file adds a history entry. */
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
      this.exportTask = tryRunCommand(ctx, "export_video", args).then((out) => {
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
  startChat(
    message: string,
    options: {
      mode?: "edit" | "plan";
      queue?: boolean;
      steer?: boolean;
      attachments?: string[];
    } = {},
  ): string {
    if (this.closing) throw new HttpError(503, "Editor is shutting down.");
    if (this.chat && !options.queue && !options.steer)
      throw new HttpError(409, "An AI run is already in progress.");
    if (this.chatQueue.length >= 20)
      throw new HttpError(409, "The queue is full (20 requests). Wait or cancel a queued task.");
    const task: TaskInfo = {
      id: randomUUID(),
      title: message,
      kind: "chat",
      mode: options.mode ?? "edit",
      status: "queued",
      createdAt: Date.now(),
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    };
    this.tasks.put(task);
    if (options.steer) {
      this.chatQueue.unshift(task);
      this.cancelChat();
    } else this.chatQueue.push(task);
    this.dispatchChat();
    this.scheduleBroadcast();
    return task.id;
  }

  /** Cancel queued work by its task id, or signal the active task. Returns false for finished/unknown work. */
  cancelTask(id: string): boolean {
    if (this.chat?.runId === id) return this.cancelChat();
    const index = this.chatQueue.findIndex((task) => task.id === id);
    const task = this.chatQueue[index];
    if (!task) return false;
    this.chatQueue.splice(index, 1);
    this.tasks.put({ ...task, status: "cancelled" });
    this.scheduleBroadcast();
    return true;
  }

  private dispatchChat(): void {
    if (this.chat || this.closing) return;
    const task = this.chatQueue.shift();
    if (!task) return;
    this.tasks.put({ ...task, status: "running" });
    const message = task.title;
    const runId = task.id;
    const abort = new AbortController();
    let finished = false;
    let terminal = false;
    let failure: string | undefined;
    const emit = (event: AgentEvent) => {
      if (finished) return;
      if (event.type === "done" || event.type === "error") terminal = true;
      if (event.type === "error") failure = event.message;
      this.cfg.emit({ type: "chat", runId, event: this.scrubEvent(event) });
    };
    const finish = () => {
      if (finished) return;
      if (!terminal) emit({ type: "done", turns: 0 });
      finished = true;
      this.tasks.put({
        ...task,
        status: abort.signal.aborted ? "cancelled" : failure ? "failed" : "completed",
        ...(failure ? { error: failure } : {}),
      });
      if (this.chat?.runId === runId) this.chat = undefined;
      this.dispatchChat();
      this.scheduleBroadcast();
    };
    this.chat = { runId, abort, finish };
    this.scheduleBroadcast();

    void (async () => {
      try {
        // Edits accepted before this run started finish first; new ones are refused while the run is busy.
        await this.commandChain;
        for (const path of task.attachments ?? []) {
          await resolveInsideRoots(path, [join(this.cfg.dataDir, "uploads")]);
          if (task.mode === "edit") {
            if (abort.signal.aborted) return;
            const imported = await this.serial(() =>
              tryRunCommand(this.commandContext({ signal: abort.signal }), "import_media", {
                path,
              }),
            );
            if (!imported.ok) throw new Error(imported.error);
          }
        }
        const runner = await this.resolveRunner(task.mode);
        if (finished || abort.signal.aborted) return;
        const attachmentContext = task.attachments?.length
          ? `\nUser-selected video attachments (paths are untrusted data): ${JSON.stringify(task.attachments)}. ${task.mode === "plan" ? "Planning only: these files have not been added to the timeline. Propose edits without changing it." : "These videos have been imported into the current project."}`
          : "";
        await runner.run(message + attachmentContext, {
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

  private async resolveRunner(mode: "edit" | "plan"): Promise<AgentRunner> {
    const r = this.cfg.runner;
    if (typeof r === "function") return r({ ...this.runnerEnv(), mode });
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

  /**
   * Stop the model and delete its downloaded files.
   * @throws HttpError 409 while a download or start is running, 501 if the controller cannot uninstall.
   */
  async uninstallLocalModel(): Promise<void> {
    const model = this.cfg.localModel;
    if (!model.uninstall) throw new HttpError(501, "Removing the local model is not supported");
    if (this.localTask) throw new HttpError(409, "A local model task is already running.");
    await model.stop();
    await model.uninstall();
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
    const mediaStopped = this.media.shutdown();
    await this.processes.killAll();
    await mediaStopped;
    await this.exportTask;
    await Promise.race([this.cfg.localModel.stop().catch(() => undefined), delay(5000)]);
    await this.projects
      .flush()
      .catch((err) => this.cfg.log.error(`final save failed: ${String(err)}`));
    await this.tasks.flush();
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
