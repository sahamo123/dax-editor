// The embedded local model for the launcher: a LocalModelController built on @dax/local-llm's LocalModelManager, plus the
// connection the `local` AI provider needs. The manager is injectable so tests use a fake and never touch the network.

import {
  DEFAULT_MODEL_ID,
  getModel,
  type LocalModelManager,
  type LocalModelStatus as ManagerStatus,
  MODEL_CATALOG,
  type ModelEntry,
  PINNED_RUNTIME_TAG,
  runtimeAssetCandidates,
} from "@dax/local-llm";
import type { LocalModelStatus } from "@dax/protocol";
import type { LocalModelController } from "@dax/server";

/** Where the `local` provider sends its requests while the built-in model runs. */
export interface LocalConnection {
  /** OpenAI-compatible base URL, `http://127.0.0.1:<port>/v1`. */
  baseUrl: string;
  /** Bearer token the model server requires, or `undefined` when authentication is off. Never log it. */
  apiKey?: string | undefined;
  /** Catalog id of the loaded model; the request's model name unless Settings names one. */
  modelId?: string;
  /** Context window the model was started with, in tokens. `undefined` when the model is not in the catalog. */
  contextTokens?: number;
}

/** A `LocalModelController` (from `@dax/server`) that can also say how to reach its running server. */
export interface EmbeddedModelController extends LocalModelController {
  /** The running server's connection, or `undefined` when it is not running. Cheap; no network. */
  connection(): Promise<LocalConnection | undefined>;
}

/**
 * The part of `LocalModelManager` (from `@dax/local-llm`) this module uses. A test fake only has to implement these six methods.
 */
export type ModelManager = Pick<
  LocalModelManager,
  "status" | "install" | "start" | "stop" | "uninstall" | "current"
>;

/** Options for {@link createLocalModelController}. */
export interface EmbeddedModelOptions {
  /** The manager that does the work. Build one with `new LocalModelManager({ dataDir })` in production. */
  manager: ModelManager;
  /** Platform the llama.cpp runtime is needed for. Default: this process. */
  platform?: NodeJS.Platform;
  /** CPU architecture the runtime is needed for. Default: this process. */
  arch?: string;
}

/** The catalog entry with this id, or `undefined` when there is none (or no id was given). */
function catalogEntry(id: string | undefined): ModelEntry | undefined {
  return id === undefined ? undefined : MODEL_CATALOG.find((m) => m.id === id);
}

/**
 * The model the engine loads: the recommended one when installed, else the default, else the first installed one.
 * This is the same rule as the manager's own pick, so the status shows the model that `start` will load.
 * @returns the chosen id, or `undefined` when nothing is installed.
 */
export function chooseInstalledModel(
  installedIds: readonly string[],
  recommendedId: string,
): string | undefined {
  return (
    [recommendedId, DEFAULT_MODEL_ID].find((id) => installedIds.includes(id)) ?? installedIds[0]
  );
}

/**
 * True when llama.cpp publishes a runtime for this platform and architecture. Pure: it only consults the release asset
 * names, so it never downloads anything.
 */
export function runtimeSupported(platform: NodeJS.Platform, arch: string): boolean {
  try {
    runtimeAssetCandidates(PINNED_RUNTIME_TAG, { platform, arch, backend: "cpu" });
    return true;
  } catch {
    // The release helper throws for platforms and architectures it has no build for.
    return false;
  }
}

/** Decimal gigabytes with one decimal, the way the catalog summaries write sizes ("3.3 GB"). */
function gigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** The first line of a multi-line message, so a status line stays one line (the full log tail is not for the UI). */
function firstLine(text: string): string {
  return text.split("\n")[0] ?? text;
}

/** One human sentence for the model card, from the manager's state. */
function describeState(
  s: ManagerStatus,
  label: string,
  sizeBytes: number,
  installed: boolean,
): string {
  if (s.installing) {
    const progress = s.installing.progress;
    return progress
      ? `Downloading ${label} (${Math.round(progress.fraction * 100)}%)`
      : `Downloading ${label}`;
  }
  switch (s.server.state) {
    case "running":
      return `${label} is running`;
    case "starting":
      return `Starting ${label}`;
    case "stopping":
      return "Stopping";
    case "crashed":
      return `${label} stopped unexpectedly: ${firstLine(s.server.lastError ?? "unknown error")}`;
    default:
      break;
  }
  // A failed start leaves its reason behind until the next start, so the user sees why nothing runs.
  if (s.server.lastError) return `Could not start ${label}: ${firstLine(s.server.lastError)}`;
  if (installed) return `${label} is installed (${gigabytes(sizeBytes)}) and not running`;
  return `Not downloaded (${gigabytes(sizeBytes)})`;
}

