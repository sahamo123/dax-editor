// The contract between the engine server and everything that talks to it (desktop UI, CLI, MCP, tests).
// Types and zod schemas only; no behaviour. If you change a shape here, both sides get a compile error.

import type { HistoryItem, Project } from "@dax/core";
import { z } from "zod";

/** Name of the HTTP header carrying the per-launch token: `Authorization: Bearer <token>`. */
export const AUTH_SCHEME = "Bearer";

/** URL paths of the server API. Media URLs also accept the token as a `?token=` query parameter because `<video>` and `<img>` cannot send headers. */
export const API = {
  health: "/api/health",
  state: "/api/state",
  command: "/api/command",
  importMedia: "/api/import",
  projectNew: "/api/project/new",
  projectOpen: "/api/project/open",
  projectSave: "/api/project/save",
  chat: "/api/chat",
  chatCancel: "/api/chat/cancel",
  settings: "/api/settings",
  apiKey: "/api/settings/api-key",
  providers: "/api/providers",
  localModel: "/api/local-model",
  ws: "/ws",
  /** `/api/media/:assetId/proxy.mp4` etc. Build these with {@link mediaUrl}. */
  media: "/api/media",
} as const;

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
export const ChatRequestSchema = z.object({ message: z.string().min(1).max(8000) });
/** A validated {@link ChatRequestSchema} value. */
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** Where chat messages go. */
export const PROVIDER_KINDS = [
  "local",
  "openai-compatible",
  "anthropic",
  "cli-claude",
  "cli-codex",
  "cli-gemini",
] as const;
/** One of {@link PROVIDER_KINDS}. `local` is the embedded model; `cli-*` drive the user's own signed-in command-line agents. */
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Non-secret settings for one provider. API keys are never part of this. */
export const ProviderConfigSchema = z.object({
  /** Base URL for `openai-compatible` (for example `http://127.0.0.1:11434/v1` for Ollama). */
  baseUrl: z.string().url().optional(),
  /** Model name to request. */
  model: z.string().min(1).optional(),
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
  /** For `cli-*` providers: true if the CLI reports that the user is signed in. */
  signedIn?: boolean;
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
}

/** Everything the UI needs to draw itself. Pushed over the WebSocket after every change. */
export interface StateResponse {
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
  | { type: "chat"; runId: string; event: AgentEvent };

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
