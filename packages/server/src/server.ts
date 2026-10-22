// The HTTP/WebSocket listener and its security gate. Every request passes: Host check, Origin allow-list, then token, before any route runs.
// Binds 127.0.0.1 only. Application logic is in engine.ts; the route table is in routes.ts.

import { mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import type { MotionRenderer, Transcriber } from "@dax/core";
import { API, type ServerInfo } from "@dax/protocol";
import { Engine } from "./engine.js";
import { HttpError, readJsonBody, sendError, sendJson } from "./http-util.js";
import { WsHub } from "./hub.js";
import type {
  AgentRunner,
  AgentRunnerFactory,
  LocalModelController,
  ProviderRegistry,
  SpeechController,
} from "./interfaces.js";
import { startLiveMcp } from "./live-mcp.js";
import { createLogger, type Logger } from "./logger.js";
import { buildRouter } from "./routes.js";
import {
  BASE_SECURITY_HEADERS,
  bearerToken,
  corsHeaders,
  generateToken,
  isAllowedHost,
  isAllowedOrigin,
  normalizeOrigin,
  safeEqual,
} from "./security.js";
import { NoRunner, NullLocalModelController, NullProviderRegistry } from "./stubs.js";
import { SERVER_VERSION } from "./version.js";

/** Default cap on request bodies. Real requests are a few hundred bytes; a project or state is never uploaded. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/** Everything needed to start a server. Only `dataDir` is required. */
export interface ServerOptions {
  /** Folder for projects, cache, settings and secrets. Created (mode 0700) if missing. */
  dataDir: string;
  /** TCP port on 127.0.0.1; 0 (the default) picks a free one. */
  port?: number;
  /** Browser origins allowed to call the API, e.g. `http://localhost:5173`, `tauri://localhost`. Requests from any other origin get 403. */
  origins?: string[];
  /** Folders imports, exports and project files may use. Defaults to the home folder and the data folder. */
  allowRoots?: string[];
  /** Use this token instead of generating one (at least 16 characters). Intended for launchers and tests; the CLI reads `DAX_SERVER_TOKEN`. */
  token?: string;
  /** Largest accepted request body in bytes. Default {@link DEFAULT_MAX_BODY_BYTES}. */
  maxBodyBytes?: number;
  /** The AI runner, or a function choosing one per run from the active provider. Defaults to one that explains no provider is configured. */
  agentRunner?: AgentRunner | AgentRunnerFactory;
  /** Reports provider availability. Defaults to {@link NullProviderRegistry}. */
  providers?: ProviderRegistry;
  /** Controls the embedded local model. Defaults to {@link NullLocalModelController}. */
  localModel?: LocalModelController;
  /** Speech-to-text engine for transcription; omit when none is installed. */
  transcriber?: Transcriber;
  /** Optional offline speech installation controls. */
  speech?: SpeechController;
  /** Optional separate-process bounded motion renderer. */
  motion?: MotionRenderer;
  /** Where to log. Defaults to stderr; stdout is reserved for the startup line. */
  logger?: Logger;
  /** Log every request (method, path, status; never the query string). */
  verbose?: boolean;
  /** Enable authenticated external-client MCP listeners on the active desktop project. */
  liveMcp?: { shimPath: string };
}

/** A started server. */
export interface RunningServer {
  /** The address and token a client needs. */
  info: ServerInfo;
  /** Stop gracefully: cancel AI and FFmpeg work, close WebSockets, save the project, stop listening. Safe to call more than once. */
  close(): Promise<void>;
}

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
  "Access-Control-Max-Age": "600",
} as const;

