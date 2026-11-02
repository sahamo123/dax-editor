// The controller: everything that talks to the server on behalf of the UI. It owns the REST client and the live
// socket, feeds server pushes into the store, and exposes plain async actions (run a command, import, export,
// chat, settings). Actions never throw; failures become toasts or transcript notices.

import type {
  BlenderRenderRequest,
  BlenderStatus,
  CommandResponse,
  ConnectionRequest,
  ImportResult,
  JobInfo,
  ProviderKind,
  Settings,
  SpeechStatus,
  StateResponse,
} from "@dax/protocol";
import type { StoreApi } from "zustand/vanilla";
import type { DaxClient, LiveSocket, LocalModelAction, SocketStatus } from "../api";
import { openLiveSocket, uploadSizeError } from "../api";
import { pickBrowserFiles, pickFiles } from "../platform";
import { aiStepsSince } from "./chat-model";
import { basename } from "./format";
import type { AppStore } from "./store";

/** Replaceable pieces, so tests can run the controller without a network. */
export interface ControllerDeps {
  client: DaxClient;
  store: StoreApi<AppStore>;
  /** Defaults to the real {@link openLiveSocket}. */
  openSocket?: typeof openLiveSocket;
}

/** The files that did not import, if the reply says so (`data` of a partly successful import). */
function failedImports(r: CommandResponse): ImportResult["failed"] {
  if (!r.ok || typeof r.data !== "object" || r.data === null) return [];
  const failed = (r.data as Partial<ImportResult>).failed;
  return Array.isArray(failed) ? failed : [];
}

/** Edits to the provider settings made in the Settings dialog. */
interface SettingsDraft {
  settings: Settings;
  /** New API keys typed by the user, by provider. Sent once, never kept. */
  apiKeys: Partial<Record<ProviderKind, string>>;
  /** Skip the "Settings saved" toast (used by the quick provider switch in the chat header). */
  silent?: boolean;
}

