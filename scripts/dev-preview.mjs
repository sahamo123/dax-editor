// Run the browser development editor against the packaged offline engine, with persistent project data.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const resources = join(desktop, "src-tauri/resources");
const binaries = join(desktop, "src-tauri/binaries");
const engineFile = join(resources, "server/cli.mjs");
if (!existsSync(engineFile) || !existsSync(join(desktop, "dist/index.html"))) {
  throw new Error("Build the desktop resources first with scripts/Build-Windows.ps1.");
}
const { preview } = await import(
  pathToFileURL(join(desktop, "node_modules/vite/dist/node/index.js")).href
);
let connectionUrl;
const web = await preview({
  root: desktop,
  plugins: [
    {
      name: "preview-engine-connection",
      configurePreviewServer(server) {
        // A plain bookmark or a different browser tab needs this launch's connection,
        // rather than stale session storage or a token copied by hand.
        server.middlewares.use((request, response, next) => {
          if (request.url !== "/" || request.headers.host !== "127.0.0.1:4175") return next();
          if (!connectionUrl) {
            response.writeHead(503, { "Retry-After": "1", "Cache-Control": "no-store" });
            response.end("Editor engine is starting. Reload in a moment.");
            return;
          }
          response.writeHead(302, {
            Location: connectionUrl,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          });
          response.end();
        });
      },
    },
  ],
  preview: { host: "127.0.0.1", port: 4175, strictPort: true, open: false },
});
const origin = "http://127.0.0.1:4175";
const dataDir = join(root, ".dax-data");
await mkdir(dataDir, { recursive: true });
const child = spawn(
  join(binaries, "dax-node-x86_64-pc-windows-msvc.exe"),
  [engineFile, "--data-dir", dataDir, "--origin", origin],
  {
    cwd: resources,
    env: {
      ...process.env,
      DAX_FFMPEG: join(binaries, "dax-ffmpeg-x86_64-pc-windows-msvc.exe"),
      DAX_FFPROBE: join(binaries, "dax-ffprobe-x86_64-pc-windows-msvc.exe"),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  },
);
child.stderr.pipe(process.stderr);
const exited = new Promise((done) => child.once("close", done));
let stopping;
function stop() {
  stopping ??= (async () => {
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    await exited;
    clearTimeout(timer);
    await new Promise((done) => {
      web.httpServer.close(done);
      web.httpServer.closeAllConnections();
    });
  })();
  return stopping;
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
child.once("close", (code) => {
  if (stopping) return;
  process.exitCode = code === 0 ? 0 : 1;
  void stop();
});
try {
  const info = await new Promise((done, fail) => {
    let line = "";
    const timer = setTimeout(() => fail(new Error("Offline engine startup timed out.")), 150_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      fail(new Error("Engine stopped before startup."));
    });
    child.stdout.on("data", (chunk) => {
      line += chunk.toString();
      if (!line.includes("\n")) return;
      clearTimeout(timer);
      try {
        done(JSON.parse(line.split("\n")[0]));
      } catch (error) {
        fail(error);
      }
    });
  });
  connectionUrl = `${origin}/?${new URLSearchParams({ server: info.url, token: info.token })}`;
  const health = await fetch(`${info.url}/api/health`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  if (!health.ok || !(await fetch(origin)).ok)
    throw new Error("Development preview health check failed.");
  console.log(
    `Development preview ready at ${origin}. Project data: .dax-data. Press Ctrl+C to stop.`,
  );
  if (process.argv.includes("--smoke")) {
    const entry = await fetch(origin, { redirect: "manual" });
    if (entry.status !== 302 || entry.headers.get("location") !== connectionUrl)
      throw new Error("Plain preview link did not receive the current engine connection.");
    const status = await fetch(`${info.url}/api/local-model`, {
      headers: { Authorization: `Bearer ${info.token}` },
    }).then((response) => response.json());
    if (!status.installed)
      throw new Error("Offline AI is not installed in the development preview.");
    if (status.running) throw new Error("Manual startup unexpectedly loaded local inference.");
    console.log(
      "Development preview smoke passed: frontend, authenticated engine and offline AI installed but unloaded.",
    );
    await stop();
  } else if (!process.argv.includes("--no-open")) {
    spawn("explorer.exe", [origin], { stdio: "ignore", windowsHide: true }).on("error", () => {
      console.error("Browser could not open. Restart with Start Development Preview.cmd.");
      void stop();
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  await stop();
}