/**
 * Map the manager's detailed status to the protocol's {@link LocalModelStatus}, which the UI draws. Pure: the caller
 * supplies the manager's status and whether this platform can run the model at all.
 */
export function toProtocolStatus(s: ManagerStatus, supported: boolean): LocalModelStatus {
  const running = s.server.state === "running";
  const installedId = chooseInstalledModel(
    s.installedModels.map((m) => m.id),
    s.recommendation.modelId,
  );
  // While running, report the model that is loaded; otherwise the one that is installed, or the one install would fetch.
  const modelId =
    running && s.server.modelId ? s.server.modelId : (installedId ?? s.recommendation.modelId);
  const entry = catalogEntry(modelId);
  const sizeBytes = entry?.sizeBytes ?? s.recommendation.sizeBytes;
  const installed = installedId !== undefined;
  const label = entry?.name ?? modelId;
  const detail = supported
    ? describeState(s, label, sizeBytes, installed)
    : "Not available on this computer: no local model runtime is published for it";
  return {
    installed,
    running,
    detail,
    supported,
    modelId,
    label,
    ...(entry ? { description: entry.summary } : {}),
    sizeBytes,
    ...(running && s.server.baseUrl ? { baseUrl: s.server.baseUrl } : {}),
  };
}

/**
 * The default local-model controller: maps the protocol's calls onto a {@link ModelManager} (any object with its six methods).
 *
 * Install and start report progress and cancellation through the task the server passes in. The context window of a
 * started model is its catalog value, and {@link EmbeddedModelController.connection} reports the same value, so the
 * agent budgets for the model that is really loaded.
 */
export function createLocalModelController(options: EmbeddedModelOptions): EmbeddedModelController {
  const manager = options.manager;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  return {
    async status() {
      return toProtocolStatus(await manager.status(), runtimeSupported(platform, arch));
    },
    async install(modelId, task) {
      // `undefined` lets the manager pick the model recommended for this machine.
      await manager.install(modelId, {
        onProgress: (p) => task.onProgress(p.fraction),
        signal: task.signal,
      });
    },
    async start(task) {
      const s = await manager.status();
      const id = chooseInstalledModel(
        s.installedModels.map((m) => m.id),
        s.recommendation.modelId,
      );
      if (!id) throw new Error("No local model is installed yet. Download it first.");
      await manager.start({
        modelId: id,
        signal: task.signal,
        // Passed explicitly so the window the server gets is the one connection() reports.
        contextSize: getModel(id).contextTokens,
      });
    },
    async stop() {
      await manager.stop();
    },
    async uninstall() {
      await manager.uninstall();
    },
    async connection() {
      const handle = manager.current();
      if (!handle) return undefined;
      return {
        baseUrl: handle.baseUrl,
        apiKey: handle.apiKey,
        modelId: handle.modelId,
        contextTokens: catalogEntry(handle.modelId)?.contextTokens,
      };
    },
  };
}

/** True when the controller can report its own connection (the default one does). */
function isEmbedded(controller: LocalModelController): controller is EmbeddedModelController {
  return typeof (controller as Partial<EmbeddedModelController>).connection === "function";
}

/**
 * Where the `local` provider should send requests right now, or `undefined` when the model is not running.
 * A controller that reports its connection is asked directly (it knows the key). An injected controller is read
 * through its status, which carries the base URL but no key.
 */
export async function localConnection(
  controller: LocalModelController,
): Promise<LocalConnection | undefined> {
  if (isEmbedded(controller)) return controller.connection();
  const s = await controller.status();
  if (!s.running || !s.baseUrl) return undefined;
  return {
    baseUrl: s.baseUrl,
    ...(s.modelId ? { modelId: s.modelId } : {}),
    contextTokens: catalogEntry(s.modelId)?.contextTokens,
  };
}
