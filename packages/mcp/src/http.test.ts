// Tests for the loopback Streamable HTTP server: the security gate (token, Host, Origin), request hygiene,
// and real MCP clients talking to it. Raw requests are used for the security cases so Host and Origin can be set freely.

import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type HttpServerOptions, type RunningHttpServer, startHttpServer } from "./http.js";
import { hasFfmpeg, makeClip, makeTempDir, removeTempDir } from "./test/media.js";

const running: RunningHttpServer[] = [];
const clients: Client[] = [];
afterEach(async () => {
  while (clients.length) await clients.pop()?.close();
  while (running.length) await running.pop()?.close();
});

async function start(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const s = await startHttpServer(options);
  running.push(s);
  return s;
}

/** One raw HTTP request to the server; returns status, headers and body text. */
function raw(
  server: RunningHttpServer,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string },
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: server.port,
        path: opts.path ?? "/mcp",
        method: opts.method ?? "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...opts.headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end(opts.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
  });
}

const auth = (s: RunningHttpServer) => ({ authorization: `Bearer ${s.token}` });

async function connectClient(server: RunningHttpServer): Promise<Client> {
  const client = new Client({ name: "http-test", version: "0.0.1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: { Authorization: `Bearer ${server.token}` } },
    }),
  );
  clients.push(client);
  return client;
}

