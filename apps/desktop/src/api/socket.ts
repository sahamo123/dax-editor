// The live WebSocket to the engine server: receives `state`, `job` and `chat` events and reconnects by
// itself with exponential backoff. Browsers cannot set headers on a WebSocket, so the token goes in `?token=`.
// Contains no React; the app's controller turns its callbacks into store updates.

import { API, type WsEvent } from "@dax/protocol";
import { isStateResponse } from "./client";

/** Connection phase reported to {@link LiveSocketOptions.onStatus}. */
export type SocketStatus = "connecting" | "open" | "closed";

/** Details sent along with a status change. */
interface SocketStatusInfo {
  /** How many connection attempts in a row have failed (0 once open). */
  failures: number;
  /** For `closed`: epoch milliseconds of the next automatic attempt. */
  retryAt?: number;
}

/** Options for {@link openLiveSocket}. */
export interface LiveSocketOptions {
  /** Server base URL (`http://...`); the `ws://` URL is derived from it. */
  baseUrl: string;
  token: string;
  /** Called for every valid event pushed by the server. */
  onEvent(event: WsEvent): void;
  /** Called whenever the connection phase changes. */
  onStatus(status: SocketStatus, info: SocketStatusInfo): void;
  /** Replace the WebSocket class (tests). */
  WebSocketImpl?: typeof WebSocket;
  /** First retry delay in ms (default 500). Doubles per failure up to `maxDelayMs`. */
  baseDelayMs?: number;
  /** Longest wait between attempts in ms (default 8000). */
  maxDelayMs?: number;
}

/** Handle returned by {@link openLiveSocket}. */
export interface LiveSocket {
  /** Stop for good: close the socket and cancel any pending retry. */
  close(): void;
  /** Skip the countdown and reconnect now (used by the "Retry now" button). */
  retryNow(): void;
}

/** Build the WebSocket URL for a server base URL and token. */
export function socketUrl(baseUrl: string, token: string): string {
  const u = new URL(baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = API.ws;
  u.search = new URLSearchParams({ token }).toString();
  return u.toString();
}

/** Parse one WebSocket message; returns `null` for anything that is not a known event. */
export function parseWsEvent(data: unknown): WsEvent | null {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null || !("type" in msg)) return null;
  const m = msg as Record<string, unknown>;
  if (m.type === "state" && isStateResponse(m.state)) return msg as WsEvent;
  if (m.type === "job" && typeof m.job === "object" && m.job !== null) return msg as WsEvent;
  if (m.type === "chat" && typeof m.runId === "string" && typeof m.event === "object") {
    return msg as WsEvent;
  }
  return null;
}

/**
 * Connect and keep connected. Status goes `connecting` -> `open`, and on any loss `closed` with a retry time,
 * then `connecting` again. Never throws.
 */
export function openLiveSocket(opts: LiveSocketOptions): LiveSocket {
  const Impl = opts.WebSocketImpl ?? WebSocket;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let stopped = false;

  const connect = () => {
    timer = null;
    if (stopped) return;
    opts.onStatus("connecting", { failures });
    let ws: WebSocket;
    try {
      ws = new Impl(socketUrl(opts.baseUrl, opts.token));
    } catch {
      scheduleRetry();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      failures = 0;
      opts.onStatus("open", { failures: 0 });
    };
    ws.onmessage = (e) => {
      const event = parseWsEvent(e.data);
      if (event) opts.onEvent(event);
    };
    // `error` is always followed by `close`, so retry logic lives only in onclose.
    ws.onerror = () => {};
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (!stopped) scheduleRetry();
    };
  };

  const scheduleRetry = () => {
    failures++;
    const delay = Math.min(max, base * 2 ** (failures - 1));
    opts.onStatus("closed", { failures, retryAt: Date.now() + delay });
    timer = setTimeout(connect, delay);
  };

  connect();

  return {
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      socket?.close();
      socket = null;
    },
    retryNow() {
      if (stopped || socket) return;
      if (timer) clearTimeout(timer);
      connect();
    },
  };
}
