// Shared test helpers: fake whisper-cli, tiny WAV writer, local HTTP server with Range support.

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** True when ffmpeg is on PATH (end-to-end tests are skipped otherwise, like core's). */
export function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** True when `tar` can be run (needed by the ensureBinary tests). */
export function hasTar(): boolean {
  try {
    execFileSync("tar", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Make a temp folder; callers remove it in `afterAll`. */
export function tempDir(prefix = "dax-stt-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy the fake whisper-cli into `dir` as an executable and return its path. */
export function installFakeCli(dir: string): string {
  const target = join(dir, "fake-whisper-cli");
  copyFileSync(join(here, "fake-whisper-cli.mjs"), target);
  chmodSync(target, 0o755);
  return target;
}

/** Absolute path of a captured fixture under `packages/stt/fixtures`. */
export function fixturePath(name: string): string {
  return join(here, "..", "fixtures", name);
}

/** A stretch of a synthetic recording: a tone or silence of `sec` seconds. */
export interface WavPart {
  /** Length in seconds. */
  sec: number;
  /** Tone amplitude 0..1; 0 is digital silence. Default 0.5. */
  amp?: number;
}

/** Write a 16 kHz mono 16-bit WAV made of tone and silence parts. Returns its duration in seconds. */
export function writeWav(path: string, parts: WavPart[]): number {
  const rate = 16000;
  const total = parts.reduce((n, p) => n + Math.round(p.sec * rate), 0);
  const buf = Buffer.alloc(44 + total * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + total * 2, 4);
  buf.write("WAVEfmt ", 8, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(total * 2, 40);
  let at = 44;
  for (const p of parts) {
    const n = Math.round(p.sec * rate);
    const amp = (p.amp ?? 0.5) * 32767;
    for (let i = 0; i < n; i++) {
      buf.writeInt16LE(Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / rate)), at);
      at += 2;
    }
  }
  writeFileSync(path, buf);
  return total / rate;
}

/** Behaviour switches for {@link startServer}. */
export interface ServerOptions {
  /** Ignore Range headers and always answer 200 with the full body. */
  ignoreRange?: boolean;
  /** Close the connection after this many body bytes (simulates a dropped download), once per `dropOnce` entry. */
  dropAfterBytes?: number;
  /** Answer this status instead of serving the body. */
  status?: number;
}

/** A running local HTTP server serving one in-memory file at `/file`. */
export interface TestServer {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** Headers of every request received, in order. */
  requests: IncomingMessage["headers"][];
  /** Stop the server. */
  close(): Promise<void>;
}

/** Serve `body` at `/file` (and `/<name>` for each extra entry) with optional Range support and failure modes. */
export async function startServer(
  body: Buffer,
  opts: ServerOptions = {},
  extra: Record<string, Buffer> = {},
): Promise<TestServer> {
  const requests: IncomingMessage["headers"][] = [];
  let drops = opts.dropAfterBytes !== undefined ? 1 : 0;
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    requests.push(req.headers);
    const name = (req.url ?? "/").replace(/^\//, "");
    const data = name === "file" ? body : extra[name];
    if (!data) {
      res.writeHead(404).end();
      return;
    }
    if (opts.status) {
      res.writeHead(opts.status).end();
      return;
    }
    let start = 0;
    const range = /^bytes=(\d+)-/.exec(String(req.headers.range ?? ""));
    if (range && !opts.ignoreRange) start = Number(range[1]);
    if (start >= data.length) {
      res.writeHead(416, { "Content-Range": `bytes */${data.length}` }).end();
      return;
    }
    const slice = data.subarray(start);
    if (start > 0) {
      res.writeHead(206, {
        "Content-Length": slice.length,
        "Content-Range": `bytes ${start}-${data.length - 1}/${data.length}`,
      });
    } else {
      res.writeHead(200, { "Content-Length": slice.length });
    }
    if (drops > 0 && opts.dropAfterBytes !== undefined) {
      drops--;
      res.write(slice.subarray(0, opts.dropAfterBytes), () => req.socket.destroy());
      return;
    }
    res.end(slice);
  };
  const server: Server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
