// STAND-IN engine server for testing the Tauri shell before packages/server exists.
// It speaks the same launch contract as the real `dax-server` (see src-tauri/AGENTS.md):
//   args   --port <n|0> --data-dir <dir> --origin <o>... [--allow-root <p>...]
//   env    DAX_SERVER_TOKEN (token to require; random if unset)
//   stdout one ServerInfo JSON line once listening
//   stdin  end-of-input means the app is gone: exit now
//   SIGTERM clean up and exit
// plus GET /api/health and a dev-only GET /api/dev/file for testing <video> playback end to end.
// Replace it with the real server by building packages/server (see docs/maintainers/desktop-release.md).
//
// Test knobs (environment, stand-in only): DAX_STANDIN_CHILD=1 starts a long-running grandchild
// process; DAX_STANDIN_MODE=ignore-stdin ignores stdin end-of-input (exercises PDEATHSIG);
// DAX_STANDIN_MODE=ignore-all also ignores SIGTERM (exercises the SIGKILL escalation).

import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { extname, resolve, sep } from "node:path";

const VERSION = "0.0.0-standin";

function parseArgs(argv) {
  const out = { port: 0, dataDir: undefined, origins: [], roots: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--port") out.port = Number(value);
    else if (flag === "--data-dir") out.dataDir = value;
    else if (flag === "--origin") out.origins.push(value);
    else if (flag === "--allow-root") out.roots.push(value);
    else continue;
    i++;
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const token = process.env.DAX_SERVER_TOKEN || randomBytes(32).toString("hex");
const mode = process.env.DAX_STANDIN_MODE ?? "normal";
const allowedRoots = [...opts.roots, homedir(), ...(opts.dataDir ? [opts.dataDir] : [])].map((p) =>
  resolve(p),
);

const MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

function tokenMatches(candidate) {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function serveFile(req, res, url, cors) {
  const wanted = url.searchParams.get("path") ?? "";
  let real;
  try {
    real = await realpath(wanted);
  } catch {
    return send(res, 404, { error: "not found" }, cors);
  }
  if (!allowedRoots.some((r) => real === r || real.startsWith(r + sep))) {
    return send(res, 403, { error: "path outside the allowed roots" }, cors);
  }
  const info = await stat(real);
  const type = MIME[extname(real).toLowerCase()] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (range) {
    if (range[1] === "" && range[2] !== "") {
      start = Math.max(0, info.size - Number(range[2]));
    } else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= info.size) {
      res.writeHead(416, { "content-range": `bytes */${info.size}`, ...cors });
      return res.end();
    }
    status = 206;
  }
  const headers = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-length": end - start + 1,
    ...cors,
  };
  if (status === 206) headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
  res.writeHead(status, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(real, { start, end }).pipe(res);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const hostOk = /^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? "");
  if (!hostOk) return send(res, 403, { error: "bad host" });
  if (origin && !opts.origins.includes(origin)) return send(res, 403, { error: "bad origin" });
  const cors = origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type, range",
        "access-control-expose-headers": "content-range, accept-ranges, content-length",
        vary: "origin",
      }
    : {};
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!tokenMatches(bearer ?? url.searchParams.get("token") ?? "")) {
    return send(res, 401, { error: "unauthorized" }, cors);
  }
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, version: VERSION }, cors);
  if (url.pathname === "/api/dev/file") return serveFile(req, res, url, cors);
  send(res, 404, { error: "not found" }, cors);
});

let grandchild;
if (process.env.DAX_STANDIN_CHILD === "1") {
  // Stands for FFmpeg or llama-server: a process the server starts and must not leak.
  grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "dax-standin-child"], {
    stdio: "ignore",
  });
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  grandchild?.kill();
  server.close();
  // Do not wait for lingering keep-alive connections.
  setTimeout(() => process.exit(code), 50).unref();
  server.closeAllConnections?.();
}

if (mode !== "ignore-all") {
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
} else {
  process.on("SIGTERM", () => {});
}
if (mode === "normal") {
  process.stdin.on("end", () => stop(0));
  process.stdin.on("close", () => stop(0));
}
process.stdin.resume();

server.listen(opts.port, "127.0.0.1", () => {
  const { port } = server.address();
  const info = { url: `http://127.0.0.1:${port}`, token, port, version: VERSION };
  // The one line the launcher waits for. Everything else goes to stderr.
  process.stdout.write(`${JSON.stringify(info)}\n`);
  console.error(`standin listening on ${info.url} (pid ${process.pid}, mode ${mode})`);
});
