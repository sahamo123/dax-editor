// Typed REST client for the engine server (`@dax/protocol`). Every method resolves to a value and NEVER throws:
// network failures, bad tokens and server errors all come back as `{ ok: false, error }` so UI code has one
// path for failure. Contains no React and no state.

import {
  API,
  type ApiKeyRequest,
  AUTH_SCHEME,
  type CommandResponse,
  type ErrorResponse,
  type ProjectNewRequest,
  type ProviderKind,
  type ProviderStatus,
  type Settings,
  type StateResponse,
} from "@dax/protocol";
import type { LocalModelAction, LocalModelStatus } from "./local-model";

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

function errorFromBody(body: unknown, status: number): string {
  if (isRecord(body) && typeof (body as Partial<ErrorResponse>).error === "string") {
    return (body as unknown as ErrorResponse).error;
  }
  if (status === 401 || status === 403) return "The editor engine rejected the access token.";
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
  ): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `${AUTH_SCHEME} ${this.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
  async health(): Promise<ApiResult<unknown>> {
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
  async run(name: string, args: Record<string, unknown> = {}): Promise<CommandResponse> {
    // No timeout: export_video and remove_silences can legitimately take minutes.
    const r = await this.request<CommandResponse>("POST", API.command, { name, args }, 0);
    if (!r.ok) return { ok: false, error: r.error };
    const v: unknown = r.value;
    if (isRecord(v) && v.ok === true && typeof v.summary === "string") return v as CommandResponse;
    if (isRecord(v) && v.ok === false && typeof v.error === "string") return v as CommandResponse;
    return { ok: false, error: "The editor engine sent an unexpected reply." };
  }

  /** `POST /api/import`: import video files by absolute path and put them on the timeline. */
  async importMedia(paths: string[]): Promise<CommandResponse> {
    const r = await this.request<CommandResponse>("POST", API.importMedia, { paths }, 0);
    if (!r.ok) return { ok: false, error: r.error };
    const v: unknown = r.value;
    if (isRecord(v) && v.ok === false && typeof v.error === "string") return v as CommandResponse;
    return {
      ok: true,
      summary: isRecord(v) && typeof v.summary === "string" ? v.summary : "Imported.",
    };
  }

  /** `POST /api/project/new`. */
  async projectNew(req: Partial<ProjectNewRequest> = {}): Promise<ApiResult<unknown>> {
    return this.request("POST", API.projectNew, req);
  }

  /** `POST /api/project/open` with a project file path. */
  async projectOpen(path: string): Promise<ApiResult<unknown>> {
    return this.request("POST", API.projectOpen, { path });
  }

  /** `POST /api/project/save`, to `path` or the project's current file. */
  async projectSave(path?: string): Promise<ApiResult<unknown>> {
    return this.request("POST", API.projectSave, path ? { path } : {});
  }

  /** `POST /api/chat`: start an AI run. Progress arrives as `chat` events over the WebSocket. */
  async chat(message: string): Promise<ApiResult<unknown>> {
    // No timeout: a server that holds the request open until the run ends must not look like a failure.
    return this.request("POST", API.chat, { message }, 0);
  }

  /** `POST /api/chat/cancel`: stop the running AI run, if any. */
  async chatCancel(): Promise<ApiResult<unknown>> {
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

  /** `POST /api/settings/api-key`: store a key. The server never returns it, and neither does this client. */
  async setApiKey(kind: ProviderKind, apiKey: string): Promise<ApiResult<unknown>> {
    const body: ApiKeyRequest = { kind, apiKey };
    return this.request("POST", API.apiKey, body);
  }

  /** `GET /api/providers`: which providers can be used right now. */
  async getProviders(): Promise<ApiResult<ProviderStatus[]>> {
    return this.request("GET", API.providers);
  }

  /** `GET /api/local-model`: state of the embedded model. */
  async getLocalModel(): Promise<ApiResult<LocalModelStatus>> {
    return this.request("GET", API.localModel);
  }

  /** `POST /api/local-model`: download, start, stop or remove the embedded model. Progress comes as `job` events. */
  async localModel(action: LocalModelAction): Promise<ApiResult<LocalModelStatus>> {
    return this.request("POST", API.localModel, action);
  }
}