describe("startup", () => {
  it("binds the loopback interface on a free port and generates a strong token", async () => {
    const s = await start();
    expect(s.host).toBe("127.0.0.1");
    expect(s.port).toBeGreaterThan(0);
    expect(s.url).toBe(`http://127.0.0.1:${s.port}/mcp`);
    expect(s.token.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
    expect(s.url).not.toContain(s.token);
    const other = await start();
    expect(other.token).not.toBe(s.token);
  });

  it("refuses to listen on anything but loopback and refuses weak tokens", async () => {
    await expect(startHttpServer({ host: "0.0.0.0" as never })).rejects.toThrow(/loopback/);
    await expect(startHttpServer({ token: "short" })).rejects.toThrow(/at least/);
  });
});

describe("security gate", () => {
  it("answers 401 without a token or with a wrong one", async () => {
    const s = await start();
    const none = await raw(s, {});
    expect(none.status).toBe(401);
    expect(String(none.headers["www-authenticate"])).toContain("Bearer");
    const wrong = await raw(s, { headers: { authorization: "Bearer not-the-token" } });
    expect(wrong.status).toBe(401);
    const basic = await raw(s, { headers: { authorization: `Basic ${s.token}` } });
    expect(basic.status).toBe(401);
    // The token must not be accepted from the query string.
    const query = await raw(s, { path: `/mcp?token=${s.token}` });
    expect(query.status).toBe(401);
  });

  it("answers 403 for a Host header that is not this server, even with a valid token (DNS rebinding)", async () => {
    const s = await start();
    const r = await raw(s, { headers: { ...auth(s), host: `evil.example:${s.port}` } });
    expect(r.status).toBe(403);
    expect(r.body).toContain("Host");
    const wrongPort = await raw(s, { headers: { ...auth(s), host: "127.0.0.1:1" } });
    expect(wrongPort.status).toBe(403);
  });

  it("answers 403 for a foreign Origin, and checks it before the token", async () => {
    const s = await start();
    const withToken = await raw(s, { headers: { ...auth(s), origin: "https://evil.example" } });
    expect(withToken.status).toBe(403);
    expect(withToken.body).toContain("Origin");
    const noToken = await raw(s, { headers: { origin: "https://evil.example" } });
    expect(noToken.status).toBe(403); // a web page learns nothing from a 401
    const nullOrigin = await raw(s, { headers: { ...auth(s), origin: "null" } });
    expect(nullOrigin.status).toBe(403);
  });

  it("does not turn the Origin check off when the allow-list is empty (the v1 SDK pitfall)", async () => {
    const s = await start({ allowedOrigins: [], allowedHosts: [] });
    const r = await raw(s, { headers: { ...auth(s), origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("lets loopback origins and explicitly allowed origins through the gate", async () => {
    const s = await start({ allowedOrigins: ["http://localhost:5173/"] });
    // A request that passes the gate but has no session gets 400 from the MCP layer, never 401 or 403.
    for (const origin of [
      `http://127.0.0.1:${s.port}`,
      `http://localhost:${s.port}`,
      "http://localhost:5173",
    ]) {
      const r = await raw(s, { headers: { ...auth(s), origin } });
      expect(r.status, origin).toBe(400);
    }
    expect((await raw(s, { headers: { ...auth(s), host: `localhost:${s.port}` } })).status).toBe(
      400,
    );
  });

  it("never sends CORS headers", async () => {
    const s = await start();
    const ok = await raw(s, { headers: { ...auth(s), origin: `http://127.0.0.1:${s.port}` } });
    const denied = await raw(s, { headers: { origin: "https://evil.example" } });
    for (const r of [ok, denied]) {
      expect(Object.keys(r.headers).filter((h) => h.startsWith("access-control-"))).toEqual([]);
    }
    const preflight = await raw(s, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(403);
  });
});

describe("request hygiene", () => {
  it("serves only /mcp and only POST, GET and DELETE", async () => {
    const s = await start();
    expect((await raw(s, { headers: auth(s), path: "/" })).status).toBe(404);
    expect((await raw(s, { headers: auth(s), path: "/mcp/other" })).status).toBe(404);
    expect((await raw(s, { headers: auth(s), method: "PUT" })).status).toBe(405);
  });

  it("rejects bad JSON, oversized bodies, and requests for sessions it does not know", async () => {
    const s = await start({ maxBodyBytes: 1024 });
    expect((await raw(s, { headers: auth(s), body: "{not json" })).status).toBe(400);
    expect((await raw(s, { headers: auth(s), body: "x".repeat(5000) })).status).toBe(413);
    const ghost = await raw(s, { headers: { ...auth(s), "mcp-session-id": "no-such-session" } });
    expect(ghost.status).toBe(404);
    const noSession = await raw(s, { headers: auth(s) });
    expect(noSession.status).toBe(400);
  });

  it("caps the number of open sessions", async () => {
    const s = await start({ maxSessions: 1 });
    await connectClient(s);
    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "second", version: "1" },
      },
    });
    const r = await raw(s, { headers: auth(s), body: initialize });
    expect(r.status).toBe(503);
  });
});

describe("real MCP clients", () => {
  it("lists tools and calls one over HTTP with the bearer token", async () => {
    const s = await start();
    const client = await connectClient(s);
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name)).toContain("get_project");
    const r = await client.callTool({ name: "get_project", arguments: {} });
    expect(r.isError).toBeFalsy();
  });

  it("fails to connect with a wrong token", async () => {
    const s = await start();
    const client = new Client({ name: "bad", version: "0.0.1" });
    await expect(
      client.connect(
        new StreamableHTTPClientTransport(new URL(s.url), {
          requestInit: { headers: { Authorization: "Bearer wrong-wrong-wrong" } },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("shares one project between clients", async () => {
    const s = await start();
    const a = await connectClient(s);
    const b = await connectClient(s);
    await a.callTool({ name: "save_checkpoint", arguments: { name: "from-a" } });
    expect(s.session.history().some((h) => h.name === "from-a")).toBe(true);
    const h = await b.callTool({ name: "get_history", arguments: {} });
    expect(JSON.stringify(h.structuredContent)).toContain("from-a");
  });

  it("works without sessions in stateless mode", async () => {
    const s = await start({ stateless: true });
    const client = await connectClient(s);
    expect((await client.listTools()).tools.length).toBeGreaterThan(30);
    const r = await client.callTool({ name: "get_project", arguments: {} });
    expect(r.isError).toBeFalsy();
  });

  it("ends every session when the server closes", async () => {
    const s = await start();
    await connectClient(s);
    await s.close();
    running.pop();
    await expect(raw(s, { headers: auth(s) })).rejects.toBeDefined();
  });
});

describe.skipIf(!hasFfmpeg())("long commands over HTTP (needs ffmpeg)", () => {
  let dir: string;
  let clip: string;
  beforeAll(() => {
    dir = makeTempDir();
    clip = makeClip(dir);
  }, 60_000);
  afterAll(() => removeTempDir(dir));

  it("streams export progress to the client", async () => {
    const s = await start({ allowedRoots: [dir] });
    const client = await connectClient(s);
    await client.callTool({ name: "import_media", arguments: { path: clip } });
    const out = join(dir, "http-out.mp4");
    const progress: number[] = [];
    const r = await client.callTool(
      { name: "export_video", arguments: { path: out } },
      { onprogress: (p) => progress.push(p.progress) },
    );
    expect(r.isError).toBeFalsy();
    expect(existsSync(out)).toBe(true);
    expect(progress.at(-1)).toBe(100);
  }, 120_000);
});
