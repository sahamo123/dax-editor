// Streamable HTTP transport on the loopback interface, behind a bearer token and Host/Origin checks.
// Every request passes the gate (security.ts) before the MCP transport sees it. See docs/research/mcp-server-design.md.

import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { Session } from "@dax/core";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { isInitializeRequest, type McpServer } from "@modelcontextprotocol/server";
import {
  allowedHostHeaders,
  allowedOriginValues,
  type GateConfig,
  gate,
  generateToken,
  MIN_TOKEN_LENGTH,
} from "./security.js";
import { createMcpServer, type McpServerOptions } from "./server.js";

/** The only URL path the server answers on. */
export const MCP_PATH = "/mcp";

/** Options for {@link startHttpServer}: everything {@link createMcpServer} takes, plus the listener settings. */
export interface HttpServerOptions extends McpServerOptions {
  /** TCP port; 0 (default) picks a free one. */
  port?: number;
  /** Loopback address to bind. Only `127.0.0.1` (default) and `::1` are accepted; there is no way to listen on all interfaces. */
  host?: "127.0.0.1" | "::1";
  /** Bearer token clients must present. Default: a fresh 256-bit random token. Supplied tokens must be at least {@link MIN_TOKEN_LENGTH} characters. */
  token?: string;
  /** Extra browser origins to accept (`scheme://host[:port]`). Loopback origins on the listening port are always accepted; an empty list does not disable the check. */
  allowedOrigins?: string[];
  /** Extra Host header values to accept (`host[:port]`), for example behind a local reverse proxy. Loopback names on the listening port are always accepted. */
  allowedHosts?: string[];
  /** Run without MCP sessions: a fresh server per request. Simpler, but a cancel notification cannot reach a running call. Default false. */
  stateless?: boolean;
  /** Largest request body accepted, in bytes. Default 4 MiB. */
  maxBodyBytes?: number;
  /** Most simultaneous MCP sessions (stateful mode). Further `initialize` requests get 503. Default 32. */
  maxSessions?: number;
}

/** A running HTTP server. */
export interface RunningHttpServer {
  /** Number of initialized stateful client sessions, not inference processes. */
  readonly clients: number;
  /** Full endpoint URL, for example `http://127.0.0.1:53918/mcp`. Contains no secret. */
  url: string;
  /** Port actually bound. */
  port: number;
  /** Address actually bound. */
  host: string;
  /** The bearer token. Treat as a secret: never log it, write it only to an owner-only file. */
  token: string;
  /** The session all clients edit. */
  session: Session;
  /** Stop accepting requests, end every MCP session and close open streams. */
  close(): Promise<void>;
}

/** A JSON error body in the shape MCP clients expect from a failed request. */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

/** A JSON-RPC error response with no request id, for failures that happen before a message is understood. */
function rpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

/** Thrown by {@link readJsonBody} for a request the server refuses to read. */
class BodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Read and parse a JSON body, refusing anything larger than `limit` bytes. */
async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new BodyError(413, "Request body too large");
    chunks.push(buf);
  }
  if (size === 0) throw new BodyError(400, "Empty request body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError(400, "Request body is not valid JSON");
  }
}

/** One connected MCP client in stateful mode. */
interface LiveSession {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Start the Streamable HTTP server on a loopback address.
 *
 * Every request must pass, in this order: Host header (defeats DNS rebinding), Origin header when present (defeats
 * other web pages), then `Authorization: Bearer <token>` (defeats other local programs). No CORS headers are ever sent.
 * All clients share one core `Session`, so they see each other's edits.
 * @throws Error for a non-loopback `host`, a too-short `token`, or a port that cannot be bound.
 */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error(
      `Refusing to listen on "${host}": only the loopback addresses 127.0.0.1 and ::1 are allowed.`,
    );
  }
  const token = options.token ?? generateToken();
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`The bearer token must be at least ${MIN_TOKEN_LENGTH} characters.`);
  }
  const maxBody = options.maxBodyBytes ?? 4 * 1024 * 1024;
  const maxSessions = options.maxSessions ?? 32;
  const stateless = options.stateless ?? false;

  // One session for everyone; each connection gets its own SDK server around it.
  const base = createMcpServer(options);
  const shared: McpServerOptions = { ...options, session: base.session };
  const live = new Map<string, LiveSession>();
  // Gate settings depend on the bound port, so they are filled in once listening.
  let config: GateConfig | undefined;

  /** Answer one request that already passed the gate. */
  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "";
    if (method !== "POST" && method !== "GET" && method !== "DELETE") {
      sendJson(res, 405, { error: "Method not allowed" }, { allow: "POST, GET, DELETE" });
      return;
    }
    const body = method === "POST" ? await readJsonBody(req, maxBody) : undefined;

    if (stateless) {
      const { server } = createMcpServer(shared);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    const sid = req.headers["mcp-session-id"];
    if (typeof sid === "string") {
      const found = live.get(sid);
      if (!found) {
        rpcError(res, 404, -32001, "Unknown or expired session. Send a new initialize request.");
        return;
      }
      await found.transport.handleRequest(req, res, body);
      return;
    }
    if (!(method === "POST" && isInitializeRequest(body))) {
      rpcError(
        res,
        400,
        -32000,
        "Missing Mcp-Session-Id header. Send an initialize request first.",
      );
      return;
    }
    if (live.size >= maxSessions) {
      rpcError(res, 503, -32000, "Too many open sessions.");
      return;
    }
    const { server } = createMcpServer(shared);
    const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        live.set(id, { transport, server });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) live.delete(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const http: NodeHttpServer = createServer((req, res) => {
    void (async () => {
      try {
        if (!config) {
          sendJson(res, 503, { error: "Starting" });
          return;
        }
        const verdict = gate(req.headers, config);
        if (!verdict.ok) {
          sendJson(
            res,
            verdict.status,
            { error: verdict.message },
            verdict.status === 401 ? { "www-authenticate": 'Bearer realm="dax-editor"' } : {},
          );
          return;
        }
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (path !== MCP_PATH) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }
        await handleMcp(req, res);
      } catch (err) {
        if (err instanceof BodyError) {
          rpcError(res, err.status, err.status === 413 ? -32600 : -32700, err.message);
          return;
        }
        // Never echo internal error text to the client; it may contain paths.
        process.stderr.write(
          `dax-mcp: request failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        sendJson(res, 500, { error: "Internal error" });
      }
    })();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    http.once("error", rejectListen);
    http.listen(options.port ?? 0, host, () => {
      http.off("error", rejectListen);
      resolveListen();
    });
  });
  const port = (http.address() as AddressInfo).port;
  config = {
    hosts: allowedHostHeaders(port, options.allowedHosts),
    origins: allowedOriginValues(port, options.allowedOrigins),
    token,
  };
  const hostPart = host === "::1" ? "[::1]" : host;

  return {
    url: `http://${hostPart}:${port}${MCP_PATH}`,
    get clients() {
      return live.size;
    },
    port,
    host,
    token,
    session: base.session,
    async close() {
      await Promise.allSettled([...live.values()].map((s) => s.server.close()));
      live.clear();
      // Open SSE streams would keep close() waiting forever.
      http.closeAllConnections();
      await new Promise<void>((resolveClose) => http.close(() => resolveClose()));
    },
  };
}
