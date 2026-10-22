// The contract between the engine server and everything that talks to it (desktop UI, CLI, MCP, tests).
// Types and zod schemas only; no behaviour. If you change a shape here, both sides get a compile error.

import type { HistoryItem, OverlayStyle, Project } from "@dax/core";
import { z } from "zod";

/** Name of the HTTP header carrying the per-launch token: `Authorization: Bearer <token>`. */
export const AUTH_SCHEME = "Bearer";

/** URL paths of the server API. Media URLs also accept the token as a `?token=` query parameter because `<video>` and `<img>` cannot send headers. */
export const API = {
  health: "/api/health",
  state: "/api/state",
  command: "/api/command",
  importMedia: "/api/import",
  uploadMedia: "/api/import/upload",
  projectNew: "/api/project/new",
  projectOpen: "/api/project/open",
  projectSave: "/api/project/save",
  chat: "/api/chat",
  chatCancel: "/api/chat/cancel",
  taskCancel: "/api/tasks/:taskId/cancel",
  settings: "/api/settings",
  apiKey: "/api/settings/api-key",
  providers: "/api/providers",
  providerTest: "/api/providers/test",
  providerModels: "/api/providers/models",
  localModel: "/api/local-model",
  /** `POST`: download the local model as a `model-download` job. Body: {@link LocalModelInstallRequestSchema}. */
  localModelInstall: "/api/local-model/install",
  /** `POST`: start the downloaded model as a `model-start` job. */
  localModelStart: "/api/local-model/start",
  /** `POST`: stop the running model. */
  localModelStop: "/api/local-model/stop",
  /** `POST`: abort a running download or start. */
  localModelCancel: "/api/local-model/cancel",
  /** `POST`: stop the model if needed and delete its downloaded files. */
  localModelUninstall: "/api/local-model/uninstall",
  ws: "/ws",
  /** `/api/media/:assetId/proxy.mp4` etc. Build these with {@link mediaUrl}. */
  media: "/api/media",
} as const;

/** Width in pixels of one filmstrip frame. A `filmstrip.jpg` is `frames * FILMSTRIP_FRAME_WIDTH` wide. */
export const FILMSTRIP_FRAME_WIDTH = 96;
/** Height in pixels of the filmstrip (and of each frame). Frames are letterboxed to 96x54, whatever the video's aspect ratio. */
export const FILMSTRIP_FRAME_HEIGHT = 54;
/** Name of the response header on `filmstrip.jpg` that carries the frame count. */
export const FILMSTRIP_FRAMES_HEADER = "X-Dax-Frames";

/**
 * Number of frames in an asset's filmstrip: one per second of `durationSec`, between 4 and 120. Frame `k` shows
 * source time `k * duration / frames`. A client that cannot read the header can also use `image width / FILMSTRIP_FRAME_WIDTH`.
 */
export function filmstripFrameCount(durationSec: number): number {
  return Math.min(120, Math.max(4, Math.ceil(durationSec)));
}

/** Waveform samples per second for an asset of `durationSec`: 50, reduced for very long media so the JSON stays under about 20000 values. */
export function waveformRate(durationSec: number): number {
  return durationSec > 400 ? Math.max(1, Math.floor(20000 / durationSec)) : 50;
}

/**
 * The body of `waveform.json`: peak levels of the first audio stream, spread evenly over the whole asset
 * (`peaks.length` is about `duration * peaksPerSecond`). Each peak is the largest absolute sample of its window, from 0 to 1.
 */
export const WaveformSchema = z.object({
  /** Format version; 1 today. */
  version: z.literal(1),
  /** Length of the asset in seconds, the span the peaks cover. */
  duration: z.number().nonnegative(),
  /** Peaks per second of source time (see {@link waveformRate}). */
  peaksPerSecond: z.number().positive(),
  /** Peak levels, 0 to 1. */
  peaks: z.array(z.number().min(0).max(1)),
});
/** A validated {@link WaveformSchema} value. */
export type Waveform = z.infer<typeof WaveformSchema>;

/** The kinds of media URL the server serves for an asset. */
export type MediaKind = "proxy.mp4" | "thumb.jpg" | "waveform.json" | "filmstrip.jpg";