/** Start the server and resolve once it is listening. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const dataDir = resolve(options.dataDir);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const log = options.logger ?? createLogger(undefined, options.verbose ? "debug" : "info");

  const token = options.token ?? generateToken();
  if (token.length < 16) throw new Error("The server token must be at least 16 characters");
  log.addSecret(token);

  const origins = new Set((options.origins ?? []).map(normalizeOrigin));
  const allowedRoots = (options.allowRoots?.length ? options.allowRoots : [homedir(), dataDir]).map(
    (r) => resolve(r),
  );
  // Browser uploads are app-owned sources, even when external path imports use a narrower allow-list.
  allowedRoots.push(resolve(dataDir, "uploads"));
  allowedRoots.push(resolve(dataDir, "renders"));
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const hub = new WsHub();
  const engine = new Engine({
    dataDir,
    allowedRoots,
    runner: options.agentRunner ?? new NoRunner(),
    providers: options.providers ?? new NullProviderRegistry(),
    localModel: options.localModel ?? new NullLocalModelController(),
    ...(options.transcriber ? { transcriber: options.transcriber } : {}),
    ...(options.speech ? { speech: options.speech } : {}),
    ...(options.motion ? { motion: options.motion } : {}),
    log,
    emit: (event) => hub.broadcast(event),
    hasListeners: () => hub.size > 0,
  });
  await engine.init();
  const router = buildRouter(engine);

  let closing = false;
  const server = createServer();
  // Slow-loris protection: a request must finish arriving quickly. Responses (media streams) are not limited by these.
  server.headersTimeout = 15_000;
  server.requestTimeout = 60_000;

  const port = () => (server.address() as AddressInfo).port;
  const header = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  /** Host + Origin checks shared by HTTP and WebSocket upgrades. Throws 403 HttpError. */
  const checkOrigin = (req: IncomingMessage) => {
    if (!isAllowedHost(header(req.headers.host), port()))
      throw new HttpError(403, "Forbidden host");
    if (!isAllowedOrigin(header(req.headers.origin), origins)) {
      throw new HttpError(403, "Origin not allowed");
    }
  };

  /** Token check. Media GET/HEAD and WebSocket upgrades may carry it as `?token=` because browsers cannot set headers there. */
  const checkToken = (req: IncomingMessage, url: URL, allowQuery: boolean) => {
    const supplied =
      bearerToken(req.headers) ??
      (allowQuery ? (url.searchParams.get("token") ?? undefined) : undefined);
    if (!supplied || !safeEqual(supplied, token)) {
      throw new HttpError(401, "Missing or invalid token");
    }
  };

  const parseUrl = (req: IncomingMessage): URL => {
    const raw = req.url ?? "";
    // Reject absolute-form ("http://x/") and protocol-relative ("//x/") targets: only plain paths are served.
    if (!raw.startsWith("/") || raw.startsWith("//"))
      throw new HttpError(400, "Bad request target");
    return new URL(raw, "http://127.0.0.1");
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const origin = header(req.headers.origin);
    const headers: Record<string, string> = {
      ...BASE_SECURITY_HEADERS,
      ...corsHeaders(origin, origins),
    };
    let pathname = "-";
    try {
      if (closing) throw new HttpError(503, "Server is shutting down");
      checkOrigin(req);
      const url = parseUrl(req);
      pathname = url.pathname;

      if (req.method === "OPTIONS") {
        // CORS preflight carries no token by design; the Origin allow-list above is its gate.
        res.writeHead(204, {
          ...headers,
          ...(origin ? PREFLIGHT_HEADERS : {}),
          Allow: "GET, POST, PUT, DELETE, OPTIONS",
        });
        res.end();
        return;
      }

      const isMedia =
        pathname.startsWith(`${API.media}/`) && (req.method === "GET" || req.method === "HEAD");
      checkToken(req, url, isMedia);

      const match = router.match(req.method ?? "GET", pathname);
      if (!match) throw new HttpError(404, "Not found");
      if ("allowed" in match) {
        sendError(res, 405, "Method not allowed", { ...headers, Allow: match.allowed.join(", ") });
        return;
      }
      await match.handler({
        req,
        res,
        url,
        params: match.params,
        headers,
        body: () => readJsonBody(req, maxBody),
        json: (status, body) => sendJson(res, status, body, headers),
      });
    } catch (err) {
      if (res.headersSent) {
        // Mid-stream failure: nothing sensible to send; drop the connection.
        res.destroy();
        return;
      }
      if (err instanceof HttpError) {
        const extra: Record<string, string> = { ...headers };
        if (err.status === 401) extra["WWW-Authenticate"] = 'Bearer realm="dax-server"';
        if (err.closeConnection) extra.Connection = "close";
        sendError(res, err.status, err.message, extra);
      } else {
        log.error(
          `unhandled error on ${req.method} ${pathname}: ${err instanceof Error ? err.stack : String(err)}`,
        );
        sendError(res, 500, "Internal server error", headers);
      }
    } finally {
      log.debug(`${req.method} ${pathname} -> ${res.statusCode} ${Date.now() - started}ms`);
    }
  }

  server.on("request", (req, res) => {
    void handle(req, res);
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const refuse = (status: number, text: string) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    socket.on("error", () => undefined);
    try {
      if (closing) return refuse(503, "Service Unavailable");
      checkOrigin(req);
      const url = parseUrl(req);
      if (url.pathname !== API.ws) return refuse(404, "Not Found");
      checkToken(req, url, true);
    } catch (err) {
      if (err instanceof HttpError) {
        return refuse(
          err.status,
          err.status === 401 ? "Unauthorized" : err.status === 403 ? "Forbidden" : "Bad Request",
        );
      }
      return refuse(400, "Bad Request");
    }
    const accepted = hub.upgrade(req, socket, head, (ws) => {
      // A new client needs the full picture before the first incremental event.
      engine
        .buildState()
        .then((state) => hub.sendTo(ws, { type: "state", state }))
        .catch((e) => log.error(`initial state failed: ${String(e)}`));
    });
    if (!accepted) refuse(503, "Service Unavailable");
  });

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(options.port ?? 0, "127.0.0.1", () => {
        server.off("error", rejectListen);
        resolveListen();
      });
    });
  } catch (err) {
    // Port in use or similar: do not leave the engine's background work running.
    hub.close();
    await engine.shutdown();
    throw err;
  }

  const actualPort = port();
  const info: ServerInfo = {
    url: `http://127.0.0.1:${actualPort}`,
    token,
    port: actualPort,
    version: SERVER_VERSION,
  };
  log.info(`listening on ${info.url}`);
  const mcp = options.liveMcp
    ? await startLiveMcp(engine, dataDir, options.liveMcp.shimPath).catch((error) => {
        log.warn(`Live MCP unavailable: ${String(error)}`);
        return undefined;
      })
    : undefined;

  let closed: Promise<void> | undefined;
  const close = () => {
    closed ??= (async () => {
      closing = true;
      await mcp?.close();
      await engine.shutdown();
      hub.close();
      await new Promise<void>((done) => {
        // Keep-alive sockets would hold close() open; cut whatever is left after a short grace period.
        const force = setTimeout(() => server.closeAllConnections(), 1000);
        server.close(() => {
          clearTimeout(force);
          done();
        });
        server.closeIdleConnections();
      });
    })();
    return closed;
  };
  return { info, close };
}
