// Typed REST client for the engine server (`@dax/protocol`). Every method resolves to a value and NEVER throws:
// network failures, bad tokens and server errors all come back as `{ ok: false, error }` so UI code has one
// path for failure. Contains no React and no state.

import {
  API,
  type ApiKeyRequest,
  AUTH_SCHEME,
  type BlenderRenderRequest,
  type BlenderStatus,
  type CancelResponse,
  type ChatRequest,
  type ChatStarted,
  type CommandResponse,
  type ErrorResponse,
  type HealthResponse,
  type JobStarted,
  JobStartedSchema,
  type LocalModelInstallRequest,
  type LocalModelStatus,
  LocalModelStatusSchema,
  MAX_UPLOAD_BYTES,
  type ProjectNewRequest,
  type ProviderDiagnostic,
  type ProviderKind,
  type ProviderStatus,
  type Settings,
  type SpeechStatus,
  SpeechStatusSchema,
  type StateResponse,
} from "@dax/protocol";
import type { LocalModelAction } from "./local-model";

/** Outcome of an API call that returns data. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

/** Options for {@link DaxClient}. */
export interface ClientOptions {
  /** Base URL of the server, e.g. `http://127.0.0.1:43111`. A trailing slash is ignored. */
  baseUrl: string;
  /** The per-launch token. Sent as `Authorization: Bearer <token>`. */
  token: string;
  /** Replace `fetch` (tests). Defaults to the global one. */
  fetchImpl?: typeof fetch;
  /** Give up on ordinary calls after this many milliseconds. Default 20000. Commands have no limit. */
  timeoutMs?: number;
}

/** The text shown when the server cannot be reached at all. */
export const UNREACHABLE = "Can't reach the editor engine.";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** True if `x` has the fields the UI reads from a state push; guards against a confused server. */
export function isStateResponse(x: unknown): x is StateResponse {
  return (
    isRecord(x) &&
    isRecord(x.project) &&
    Array.isArray(x.history) &&
    Array.isArray(x.presets) &&
    Array.isArray(x.jobs) &&
    Array.isArray(x.providers) &&
    isRecord(x.settings)
  );
}

/** The part of a zod schema this file needs; avoids depending on zod directly. */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Check a reply against its protocol schema; a mismatch is a failure, not data to pass on. */
function parsed<T>(schema: Parser<T>, value: unknown, what: string): ApiResult<T> {
  const r = schema.safeParse(value);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: `The editor engine sent an unexpected ${what}.` };
}

function errorFromBody(body: unknown, status: number): string {
  // A rejected token gets one plain sentence whatever the server's wording is.
  if (status === 401) return "The editor engine rejected the access token.";
  if (isRecord(body) && typeof (body as Partial<ErrorResponse>).error === "string") {
    return (body as unknown as ErrorResponse).error;
  }
  if (status === 403) return "The editor engine refused this request.";
  return `The editor engine answered with an error (HTTP ${status}).`;
}