/** The actions the UI can take. Create one per server connection with {@link createController}. */
export interface Controller {
  /** Open the socket and load the first state. */
  start(): void;
  /** Close the socket. */
  stop(): void;
  /** Skip the reconnect countdown. */
  retryNow(): void;
  /** Re-read the full state over REST. */
  refreshState(): Promise<void>;
  /** New/open/save/save-as or uploaded copy; updates the visible project only after server success. */
  project(action: "new" | "open" | "save" | "copy", value?: string | unknown): Promise<boolean>;
  /** Recent project locations from the engine, never browser storage. */
  recentProjects(): Promise<string[]>;
  /** Select the original source using native/browser file selection and preserve the asset identity. */
  relinkMedia(assetId: string): Promise<void>;
  /** Read speech setup; unsupported builds return null with an explanatory notice. */
  speechStatus(): Promise<SpeechStatus | null>;
  /** Install/remove speech or begin an asynchronous transcription. */
  speech(action: "install" | "remove" | "transcribe", assetId?: string): Promise<void>;
  /** Inspect optional Blender without running a render. */
  blenderStatus(): Promise<BlenderStatus | null>;
  /** Render a typed application-owned animation template. */
  renderMotion(request: BlenderRenderRequest): Promise<void>;
  /** Stage a user-selected small PNG/JPG logo locally for a template. */
  stageLogo(file: File): Promise<string | undefined>;
  /** Stage a bounded local audio file for a validated music/SFX operation; never executes an edit itself. */
  stageAudio(file: File): Promise<string | undefined>;
  /** Run a registry command as a manual edit. Failures also raise a toast. Never throws. */
  run(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
  /** Same as {@link Controller.run} but without a failure toast (the caller shows its own message). */
  runQuiet(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
  /** Undo the last change (the `undo` command). Failures raise a toast. */
  undo(): Promise<void>;
  /** Redo the change that was just undone. */
  redo(): Promise<void>;
  /** Import files by absolute path. */
  importPaths(paths: string[]): Promise<boolean>;
  /** Copy selected browser videos into persistent local engine storage and import each; errors become toasts. */
  uploadFiles(files: File[]): Promise<boolean>;
  /**
   * Export to `path`. The server answers as soon as FFmpeg has started (with the export job's id), so progress
   * and the "Exported ..." toast come from job events; a refusal (bad path, file exists) is toasted here.
   */
  exportTo(path: string, overwrite: boolean): Promise<boolean>;
  /**
   * Stage attachments and attempt chat once. Context and attachment failures occur before a request;
   * `chat-rejected` is a confirmed pre-task refusal. `chat-attempted` may have been accepted.
   * Errors are shown in the transcript.
   */
  sendChat(
    text: string,
    options?: { mode?: "edit" | "plan"; steer?: boolean; files?: File[] },
  ): Promise<
    "empty" | "attachment-failed" | "context-unavailable" | "chat-rejected" | "chat-attempted"
  >;
  /** Cancel one queued or running task while preserving its history entry. */
  cancelTask(id: string): Promise<void>;
  /** Stop the running AI run; the transcript shows "Stopped." */
  cancelChat(): Promise<void>;
  /** Return the project to where it was before the AI run `runId` (several undo steps if it made several edits). */
  undoRun(runId: string): Promise<void>;
  /** Re-apply what {@link Controller.undoRun} reverted. */
  redoRun(runId: string): Promise<void>;
  /** Validate and save settings before binding new keys to their connection. Reports failures with a toast. */
  saveSettings(draft: SettingsDraft): Promise<boolean>;
  /** Save/load/remove a named connection and refresh status; never invokes inference. */
  connection(request: ConnectionRequest): Promise<Settings | null>;
  /** Ask the server to re-check which providers are usable (for example after signing in to a CLI). */
  refreshProviders(): Promise<void>;
  /** Explicitly probe the saved connection; may use configured hosted-provider credits. */
  testProvider(kind: ProviderKind): Promise<void>;
  /** Discover model IDs on demand; failures are shown without removing manual entry. */
  providerModels(kind: ProviderKind): Promise<string[]>;
  /** Read the local model's status; the store gets `"unavailable"` if the engine has no such endpoint. */
  loadLocalModel(): Promise<void>;
  /** Download, start, stop, cancel or remove the local model. Progress arrives as `job` events. */
  localModel(action: LocalModelAction): Promise<void>;
}

/** Wire a client and a store together. Nothing happens until `start()`. */
export function createController(deps: ControllerDeps): Controller {
  const { client, store } = deps;
  const openSocket = deps.openSocket ?? openLiveSocket;
  let live: LiveSocket | null = null;
  let manualChain: Promise<unknown> = Promise.resolve();
  let stateEpoch = 0;
  let refreshSequence = 0;
  // Claims only hold successful local job IDs not yet seen in the job store.
  const unseenLocalJobs = new Set<string>();
  const maxUnseenLocalJobs = 128;
  // Job snapshots replace objects; weak markers follow accepted replacements without retaining history.
  const announcedJobs = new WeakSet<JobInfo>();

  const toast = (tone: "info" | "success" | "error", text: string) =>
    store.getState().pushToast(tone, text);

  // A snapshot may be the first way an already-known running job is seen to finish.
  function announceJob(previous: JobInfo | undefined, job: JobInfo, liveEvent: boolean): void {
    if (previous && announcedJobs.has(previous)) announcedJobs.add(job);
    if (announcedJobs.has(job)) return;
    if (job.status === "running" || (previous && previous.status !== "running")) return;
    if (!previous && !liveEvent) return; // Initial snapshots include historical completed jobs.
    if (job.status === "error" && job.cancelled === true) {
      const messages: Record<JobInfo["kind"], string> = {
        proxy: "Media preparation cancelled.",
        export:
          job.label === "Render complete edit preview"
            ? "Effects preview cancelled."
            : "Export cancelled.",
        transcribe: "Transcription cancelled.",
        "speech-setup": "Offline speech setup cancelled.",
        "model-download": "Local model download cancelled.",
        "model-start": "Local model start cancelled.",
        blender: "Motion template cancelled.",
      };
      announcedJobs.add(job);
      toast("info", messages[job.kind]);
    } else if (job.status === "error") {
      announcedJobs.add(job);
      toast("error", job.error ?? `${job.label} failed.`);
    } else if (job.status === "done" && job.kind === "export") {
      announcedJobs.add(job);
      toast(
        "success",
        job.label === "Render complete edit preview"
          ? "Effects preview ready."
          : `Exported ${job.result ? basename(job.result) : "the video"}.`,
      );
    } else if (job.status === "done") {
      const messages: Partial<Record<JobInfo["kind"], string>> = {
        transcribe: "Transcript ready.",
        "speech-setup": "Offline speech ready.",
        "model-download": "Local model downloaded.",
        "model-start": "Local model started.",
        blender: "Motion template ready.",
      };
      const message = messages[job.kind];
      if (message) {
        announcedJobs.add(job);
        toast("success", message);
      }
    }
  }

  function observeJob(previous: JobInfo | undefined, job: JobInfo, liveEvent: boolean): void {
    const claimed = unseenLocalJobs.delete(job.id);
    announceJob(previous, job, liveEvent || claimed);
  }

  function claimLocalJob(data: unknown, before: Record<string, JobInfo>): void {
    if (typeof data !== "object" || data === null) return;
    if (!("jobId" in data) || typeof data.jobId !== "string") return;
    const id = data.jobId;
    if (!id || id.length > 128 || before[id]) return;
    const known = store.getState().jobs[id];
    if (known) {
      // An outcome may have arrived while the command reply was still in flight.
      if (known.status !== "running") announceJob(undefined, known, true);
      return;
    }
    if (unseenLocalJobs.has(id)) return;
    if (unseenLocalJobs.size >= maxUnseenLocalJobs) {
      toast("error", "Some started tasks could not be tracked. Check Work for their status.");
      return;
    }
    unseenLocalJobs.add(id);
  }

  function applySnapshot(state: StateResponse): void {
    stateEpoch++;
    const previous = store.getState().jobs;
    store.getState().applyState(state);
    const current = store.getState().jobs;
    for (const id of new Set(state.jobs.map((job) => job.id))) {
      const accepted = current[id];
      if (accepted) observeJob(previous[id], accepted, false);
    }
  }

  async function refreshState(): Promise<void> {
    const epoch = stateEpoch;
    const sequence = ++refreshSequence;
    const r = await client.getState();
    // A push, project switch, or newer refresh can supersede a delayed HTTP response.
    if (r.ok && epoch === stateEpoch && sequence === refreshSequence) applySnapshot(r.value);
  }

  function onStatus(status: SocketStatus, info: { failures: number; retryAt?: number }) {
    const s = store.getState();
    if (status === "open") {
      s.setConnection({ status: "online", failures: 0, retryAt: null, everOnline: true });
      // Anything that happened while we were away is picked up by reading the state again.
      void refreshState();
    } else if (status === "closed") {
      s.setConnection({
        status: "offline",
        failures: info.failures,
        retryAt: info.retryAt ?? null,
      });
    } else {
      // An attempt is in flight. After a loss keep the banner up ("Reconnecting...") instead of flickering.
      s.setConnection({
        status: s.connection.everOnline ? "offline" : "connecting",
        retryAt: null,
      });
    }
  }

  async function loadLocalModel(): Promise<void> {
    const r = await client.getLocalModel();
    store.getState().setLocalModel(r.ok ? r.value : "unavailable");
  }

  const execute = async (name: string, args: Record<string, unknown> = {}, quiet = false) => {
    const state = store.getState().state;
    const jobsBefore = store.getState().jobs;
    const r = await client.run(
      name,
      args,
      state?.projectId !== undefined && state.revision !== undefined
        ? { projectId: state.projectId, expectedRevision: state.revision }
        : undefined,
    );
    if (!r.ok && !quiet) toast("error", r.error);
    if (!r.ok && r.error.includes("project changed")) await refreshState();
    if (r.ok) {
      claimLocalJob(r.data, jobsBefore);
      await refreshState();
    }
    return r;
  };

  const run = (name: string, args: Record<string, unknown> = {}, quiet = false) => {
    const projectId = store.getState().state?.projectId;
    const next = manualChain.then(() => {
      if (projectId !== store.getState().state?.projectId) {
        const error =
          "The project changed before this edit could run. Submit it again in the intended project.";
        if (!quiet) toast("error", error);
        return { ok: false as const, error };
      }
      // Each local action sees the revision returned by its predecessor. External changes still
      // use the server's conflict check; this never retries an already executed mutation.
      return execute(name, args, quiet);
    });
    manualChain = next.catch(() => undefined);
    return next;
  };

  /** Run `undo`/`redo` `times` times in a row, stopping at the first failure. */
  async function repeat(name: "undo" | "redo", times: number): Promise<boolean> {
    for (let i = 0; i < times; i++) {
      const r = await client.run(name, {});
      if (!r.ok) {
        toast("error", r.error);
        return false;
      }
    }
    return true;
  }

  return {
    start() {
      stateEpoch++;
      live?.close();
      store.getState().setConnection({ status: "connecting" });
      live = openSocket({
        baseUrl: client.baseUrl,
        token: client.token,
        onStatus,
        onEvent(event) {
          const s = store.getState();
          if (event.type === "state") {
            applySnapshot(event.state);
          } else if (event.type === "job") {
            const prev = s.jobs[event.job.id];
            s.applyJob(event.job);
            const accepted = store.getState().jobs[event.job.id];
            if (accepted) observeJob(prev, accepted, true);
          } else {
            s.applyChat(event.runId, event.event, event.startStateId);
          }
        },
      });
    },
    stop() {
      stateEpoch++;
      live?.close();
      live = null;
    },
    retryNow() {
      live?.retryNow();
    },
    refreshState,
    run: (name, args) => run(name, args),
    runQuiet: (name, args) => run(name, args, true),
    async undo() {
      await run("undo");
    },
    async redo() {
      await run("redo");
    },

    async importPaths(paths) {
      const clean = paths.map((p) => p.trim()).filter(Boolean);
      if (clean.length === 0) return false;
      const r = await client.importMedia(clean);
      if (!r.ok) {
        toast("error", r.error);
        return false;
      }
      const failed = failedImports(r);
      if (failed.length === 0) {
        toast(
          "success",
          clean.length === 1 ? "Video imported." : `${clean.length} videos imported.`,
        );
      } else {
        // Some files were fine and some were not: say which, using the engine's own reason.
        toast("error", `${r.summary} ${failed[0]?.error ?? ""}`.trim());
      }
      return true;
    },

    async uploadFiles(files) {
      let imported = false;
      for (const [index, file] of files.entries()) {
        toast("info", `Importing ${index + 1}/${files.length}: ${file.name}…`);
        const result = await client.uploadMedia(file);
        if (!result.ok) toast("error", result.error);
        else {
          imported = true;
          toast("success", `Imported ${file.name}.`);
        }
      }
      return imported;
    },

    async exportTo(path, overwrite) {
      toast("info", "Starting export…");
      const jobsBefore = store.getState().jobs;
      const r = await client.run("export_video", { path, overwrite });
      if (!r.ok) {
        toast("error", r.error);
        return false;
      }
      claimLocalJob(r.data, jobsBefore);
      // With a job id the end of the export is announced by its job events; without one it already ended.
      const started = typeof r.data === "object" && r.data !== null && "jobId" in r.data;
      if (!started) toast("success", r.summary);
      return true;
    },

    async sendChat(text, options = {}) {
      const message = text.trim();
      if (!message) return "empty";
      const snapshot = store.getState().state;
      const projectId = snapshot?.projectId;
      const providerEpoch = snapshot?.providerContextVersion;
      if (
        !projectId ||
        typeof providerEpoch !== "number" ||
        !Number.isSafeInteger(providerEpoch) ||
        providerEpoch < 0
      ) {
        store
          .getState()
          .addNotice(
            "error",
            "The editor cannot verify the project and assistant. Reconnect to an updated engine and try again.",
          );
        return "context-unavailable";
      }
      const files = options.files ?? [];
      if (files.length > 10) {
        store.getState().addNotice("error", "Attach at most 10 videos to one message.");
        return "attachment-failed";
      }
      for (const file of files) {
        const error = uploadSizeError(file);
        if (error) {
          store.getState().addNotice("error", `${file.name}: ${error}`);
          return "attachment-failed";
        }
      }
      const attachments: string[] = [];
      for (const file of files) {
        const uploaded = await client.uploadMedia(file, true);
        if (!uploaded.ok) {
          store.getState().addNotice("error", uploaded.error);
          return "attachment-failed";
        }
        const data = uploaded.data;
        if (
          typeof data !== "object" ||
          data === null ||
          !("path" in data) ||
          typeof data.path !== "string" ||
          !data.path.trim()
        ) {
          store.getState().addNotice("error", "The editor did not confirm the attachment.");
          return "attachment-failed";
        }
        attachments.push(data.path);
      }
      store.getState().beginUserMessage(message);
      const queued = Boolean(store.getState().state?.busy);
      const r = await client.chat(message, {
        mode: options.mode ?? "edit",
        queue: true,
        steer: options.steer ?? false,
        attachments,
        expectedProjectId: projectId,
        expectedProviderEpoch: providerEpoch,
      });
      if (!r.ok) {
        store.getState().addNotice("error", r.error);
        if (r.status === 409) return "chat-rejected";
      } else if (queued)
        store
          .getState()
          .addNotice(
            "info",
            options.steer
              ? "Steering added. The current task continues from its present state."
              : "Request queued. See task status below.",
          );
      return "chat-attempted";
    },

    async cancelTask(id) {
      const result = await client.cancelTask(id);
      if (!result.ok) toast("error", result.error);
      else await refreshState();
    },

    async cancelChat() {
      const snapshot = store.getState();
      const activeTask = snapshot.state?.tasks?.find(
        (task) => task.kind === "chat" && task.status === "running" && !task.steersRunId,
      );
      const activeRun = [...snapshot.chat]
        .reverse()
        .find((item) => item.kind === "run" && item.status === "running");
      const runId = activeTask?.id ?? activeRun?.id;
      if (!runId) {
        toast("info", "The active task is still loading. Wait a moment and try Stop again.");
        return;
      }
      if (snapshot.stoppingRunIds.includes(runId)) return;
      // Pin the request and provisional state to one run, even if another starts before the reply.
      store.getState().setCancelling(runId, true);
      const r = await client.cancelTask(runId);
      if (!r.ok) {
        store.getState().setCancelling(runId, false);
        toast("error", r.error);
      } else if (!r.value.cancelled) {
        store.getState().setCancelling(runId, false);
        toast("info", "That task already finished. The next task was not stopped.");
      } else {
        store.getState().cancelChatLocally(runId);
      }
    },

    async undoRun(runId) {
      const s = store.getState();
      const item = s.chat.find((i) => i.kind === "run" && i.id === runId);
      if (item?.kind !== "run" || !s.state) return;
      const steps = aiStepsSince(s.state.history, item.startStateId);
      if (steps <= 0) return;
      if (await repeat("undo", steps)) store.getState().patchRun(runId, { undoneSteps: steps });
    },

    async redoRun(runId) {
      const item = store.getState().chat.find((i) => i.kind === "run" && i.id === runId);
      if (item?.kind !== "run" || !item.undoneSteps) return;
      if (await repeat("redo", item.undoneSteps))
        store.getState().patchRun(runId, { undoneSteps: 0 });
    },

    async connection(request) {
      const result = await client.connection(request);
      if (!result.ok) {
        toast("error", result.error);
        return null;
      }
      await refreshState();
      return result.value;
    },

    async saveSettings({ settings, apiKeys, silent }) {
      const saved = await client.putSettings(settings);
      if (!saved.ok) {
        toast("error", `Could not save settings: ${saved.error}`);
        return false;
      }
      for (const [kind, key] of Object.entries(apiKeys) as [ProviderKind, string | undefined][]) {
        if (!key) continue;
        const r = await client.setApiKey(kind, key);
        if (!r.ok) {
          toast("error", `Could not save the key: ${r.error}`);
          return false;
        }
      }
      await refreshState();
      if (!silent) toast("success", "Settings saved.");
      return true;
    },

    async refreshProviders() {
      const r = await client.getProviders();
      const current = store.getState().state;
      if (!r.ok) toast("error", r.error);
      // Provider-only changes must not supersede an in-flight full project refresh.
      else if (current) store.getState().applyState({ ...current, providers: r.value });
    },

    async project(action, value) {
      const r =
        action === "new"
          ? await client.projectNew({ name: typeof value === "string" ? value : "Untitled" })
          : action === "open" && typeof value === "string"
            ? await client.projectOpen(value)
            : action === "copy"
              ? await client.projectCopy(value)
              : await client.projectSave(typeof value === "string" ? value : undefined);
      if (!r.ok) {
        toast("error", r.error);
        return false;
      }
      applySnapshot(r.value);
      if (action === "new" || action === "open" || action === "copy") {
        store.getState().patchUi({ setupVisible: action === "new" });
      }
      toast("success", action === "save" ? "Project saved." : "Project opened.");
      return true;
    },

    async recentProjects() {
      const r = await client.projectRecent();
      if (!r.ok) {
        toast("error", r.error);
        return [];
      }
      return r.value.paths;
    },

    async relinkMedia(assetId) {
      try {
        const paths = await pickFiles();
        let path = paths?.[0];
        if (paths === null) {
          const file = (await pickBrowserFiles())[0];
          if (!file) return;
          const uploaded = await client.uploadMedia(file, true);
          if (!uploaded.ok) {
            toast("error", uploaded.error);
            return;
          }
          const data = uploaded.data;
          if (
            typeof data === "object" &&
            data !== null &&
            "path" in data &&
            typeof data.path === "string"
          )
            path = data.path;
        }
        if (path) await run("relink_media", { assetId, path });
      } catch {
        toast("error", "Could not select replacement media.");
      }
    },

    async speechStatus() {
      const r = await client.speechStatus();
      return r.ok ? r.value : null;
    },

    async blenderStatus() {
      const r = await client.blenderStatus();
      return r.ok ? r.value : null;
    },
    async renderMotion(request) {
      const jobsBefore = store.getState().jobs;
      const r = await client.renderMotion(request);
      if (!r.ok) toast("error", r.error);
      else claimLocalJob(r.value, jobsBefore);
      await refreshState();
    },
    async stageLogo(file) {
      if (file.size > 20 * 1024 * 1024 || !/\.(png|jpe?g)$/i.test(file.name)) {
        toast("error", "Choose a PNG/JPG smaller than 20 MB.");
        return;
      }
      const r = await client.uploadMedia(file, true);
      if (!r.ok) {
        toast("error", r.error);
        return;
      }
      return typeof r.data === "object" &&
        r.data !== null &&
        "path" in r.data &&
        typeof r.data.path === "string"
        ? r.data.path
        : undefined;
    },

    async stageAudio(file) {
      if (file.size > 100 * 1024 * 1024 || !/\.(wav|mp3|m4a|aac|ogg|flac|opus)$/i.test(file.name)) {
        toast("error", "Choose a supported audio file smaller than 100 MiB.");
        return;
      }
      const result = await client.uploadMedia(file, true);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      return typeof result.data === "object" &&
        result.data !== null &&
        "path" in result.data &&
        typeof result.data.path === "string"
        ? result.data.path
        : undefined;
    },

    async speech(action, assetId) {
      const jobsBefore = store.getState().jobs;
      const r = await client.speech(action, assetId);
      if (!r.ok) toast("error", r.error);
      else if (action !== "remove") claimLocalJob(r.value, jobsBefore);
      await refreshState();
    },

    async testProvider(kind) {
      const r = await client.testProvider(kind);
      toast(
        r.ok && r.value.status === "connected" ? "success" : "error",
        r.ok ? r.value.detail : r.error,
      );
      await refreshState();
    },

    async providerModels(kind) {
      const r = await client.providerModels(kind);
      if (!r.ok) {
        toast("error", r.error);
        return [];
      }
      return r.value.models;
    },

    loadLocalModel,

    async localModel(action) {
      const jobsBefore = store.getState().jobs;
      const r = await client.localModel(action);
      if (!r.ok) {
        toast("error", r.error);
        return;
      }
      if (action.action === "install" || action.action === "start")
        claimLocalJob(r.value, jobsBefore);
      // None of the replies carries the new status (install and start only name a job), so ask for it.
      await loadLocalModel();
    },
  };
}
