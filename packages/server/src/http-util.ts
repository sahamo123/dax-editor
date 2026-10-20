// Small HTTP helpers and the tiny router: JSON responses, size-limited body reading, and path-pattern matching. No policy lives here.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ErrorResponse } from "@dax/protocol";
import type { z } from "zod";

/** An error that maps to an HTTP status. The message is sent to the client, so it must never contain secrets. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Ask the server to close the connection after responding (used after an oversized body). */
    readonly closeConnection = false,
  ) {
    super(message);
  }
}

/** Write a JSON response with correct length and type headers. */
export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

/** Write an {@link ErrorResponse}. */
export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  const body: ErrorResponse = { error: message };
  sendJson(res, status, body, headers);
}

/**
 * Read and parse a JSON request body of at most `limit` bytes.
 * An empty body yields `undefined`. Throws {@link HttpError}: 415 for a non-JSON content type,
 * 413 when the body (declared or actual) exceeds `limit`, 400 for invalid JSON.
 */
export async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) {
    req.resume();
    throw new HttpError(413, `Request body is larger than ${limit} bytes`, true);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > limit) {
        // Keep draining so the client can read our 413, but stop buffering.
        tooBig = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", resolve);
    req.on("error", reject);
    req.on("aborted", () => reject(new HttpError(400, "Request was aborted")));
  });
  if (tooBig) throw new HttpError(413, `Request body is larger than ${limit} bytes`, true);
  if (size === 0) return undefined;
  const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

/** Validate `value` with a zod schema, turning failures into a 400 whose message lists each bad field. */
export function parseWith<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value ?? {});
  if (r.success) return r.data;
  const issues = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
  throw new HttpError(400, `Invalid request: ${issues.join("; ")}`);
}

/** What a route handler receives. */
export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  /** Parsed request URL. Its query string is never logged. */
  url: URL;
  /** Values of `:name` segments in the route pattern, already percent-decoded. */
  params: Record<string, string>;
  /** Headers every response from this handler should carry (security, CORS). */
  headers: Record<string, string>;
  /** Read the JSON body, enforcing the size limit. */
  body(): Promise<unknown>;
  /** Respond with JSON and the standard headers. */
  json(status: number, body: unknown): void;
}

/** A route handler. Throw {@link HttpError} for client errors. */
export type RouteHandler = (ctx: RouteContext) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

/** A minimal method + path-pattern router (`/api/media/:assetId/:file`). */
export class Router {
  private readonly routes: Route[] = [];

  /** Register a handler for one method and a pattern whose `:name` segments capture a single path segment. */
  add(method: string, pattern: string, handler: RouteHandler): void {
    this.routes.push({ method, segments: pattern.split("/"), handler });
  }

  /**
   * Find the handler for a request.
   * @returns the handler and params, or `{ allowed }` with the methods that exist for that path (for a 405), or undefined for a 404.
   * @throws HttpError 400 if a captured segment is not valid percent-encoding.
   */
  match(
    method: string,
    pathname: string,
  ): { handler: RouteHandler; params: Record<string, string> } | { allowed: string[] } | undefined {
    const parts = pathname.split("/");
    const allowed = new Set<string>();
    for (const route of this.routes) {
      const params = matchSegments(route.segments, parts);
      if (!params) continue;
      if (route.method === method || (method === "HEAD" && route.method === "GET")) {
        return { handler: route.handler, params };
      }
      allowed.add(route.method);
    }
    return allowed.size > 0 ? { allowed: [...allowed] } : undefined;
  }
}

function matchSegments(pattern: string[], parts: string[]): Record<string, string> | undefined {
  if (pattern.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i] ?? "";
    const part = parts[i] ?? "";
    if (p.startsWith(":")) {
      if (part === "") return undefined;
      try {
        params[p.slice(1)] = decodeURIComponent(part);
      } catch {
        throw new HttpError(400, "Malformed percent-encoding in URL");
      }
    } else if (p !== part) {
      return undefined;
    }
  }
  return params;
}