/** REST client for one server. Create a new one if the URL or token changes. */
export class DaxClient {
  readonly baseUrl: string;
  readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /** Send one request. `timeoutMs` of 0 means wait as long as it takes. */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = this.timeoutMs,
    rawBody?: Blob,
  ): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `${AUTH_SCHEME} ${this.token}`,
          ...(rawBody
            ? { "Content-Type": "application/octet-stream" }
            : body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
        },
        ...(rawBody ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // A non-JSON body is only an error if the status says so (handled below).
        }
      }
      if (!res.ok)
        return { ok: false, error: errorFromBody(parsed, res.status), status: res.status };
      return { ok: true, value: parsed as T };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        error: aborted ? "The editor engine took too long to answer." : UNREACHABLE,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** `GET /api/health`: true if the server answers with the right token. */
  async health(): Promise<ApiResult<HealthResponse>> {
    return this.request("GET", API.health);
  }

  /** `GET /api/state`: the full current state (also pushed over the WebSocket after changes). */
  async getState(): Promise<ApiResult<StateResponse>> {
    const r = await this.request<unknown>("GET", API.state);
    if (!r.ok) return r;
    return isStateResponse(r.value)
      ? { ok: true, value: r.value }
      : { ok: false, error: "The editor engine sent an unexpected state." };
  }

  /** `POST /api/command`: run a registry command as a manual edit. Never throws; failures are `{ ok: false }`. */
  async run(
    name: string,
    args: Record<string, unknown> = {},
    guard?: { projectId?: string; expectedRevision?: number },
  ): Promise<CommandResponse> {
    // No timeout: export_video and remove_silences can legitimately take minutes.
    const r = await this.request<CommandResponse>("POST", API.command, { name, args, ...guard }, 0);
    if (!r.ok) return { ok: false, error: r.error };
    const v: unknown = r.value;
    if (isRecord(v) && v.ok === true && typeof v.summary === "string") return v as CommandResponse;
    if (isRecord(v) && v.ok === false && typeof v.error === "string") return v as CommandResponse;
    return { ok: false, error: "The editor engine sent an unexpected reply." };
  }

  /**
   * `POST /api/import`: import video files by absolute path and put them on the timeline. The server answers
   * HTTP 200 `{ ok: false, error }` when nothing could be imported and `{ ok: true, summary, data }` otherwise,
   * where `data` is an `ImportResult` from `@dax/protocol` (some of the files may have failed).
   */
  async importMedia(paths: string[]): Promise<CommandResponse> {
    const r = await this.request<CommandResponse>("POST", API.importMedia, { paths }, 0);
    if (!r.ok) return { ok: false, error: r.error };
    const v: unknown = r.value;
    if (isRecord(v) && v.ok === false && typeof v.error === "string") return v as CommandResponse;
    if (isRecord(v) && v.ok === true && typeof v.summary === "string") return v as CommandResponse;
    return { ok: false, error: "The editor engine sent an unexpected reply." };
  }

  /** Copy one selected video to local engine storage and import it; rejects empty or over-1-GiB files. Never throws. */
  async uploadMedia(file: File, stageOnly = false): Promise<CommandResponse> {
    if (!file.size || file.size > MAX_UPLOAD_BYTES)
      return { ok: false, error: "Choose a non-empty video smaller than 1 GiB." };
    const r = await this.request<CommandResponse>(
      "POST",
      `${API.uploadMedia}?name=${encodeURIComponent(file.name)}&stage=${stageOnly}`,
      undefined,
      0,
      file,
    );
    if (!r.ok) return { ok: false, error: r.error };
    const v: unknown = r.value;
    if (
      isRecord(v) &&
      ((v.ok === true && typeof v.summary === "string") ||
        (v.ok === false && typeof v.error === "string"))
    )
      return v as CommandResponse;
    return { ok: false, error: "The editor engine sent an unexpected upload reply." };
  }

  /** `POST /api/project/new`: the server answers with the new project's full state. */
  async projectNew(req: Partial<ProjectNewRequest> = {}): Promise<ApiResult<StateResponse>> {
    return this.request("POST", API.projectNew, req);
  }

  /** Recently opened projects, including app-owned autosaves. */
  async projectRecent(): Promise<ApiResult<{ paths: string[] }>> {
    return this.request("GET", API.projectRecent);
  }

  /** Open an uploaded project in engine storage; asset paths are validated by the server. */
  async projectCopy(project: unknown): Promise<ApiResult<StateResponse>> {
    return this.request("POST", API.projectCopy, { project });
  }

  /** `POST /api/project/open` with a project file path (it must end in `.dax.json`); answers with the full state. */
  async projectOpen(path: string): Promise<ApiResult<StateResponse>> {
    return this.request("POST", API.projectOpen, { path });
  }

  /** `POST /api/project/save`, to `path` or the project's current file; answers with the full state. */
  async projectSave(path?: string): Promise<ApiResult<StateResponse>> {
    return this.request("POST", API.projectSave, path ? { path } : {});
  }

  /**
   * `POST /api/chat`: start an AI run (HTTP 202 `{ runId }`). Progress arrives as `chat` events over the
   * WebSocket. A provider that is not set up is not a failed request: the run's first event is an `error`.
   * Only an already-running AI run (409) or a malformed message (400) is refused here.
   */
  async chat(
    message: string,
    options: Partial<Omit<ChatRequest, "message">> = {},
  ): Promise<ApiResult<ChatStarted>> {
    // No timeout: a server that holds the request open until the run ends must not look like a failure.
    return this.request("POST", API.chat, { message, ...options }, 0);
  }

  /** Cancel a specific queued or running task. Finished task records are retained. */
  async cancelTask(id: string): Promise<ApiResult<CancelResponse>> {
    return this.request("POST", API.taskCancel.replace(":taskId", encodeURIComponent(id)), {});
  }

  /** `POST /api/chat/cancel`: stop the running AI run, if any (`cancelled` is false when none was running). */
  async chatCancel(): Promise<ApiResult<CancelResponse>> {
    return this.request("POST", API.chatCancel, {});
  }

  /** `GET /api/settings`. */
  async getSettings(): Promise<ApiResult<Settings>> {
    return this.request("GET", API.settings);
  }

  /** `PUT /api/settings`: replace the non-secret settings. */
  async putSettings(settings: Settings): Promise<ApiResult<Settings>> {
    return this.request("PUT", API.settings, settings);
  }

  /**
   * `POST /api/settings/api-key`: store a key. The server answers with the refreshed provider list (which
   * says `hasApiKey` but never holds the key), and this client never returns the key either.
   */
  async setApiKey(kind: ProviderKind, apiKey: string): Promise<ApiResult<ProviderStatus[]>> {
    const body: ApiKeyRequest = { kind, apiKey };
    return this.request("POST", API.apiKey, body);
  }

  /** `GET /api/providers`: which providers can be used right now. */
  async getProviders(): Promise<ApiResult<ProviderStatus[]>> {
    return this.request("GET", API.providers);
  }

  /** Read offline speech setup without downloading components. */
  async speechStatus(): Promise<ApiResult<SpeechStatus>> {
    const r = await this.request<unknown>("GET", API.speech);
    return r.ok ? parsed(SpeechStatusSchema, r.value, "speech status") : r;
  }

  /** Optional separate-program Blender availability. */
  async blenderStatus(): Promise<ApiResult<BlenderStatus>> {
    return this.request("GET", API.blender);
  }

  /** Queue a bounded template render; completion/import is reported through jobs and project state. */
  async renderMotion(request: BlenderRenderRequest): Promise<ApiResult<JobStarted>> {
    return this.request("POST", API.blenderRender, request);
  }

  /** Start installation/transcription or remove the speech model; progress arrives as jobs. */
  async speech(
    action: "install" | "remove" | "transcribe",
    assetId?: string,
  ): Promise<ApiResult<unknown>> {
    return this.request(
      "POST",
      action === "install"
        ? API.speechInstall
        : action === "remove"
          ? API.speechRemove
          : API.transcribe,
      action === "transcribe" ? { assetId } : {},
    );
  }

  /** Run an explicit non-editing tool probe using saved connection settings. */
  async testProvider(kind: ProviderKind): Promise<ApiResult<ProviderDiagnostic>> {
    return this.request("POST", API.providerTest, { kind }, 100_000);
  }

  /** Fetch model IDs without selecting one or changing connection settings. */
  async providerModels(kind: ProviderKind): Promise<ApiResult<{ models: string[] }>> {
    return this.request("POST", API.providerModels, { kind });
  }

  /** `GET /api/local-model`: state of the embedded model. */
  async getLocalModel(): Promise<ApiResult<LocalModelStatus>> {
    const r = await this.request<unknown>("GET", API.localModel);
    return r.ok ? parsed(LocalModelStatusSchema, r.value, "local model status") : r;
  }

  /**
   * Download, start, stop, cancel or remove the embedded model. Each action is its own endpoint on the server.
   * Install and start answer 202 with the id of the job to follow (`jobId`); the others finish before they answer.
   * Re-read {@link DaxClient.getLocalModel} afterwards: none of the replies carries the new status.
   */
  async localModel(action: LocalModelAction): Promise<ApiResult<Partial<JobStarted>>> {
    switch (action.action) {
      case "install": {
        const body: LocalModelInstallRequest = action.modelId ? { modelId: action.modelId } : {};
        const r = await this.request<unknown>("POST", API.localModelInstall, body);
        return r.ok ? parsed(JobStartedSchema, r.value, "reply") : r;
      }
      case "start": {
        const r = await this.request<unknown>("POST", API.localModelStart, {});
        return r.ok ? parsed(JobStartedSchema, r.value, "reply") : r;
      }
      case "stop":
        return this.simple(API.localModelStop);
      case "cancel":
        return this.simple(API.localModelCancel);
      case "uninstall":
        return this.simple(API.localModelUninstall);
    }
  }

  /** POST an empty JSON body to `path` and ignore the (tiny) reply. */
  private async simple(path: string): Promise<ApiResult<Partial<JobStarted>>> {
    const r = await this.request<unknown>("POST", path, {});
    return r.ok ? { ok: true, value: {} } : r;
  }
}
