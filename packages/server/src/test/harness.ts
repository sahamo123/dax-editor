// Shared test harness: starts a real server on a temp data dir, makes raw HTTP requests (so tests can set Host and Origin freely),
// opens WebSockets, and generates media with FFmpeg lavfi sources. Tests never touch the network beyond 127.0.0.1.

import { execFile, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { WsEvent } from "@dax/protocol";
import { WebSocket } from "ws";
import { createLogger, type Logger } from "../logger.js";
import { type RunningServer, type ServerOptions, startServer } from "../server.js";

const execFileAsync = promisify(execFile);

/** True if both ffmpeg and ffprobe run on this machine. Media tests are skipped otherwise. */
export const HAS_FFMPEG: boolean = (() => {
  try {
    return (
      spawnSync("ffmpeg", ["-version"]).status === 0 &&
      spawnSync("ffprobe", ["-version"]).status === 0
    );
  } catch {
    return false;
  }
})();

/** Everything a test needs about a running server. */
export interface Harness {
  server: RunningServer;
  /** `http://127.0.0.1:PORT`. */
  base: string;
  port: number;
  token: string;
  /** The server's data dir. */
  dataDir: string;
  /** A scratch dir inside the allowed root, for media and exports. */
  workDir: string;
  /** Lines the server logged (debug level), already redacted by the server's logger. */
  logs: string[];
  /** Request with the token by default; pass `token: null` for none. */
  req(path: string, opts?: ReqOptions): Promise<Res>;
  /** POST a JSON body (with token) and parse the JSON reply. */
  post(path: string, body: unknown): Promise<Res>;
  /** Run a registry command through POST /api/command and return the parsed body. */
  command(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ ok: boolean; [k: string]: unknown }>;
  /** Open an authenticated WebSocket and record its events. */
  ws(): Promise<WsClient>;
  /** Stop the server (if still running) and delete the temp folders. */
  cleanup(): Promise<void>;
}

/** Options for {@link Harness.req}. */
export interface ReqOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Send this token as a Bearer header; `null` sends no Authorization header. Default: the server's token. */
  token?: string | null;
}

/** A buffered HTTP response. */
export interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  text(): string;
  json<T = Record<string, unknown>>(): T;
}

/** A WebSocket that records every event it receives. */
export interface WsClient {
  socket: WebSocket;
  events: WsEvent[];
  /** Resolve with the first recorded or future event matching `pred`. */
  waitFor<T extends WsEvent>(pred: (e: WsEvent) => e is T, timeoutMs?: number): Promise<T>;
  waitForAny(pred: (e: WsEvent) => boolean, timeoutMs?: number): Promise<WsEvent>;
  close(): void;
}

