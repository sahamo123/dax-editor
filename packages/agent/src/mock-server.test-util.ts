// Test helper: a scripted HTTP server on 127.0.0.1 (node:http) that stands in for a model API. No network.

import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

/** A request the mock server received. */
export interface MockRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  /** The parsed JSON body (or the raw text if it was not JSON). */
  body: unknown;
}

/** What the mock server should answer. */
export interface MockReply {
  status?: number;
  /** Sent as JSON. */
  json?: unknown;
  /** Sent as a `text/event-stream`; each item is one event, e.g. `data: {...}`. */
  sse?: string[];
  /** Sent as plain text. */
  text?: string;
  headers?: Record<string, string>;
  /** Never answer (until the client gives up): for timeout and cancellation tests. */
  hang?: boolean;
}

/** A running mock server. */
export interface MockServer {
  /** Origin, e.g. `http://127.0.0.1:41234`. */
  url: string;
  requests: MockRequest[];
  close(): Promise<void>;
}

/**
 * Start a server whose n-th request is answered by `replies[n]` (a reply, or a function of the request).
 * The last reply is reused if more requests arrive.
 */
export async function startMockServer(
  replies: (MockReply | ((req: MockRequest) => MockReply))[],
): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // keep raw text
      }
      const seen: MockRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body,
      };
      requests.push(seen);
      const pick = replies[Math.min(requests.length - 1, replies.length - 1)];
      const reply = typeof pick === "function" ? pick(seen) : (pick ?? {});
      if (reply?.hang) return; // leave the socket open
      res.statusCode = reply?.status ?? 200;
      for (const [k, v] of Object.entries(reply?.headers ?? {})) res.setHeader(k, v);
      if (reply?.sse) {
        res.setHeader("content-type", "text/event-stream");
        res.end(reply.sse.map((e) => `${e}\n\n`).join(""));
      } else if (reply?.json !== undefined) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(reply.json));
      } else {
        res.end(reply?.text ?? "");
      }
    });
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
