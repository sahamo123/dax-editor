// A small stand-in for @dax/server, used only by the editor's dev harness and e2e tests. It applies commands with
// the REAL @dax/core Session + runCommand (so behaviour is realistic) and serves FFmpeg-generated demo media with
// HTTP Range support. It implements just the parts of @dax/protocol the editor needs: health, state, command, media.
// Run directly: `node src/editor/dev/mock-server.ts --port 4390` (Node 22 strips the types).

import { createReadStream, mkdtempSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyProject, OVERLAY_PRESETS, Session, tryRunCommand } from "@dax/core";
import type { PresetInfo, ServerInfo, StateResponse } from "@dax/protocol";
import { type DemoMedia, makeDemoMedia } from "./media-gen.ts";

/** Fixed token of the mock server; the dev harness uses it by default. */
export const MOCK_TOKEN = "dev-token";

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = resolve(here, "../../../../../packages/core/assets/fonts");

/** Options for {@link startMockServer}. */
export interface MockOptions {
  /** Port to listen on; 0 picks a free one. */
  port?: number;
  /** Where to put generated media (default: a fresh temp directory). */
  dir?: string;
}

/** A running mock server. */
export interface MockServer {
  info: ServerInfo;
  /** Reset the project to the three demo clips (history cleared). */
  reset(): Promise<void>;
  close(): Promise<void>;
}

const CLIPS = [
  { name: "a", letter: "A", hue: 0, freq: 220, duration: 6 },
  { name: "b", letter: "B", hue: 120, freq: 330, duration: 6 },
  { name: "c", letter: "C", hue: 220, freq: 440, duration: 6 },
];

function presetInfos(): (PresetInfo & { style: unknown })[] {
  return OVERLAY_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    category: p.category,
    description: p.description,
    animation: p.animation,
    defaultDuration: p.defaultDuration,
    defaultText: p.defaultText,
    ...(p.defaultSubtitle ? { defaultSubtitle: p.defaultSubtitle } : {}),
    // Not part of the protocol yet; the editor reads it when present to draw accurate preset chips.
    style: p.style,
  }));
}

/** Start the mock server. Generates demo media first (takes a few seconds). */
export async function startMockServer(opts: MockOptions = {}): Promise<MockServer> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), "dax-editor-mock-"));
  const media = new Map<string, DemoMedia>();
  const generated = CLIPS.map((c) =>
    makeDemoMedia(dir, c.name, { ...c, fontFile: join(fontsDir, "Inter-Bold.otf") }),
  );
  let session = new Session(emptyProject("Demo"));

  async function seed(): Promise<void> {
    session = new Session(emptyProject("Demo"));
    media.clear();
    for (const g of generated) {
      const r = await tryRunCommand({ session }, "import_media", { path: g.source });
      if (!r.ok) throw new Error(`mock seed failed: ${r.error}`);
      const data = r.data as { assetId: string };
      media.set(data.assetId, g);
    }
    // Importing is history; start the demo with a clean slate so Undo begins disabled.
    session = new Session(session.project);
  }
  await seed();

  function state(): StateResponse {
    return {
      project: session.project,
      history: session.history(),
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      presets: presetInfos(),
      jobs: [],
      settings: { activeProvider: "local", providers: {} },
      providers: [],
      busy: false,
      serverVersion: "mock",
    };
  }

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };

  function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function serveFile(req: IncomingMessage, res: ServerResponse, file: string, type: string): void {
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      json(res, 404, { error: "not found" });
      return;
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { ...cors, "content-range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...cors,
        "content-type": type,
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      ...cors,
      "content-type": type,
      "accept-ranges": "bytes",
      "content-length": size,
    });
    createReadStream(file).pipe(res);
  }

  async function readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (url.pathname === "/api/health") return json(res, 200, { ok: true });
      if (url.pathname.startsWith("/fonts/")) {
        const name = url.pathname.slice("/fonts/".length);
        if (/^[\w-]+\.otf$/.test(name))
          return serveFile(req, res, join(fontsDir, name), "font/otf");
        return json(res, 404, { error: "not found" });
      }
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      if ((url.searchParams.get("token") ?? bearer) !== MOCK_TOKEN) {
        return json(res, 401, { error: "bad token" });
      }
      if (url.pathname === "/api/state") return json(res, 200, state());
      if (url.pathname === "/api/reset" && req.method === "POST") {
        await seed();
        return json(res, 200, state());
      }
      if (url.pathname === "/api/command" && req.method === "POST") {
        const body = (await readBody(req)) as { name?: string; args?: unknown };
        const out = await tryRunCommand(
          { session, source: "manual" },
          body.name ?? "",
          body.args ?? {},
        );
        return json(res, out.ok ? 200 : 400, out);
      }
      const m = /^\/api\/media\/([^/]+)\/([\w.]+)$/.exec(url.pathname);
      if (m?.[1] && m[2]) {
        const g = media.get(decodeURIComponent(m[1]));
        if (!g) return json(res, 404, { error: "unknown asset" });
        switch (m[2]) {
          case "proxy.mp4":
            return serveFile(req, res, g.proxy, "video/webm");
          case "thumb.jpg":
            return serveFile(req, res, g.thumb, "image/jpeg");
          case "filmstrip.jpg":
            return serveFile(req, res, g.filmstrip, "image/jpeg");
          case "waveform.json":
            return serveFile(req, res, g.waveform, "application/json");
        }
      }
      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((ok) => server.listen(opts.port ?? 0, "127.0.0.1", ok));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    info: { url: `http://127.0.0.1:${port}`, token: MOCK_TOKEN, port, version: "mock" },
    reset: seed,
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

// Started directly (not imported): serve until killed.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4390;
  const mock = await startMockServer({ port });
  console.log(JSON.stringify(mock.info));
}