/** Make a raw HTTP request to `base`, with full control over headers (including Host). */
export function rawRequest(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: opts.method ?? "GET",
        headers: { ...(opts.headers ?? {}) },
        setHost: !Object.keys(opts.headers ?? {}).some((h) => h.toLowerCase() === "host"),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
            text: () => body.toString("utf8"),
            json: <T>() => JSON.parse(body.toString("utf8")) as T,
          });
        });
      },
    );
    // A server may answer 413 and close before we finish sending; treat the response as the result.
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** Start a server on a fresh temp data dir. `overrides` replace the defaults (allowed root = the work dir). */
export async function startHarness(overrides: Partial<ServerOptions> = {}): Promise<Harness> {
  // realpath: on macOS the temp dir is a symlink, and the server compares real paths.
  const root = await realpath(await mkdtemp(join(tmpdir(), "dax-server-test-")));
  const dataDir = overrides.dataDir ?? join(root, "data");
  const workDir = join(root, "work");
  await mkdir(workDir, { recursive: true });
  const logs: string[] = [];
  const logger: Logger = createLogger((line) => logs.push(line), "debug");
  const server = await startServer({
    dataDir,
    allowRoots: [workDir, dataDir],
    origins: ["http://localhost:5173"],
    logger,
    ...overrides,
  });
  const { port, token } = server.info;
  const base = server.info.url;
  const sockets: WsClient[] = [];

  const req: Harness["req"] = (path, opts = {}) => {
    const t = opts.token === undefined ? token : opts.token;
    return rawRequest(port, path, {
      ...(opts.method ? { method: opts.method } : {}),
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(opts.headers ?? {}) },
    });
  };
  const post: Harness["post"] = (path, body) =>
    req(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

  return {
    server,
    base,
    port,
    token,
    dataDir,
    workDir,
    logs,
    req,
    post,
    async command(name, args = {}) {
      const r = await post("/api/command", { name, args });
      return r.json();
    },
    async ws() {
      const client = await openWs(`ws://127.0.0.1:${port}/ws?token=${token}`);
      sockets.push(client);
      return client;
    },
    async cleanup() {
      for (const s of sockets) s.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Open a WebSocket and wait until it is connected. Rejects with the HTTP status if the upgrade is refused. */
export function openWs(url: string, headers: Record<string, string> = {}): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    const events: WsEvent[] = [];
    const waiters: Array<{ pred: (e: WsEvent) => boolean; resolve: (e: WsEvent) => void }> = [];
    socket.on("message", (data) => {
      const event = JSON.parse(data.toString()) as WsEvent;
      events.push(event);
      for (const w of [...waiters]) {
        if (w.pred(event)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(event);
        }
      }
    });
    socket.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.on("error", reject);
    const waitForAny = (pred: (e: WsEvent) => boolean, timeoutMs = 20_000) =>
      new Promise<WsEvent>((res, rej) => {
        const found = events.find(pred);
        if (found) return res(found);
        const t = setTimeout(
          () => rej(new Error("Timed out waiting for a WebSocket event")),
          timeoutMs,
        );
        waiters.push({
          pred,
          resolve: (e) => {
            clearTimeout(t);
            res(e);
          },
        });
      });
    socket.on("open", () =>
      resolve({
        socket,
        events,
        waitForAny,
        waitFor: (pred, timeoutMs) => waitForAny(pred, timeoutMs) as never,
        close: () => socket.close(),
      }),
    );
  });
}

/**
 * Generate a test video with FFmpeg's lavfi sources (nothing is committed to the repo).
 * 1280x720 by default so the 480p proxy is a real downscale. mpeg4 + aac is available in every FFmpeg build.
 */
export async function makeVideo(
  dir: string,
  name: string,
  opts: { seconds?: number; size?: string; audio?: boolean } = {},
): Promise<string> {
  const out = join(dir, name);
  const seconds = opts.seconds ?? 3;
  const args = [
    ...["-y", "-hide_banner", "-loglevel", "error"],
    ...["-f", "lavfi", "-i", `testsrc2=d=${seconds}:s=${opts.size ?? "1280x720"}:r=30`],
    ...(opts.audio === false ? [] : ["-f", "lavfi", "-i", `sine=f=440:d=${seconds}`]),
    ...["-c:v", "mpeg4", "-q:v", "4"],
    ...(opts.audio === false ? ["-an"] : ["-c:a", "aac", "-shortest"]),
    out,
  ];
  await execFileAsync("ffmpeg", args);
  return out;
}

/** Run ffprobe and return its JSON output for streams and format. */
export async function ffprobeJson(path: string): Promise<{
  streams: Array<Record<string, string | number>>;
  format: Record<string, string>;
}> {
  const { stdout } = await execFileAsync("ffprobe", [
    ...["-v", "error", "-print_format", "json", "-show_format", "-show_streams"],
    path,
  ]);
  return JSON.parse(stdout);
}

/** Presentation times (seconds) of the key frames in the first video stream. */
export async function keyframeTimes(path: string): Promise<number[]> {
  const { stdout } = await execFileAsync("ffprobe", [
    ...["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey"],
    ...["-show_entries", "frame=pts_time", "-of", "csv=p=0", path],
  ]);
  // ffprobe may append extra columns; the first is pts_time.
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => Number(line.split(",")[0]));
}