/** Build the URL of a media file for an asset, with the auth token as a query parameter. */
export function mediaUrl(
  base: string,
  token: string,
  assetId: string,
  kind: MediaKind,
  params: Record<string, string | number> = {},
): string {
  const q = new URLSearchParams({
    token,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${base.replace(/\/$/, "")}${API.media}/${encodeURIComponent(assetId)}/${kind}?${q.toString()}`;
}

// ---------- requests ----------

/** Run one command from the registry (see `COMMANDS` in `@dax/core`). Used by the UI for every manual edit. */
export const CommandRequestSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  /** Refuse an edit if the open project changed since the caller inspected it. */
  expectedRevision: z.number().int().nonnegative().optional(),
  /** Per-open session identity; prevents a revision from a different project matching. */
  projectId: z.string().optional(),
});
/** A validated {@link CommandRequestSchema} value. */
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/** The outcome of a command, as returned by `POST /api/command`. */
export type CommandResponse =
  | { ok: true; summary: string; data?: unknown }
  | { ok: false; error: string };

/** Import one or more video files by absolute path and place them on the timeline. */
export const ImportRequestSchema = z.object({ paths: z.array(z.string().min(1)).min(1).max(50) });
/** A validated {@link ImportRequestSchema} value. */
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

/** Maximum bytes in one browser video upload (1 GiB); enforced while streaming to local disk. */
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
/** Browser upload filename metadata. Only the extension is used for the server-generated storage path. */
export const UploadNameSchema = z.string().min(1).max(255);

/** Start a new, empty project. */
export const ProjectNewRequestSchema = z.object({
  name: z.string().min(1).max(120).default("Untitled"),
  width: z.number().int().min(16).max(8192).optional(),
  height: z.number().int().min(16).max(8192).optional(),
  fps: z.number().min(1).max(120).optional(),
});
/** A validated {@link ProjectNewRequestSchema} value. */
export type ProjectNewRequest = z.infer<typeof ProjectNewRequestSchema>;

/** Open a saved project file, or save the current one (to `path`, or its current file if omitted). */
export const ProjectPathRequestSchema = z.object({ path: z.string().min(1).optional() });
/** A validated {@link ProjectPathRequestSchema} value. */
export type ProjectPathRequest = z.infer<typeof ProjectPathRequestSchema>;

/** Send a chat message to the active AI provider. The reply streams over the WebSocket as `chat` events. */
export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  mode: z.enum(["edit", "plan"]).default("edit"),
  queue: z.boolean().default(false),
  steer: z.boolean().default(false),
  attachments: z.array(z.string().min(1)).max(10).default([]),
});
/** A validated {@link ChatRequestSchema} value. */
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A locally tracked unit of chat/import work. Queued requests keep the mode selected when submitted. */
export const TaskInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["chat", "import", "command", "export", "transcribe", "blender"]),
  origin: z.enum(["manual", "ai", "mcp", "transcription", "blender", "export"]).optional(),
  projectId: z.string().optional(),
  provider: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
  startStateId: z.number().int().nonnegative().optional(),
  endStateId: z.number().int().nonnegative().optional(),
  phase: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  mode: z.enum(["edit", "plan"]),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "interrupted"]),
  createdAt: z.number(),
  error: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  queuePosition: z.number().int().positive().optional(),
  steersRunId: z.string().optional(),
});
/** Validated task metadata stored locally and sent with editor state. */
export type TaskInfo = z.infer<typeof TaskInfoSchema>;

/** Where chat messages go. */
export const PROVIDER_KINDS = [
  "local",
  "openai",
  "openai-compatible",
  "openrouter",
  "anthropic",
  "cli-claude",
  "cli-codex",
  "cli-gemini",
] as const;
/** One of {@link PROVIDER_KINDS}. `local` is the embedded model; `cli-*` drive the user's own signed-in command-line agents. */
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Non-editing provider diagnostic request; uses saved settings and secrets only. */
export const ProviderDiagnosticRequestSchema = z.object({ kind: z.enum(PROVIDER_KINDS) });
/** A saved provider's connection/tool probe result, never a guarantee of editing correctness. */
export interface ProviderDiagnostic {
  kind: ProviderKind;
  status: "connected" | "error";
  detail: string;
  checkedAt: number;
  toolsSupported: boolean;
}

/** Non-secret settings for one provider. API keys are never part of this. */
export const ProviderConfigSchema = z.object({
  /** Base URL for `openai-compatible` (for example `http://127.0.0.1:11434/v1` for Ollama). */
  baseUrl: z.string().url().optional(),
  /** Model name to request. */
  model: z.string().min(1).optional(),
  /**
   * The model's context window in tokens. Small windows get a compact tool list, fewer skills, smaller tool results and a
   * shorter conversation. Default: 8192 for the built-in model, 32768 for the others.
   */
  contextTokens: z.number().int().min(2048).max(1_000_000).optional(),
  /** Optional maximum reply tokens; providers may impose a smaller model-specific limit. */
  maxTokens: z.number().int().min(1).max(65_536).optional(),
  /** Optional sampling temperature; omit for models that do not accept this parameter. */
  temperature: z.number().min(0).max(2).optional(),
});
/** A validated {@link ProviderConfigSchema} value. */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/** Settings the UI can read and write. */
export const SettingsSchema = z.object({
  activeProvider: z.enum(PROVIDER_KINDS),
  providers: z.record(z.enum(PROVIDER_KINDS), ProviderConfigSchema),
});
/** A validated {@link SettingsSchema} value. */
export type Settings = z.infer<typeof SettingsSchema>;

/** Store an API key for a provider. Stored outside project files; never returned by the server. */
export const ApiKeyRequestSchema = z.object({
  kind: z.enum(PROVIDER_KINDS),
  apiKey: z.string().min(1).max(500),
});
/** A validated {@link ApiKeyRequestSchema} value. */
export type ApiKeyRequest = z.infer<typeof ApiKeyRequestSchema>;

/** Optional body of `POST /api/local-model/install`: which model to download. Omitted means "the recommended one". */
export const LocalModelInstallRequestSchema = z.object({
  modelId: z.string().min(1).max(200).optional(),
});
/** A validated {@link LocalModelInstallRequestSchema} value. */
export type LocalModelInstallRequest = z.infer<typeof LocalModelInstallRequestSchema>;

// ---------- responses ----------

/** Snapshot of the embedded local model, as returned by `GET /api/local-model`. */
export const LocalModelStatusSchema = z.object({
  /** Model files are on disk. */
  installed: z.boolean(),
  /** The model server is running and accepting requests. */
  running: z.boolean(),
  /** Human-readable summary such as "Not downloaded (2.1 GB)". Always present so the UI has something to show. */
  detail: z.string(),
  /**
   * False when this build has no local-model runtime at all (nothing can be installed or started).
   * Omitted means supported. The UI then explains `detail` instead of offering a download.
   */
  supported: z.boolean().optional(),
  /** Id of the installed model, or of the one `install` would fetch. */
  modelId: z.string().optional(),
  /** Display name of that model, such as "Qwen 2.5 3B (small, fast)". */
  label: z.string().optional(),
  /** One sentence on what that model is good for. */
  description: z.string().optional(),
  /** Download size in bytes of the model that `install` would fetch, if known. */
  sizeBytes: z.number().nonnegative().optional(),
  /** OpenAI-compatible base URL while running. */
  baseUrl: z.string().optional(),
});
/** A validated {@link LocalModelStatusSchema} value. */
export type LocalModelStatus = z.infer<typeof LocalModelStatusSchema>;

/** Reply (HTTP 202) to `POST /api/local-model/install` and `/start`: the id of the `model-download` or `model-start` job to follow. */
export const JobStartedSchema = z.object({ jobId: z.string().min(1) });
/** A validated {@link JobStartedSchema} value. */
export type JobStarted = z.infer<typeof JobStartedSchema>;

/** Reply to `GET /api/health`. */
export const HealthResponseSchema = z.object({ ok: z.literal(true), version: z.string() });
/** A validated {@link HealthResponseSchema} value. */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Reply (HTTP 202) to `POST /api/chat`: the id carried by every `chat` event of the run. A provider that is not set up is reported by an `error` event, not by a failed request. */
export const ChatStartedSchema = z.object({ runId: z.string().min(1) });
/** A validated {@link ChatStartedSchema} value. */
export type ChatStarted = z.infer<typeof ChatStartedSchema>;

/** Reply to `POST /api/chat/cancel` (`cancelled` is false if no run was active) and `POST /api/local-model/cancel`. */
export const CancelResponseSchema = z.object({ cancelled: z.boolean() });
/** A validated {@link CancelResponseSchema} value. */
export type CancelResponse = z.infer<typeof CancelResponseSchema>;

/** Reply to `POST /api/local-model/stop` and `/uninstall`. */
export const OkResponseSchema = z.object({ ok: z.literal(true) });
/** A validated {@link OkResponseSchema} value. */
export type OkResponse = z.infer<typeof OkResponseSchema>;

/** The `data` of a successful `POST /api/import` reply: ids of the new assets and the files that could not be imported. */
export const ImportResultSchema = z.object({
  assetIds: z.array(z.string()),
  failed: z.array(z.object({ path: z.string(), error: z.string() })),
});
/** A validated {@link ImportResultSchema} value. */
export type ImportResult = z.infer<typeof ImportResultSchema>;

/**
 * The `data` of a successful `export_video` reply. The reply comes as soon as FFmpeg has started (the summary says
 * "started"), so `jobId` names the `export` job whose `job` events report progress, completion (with `result`
 * set to the file written) or failure.
 */
export const ExportStartedSchema = z.object({ jobId: z.string().min(1) });
/** A validated {@link ExportStartedSchema} value. */
export type ExportStarted = z.infer<typeof ExportStartedSchema>;

// ---------- state and events ----------

/** Whether a provider can be used right now, and what is missing if not. */
export interface ProviderStatus {
  kind: ProviderKind;
  /** Ready to receive a chat message. */
  available: boolean;
  /** Human-readable reason or hint, e.g. "Add an API key" or "claude is not installed". */
  detail: string;
  /** True if an API key is stored for this provider. */
  hasApiKey?: boolean;
  /**
   * For `cli-*` providers: true if the CLI reports that the user is signed in, false if it is installed but
   * signed out. Omitted when the tool is not installed or its state is unknown (for example no bridge in this build).
   */
  signedIn?: boolean;
  /** Configuration alone does not prove a working inference connection. */
  connectionState?: "configured" | "testing" | "connected" | "loading" | "unavailable" | "error";
  /** Time of the last explicit successful/failed probe, in Unix milliseconds. */
  checkedAt?: number;
}

/** A background task such as making a preview proxy, exporting, or downloading a model. */
export interface JobInfo {
  id: string;
  kind: "proxy" | "export" | "transcribe" | "model-download" | "model-start";
  label: string;
  /** 0 to 1. */
  progress: number;
  status: "running" | "done" | "error";
  error?: string;
  /** For exports: the path written. */
  result?: string;
}

/** A built-in animated text preset, as listed for the UI's drag-and-drop panel. */
export interface PresetInfo {
  id: string;
  label: string;
  category: string;
  description: string;
  animation: string;
  defaultDuration: number;
  defaultText: string;
  defaultSubtitle?: string;
  /** How the preset looks (font size, colours, box, position), so the UI can draw a faithful sample. Absent means the core defaults. */
  style?: Partial<OverlayStyle>;
}

/** Everything the UI needs to draw itself. Pushed over the WebSocket after every change. */
export interface StateResponse {
  /** Per-open project identity and monotonic revision, including undo/redo movements. */
  projectId?: string;
  /** Changes whenever the project is edited or history moves; compare together with projectId. */
  revision?: number;
  project: Project;
  history: HistoryItem[];
  canUndo: boolean;
  canRedo: boolean;
  presets: PresetInfo[];
  jobs: JobInfo[];
  settings: Settings;
  providers: ProviderStatus[];
  /** True while an AI run is in progress. */
  busy: boolean;
  /** Recent local work, including queued requests; absent on older engine versions. */
  tasks?: TaskInfo[];
  serverVersion: string;
  /** Path of the open project file, if it has been saved. */
  projectPath?: string;
  /** Set while the last autosave failed: edits are kept in memory but are not on disk. The UI should warn the user. */
  saveError?: string;
}

/** Something that happened during an AI run. The UI renders these as the chat transcript. */
export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string }
  | { type: "done"; turns: number; inputTokens?: number; outputTokens?: number }
  | { type: "error"; message: string };

/** Messages pushed to the UI over the WebSocket. */
export type WsEvent =
  | { type: "state"; state: StateResponse }
  | { type: "job"; job: JobInfo }
  | { type: "chat"; runId: string; event: AgentEvent; startStateId?: number };

/** What the server prints on startup (one JSON line on stdout) so a launcher can find it. */
export interface ServerInfo {
  url: string;
  token: string;
  port: number;
  version: string;
}

/** Body of any non-2xx JSON response. */
export interface ErrorResponse {
  error: string;
}
