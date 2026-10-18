// A stand-in for `@dax/server` used by the Playwright tests and for developing the UI without the real engine.
// It speaks the @dax/protocol HTTP + WebSocket API and runs the REAL @dax/core Session and command registry
// (so edits, undo and history behave exactly like production), real FFmpeg for media proxies and thumbnails,
// and a scripted chat "assistant" that calls real commands. Test tooling only: it is never shipped.
//
// Library use:  const server = await startMockServer({ aiReady: true });  ... await server.close();
// Command line: node e2e/mock-server.mjs --port 4399 --token dev --video /path/to/clip.mp4

import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { emptyProject, ffmpegBin, OVERLAY_PRESETS, Session, tryRunCommand } from "@dax/core";
import { API } from "@dax/protocol";
import { WebSocketServer } from "ws";

const SERVER_VERSION = "mock-0.0.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run FFmpeg to completion; resolves with stdout as a Buffer, rejects with the stderr tail on failure. */
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    const out = [];
    let err = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`ffmpeg failed: ${err.slice(-400)}`)),
    );
  });
}

/**
 * Make a small test video with FFmpeg's lavfi sources (no media is ever committed).
 * The audio alternates 1.5 s of tone and 1.5 s of silence, so `remove_silences` has something to cut.
 */
export async function makeFixtureVideo(path, { seconds = 6, width = 1280, height = 720 } = {}) {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=30:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=if(lt(mod(t\\,3)\\,1.5)\\,0.3*sin(2*PI*440*t)\\,0):s=44100:d=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    path,
  ]);
  return path;
}

const MEDIA_FILES = {
  "proxy.mp4": { file: "proxy.mp4", type: "video/mp4" },
  "thumb.jpg": { file: "thumb.jpg", type: "image/jpeg" },
  "waveform.json": { file: "waveform.json", type: "application/json" },
  "filmstrip.jpg": { file: "filmstrip.jpg", type: "image/jpeg" },
};

/** Read the audio of a file as 8 kHz mono samples and reduce it to `bins` peak values from 0 to 1. */
async function waveformPeaks(input, bins = 240) {
  const raw = await ffmpeg(["-i", input, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  if (samples.length === 0) return [];
  const per = Math.max(1, Math.floor(samples.length / bins));
  const peaks = [];
  for (let b = 0; b < bins; b++) {
    let max = 0;
    for (let i = b * per; i < Math.min(samples.length, (b + 1) * per); i++) {
      max = Math.max(max, Math.abs(samples[i]) / 32768);
    }
    peaks.push(Number(max.toFixed(3)));
  }
  return peaks;
}

/**
 * Start a mock engine on 127.0.0.1.
 * Options: `exportPadMs` (slow exports down for progress tests), `port` (0 = any), `token`, `aiReady` (a running local model, so chat works), `allowedRoots`,
 * `projectName`, `chatDelayMs` (pause between scripted chat events), `dataDir`.
 */
export async function startMockServer(options = {}) {
  const token = options.token ?? "test-token";
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "dax-mock-"));
  const ownsDataDir = !options.dataDir;
  const allowedRoots = options.allowedRoots;
  const chatDelay = options.chatDelayMs ?? 40;
  mkdirSync(join(dataDir, "media"), { recursive: true });

  let session = new Session(emptyProject(options.projectName ?? "Untitled"));
  let projectPath;
  const jobs = new Map();
  let jobCounter = 0;
  let busy = false;
  let chatAbort = null;
  let runCounter = 0;
  const settings = { activeProvider: "local", providers: {} };
  const secrets = {};
  const cli = { "cli-claude": "missing", "cli-codex": "missing", "cli-gemini": "missing" };
  const localModel = { installed: Boolean(options.aiReady), running: Boolean(options.aiReady) };
  const requests = [];
  const sockets = new Set();
  let port = options.port ?? 0;

  // ---------- state ----------

  function providerStatuses() {
    const oa = settings.providers["openai-compatible"] ?? {};
    const an = settings.providers.anthropic ?? {};
    const localUrl = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(oa.baseUrl ?? "");
    const cliDetail = (kind, cmd) =>
      cli[kind] === "in"
        ? "Signed in"
        : cli[kind] === "out"
          ? `Not signed in. Run ${cmd} once to sign in.`
          : `${cmd} is not installed`;
    return [
      {
        kind: "local",
        available: localModel.running,
        detail: localModel.running
          ? "Running on this computer"
          : localModel.installed
            ? "Downloaded. Press Start in Settings."
            : "Download a model to use it offline",
      },
      {
        kind: "openai-compatible",
        available: Boolean(oa.baseUrl && oa.model && (secrets["openai-compatible"] || localUrl)),
        detail:
          !oa.baseUrl || !oa.model
            ? "Add a base URL and model"
            : secrets["openai-compatible"] || localUrl
              ? "Ready"
              : "Add an API key",
        hasApiKey: Boolean(secrets["openai-compatible"]),
      },
      {
        kind: "anthropic",
        available: Boolean(secrets.anthropic && an.model),
        detail: !secrets.anthropic ? "Add an API key" : !an.model ? "Choose a model" : "Ready",
        hasApiKey: Boolean(secrets.anthropic),
      },
      ...["claude", "codex", "gemini"].map((c) => ({
        kind: `cli-${c}`,
        available: cli[`cli-${c}`] === "in",
        detail: cliDetail(`cli-${c}`, c),
        // Only known once the tool exists: absent means "not installed".
        ...(cli[`cli-${c}`] === "missing" ? {} : { signedIn: cli[`cli-${c}`] === "in" }),
      })),
    ];
  }

  function presetList() {
    return OVERLAY_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      category: p.category,
      description: p.description,
      animation: p.animation,
      defaultDuration: p.defaultDuration,
      defaultText: p.defaultText,
      ...(p.defaultSubtitle ? { defaultSubtitle: p.defaultSubtitle } : {}),
    }));
  }

  function buildState() {
    return {
      project: session.project,
      history: session.history(),
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      presets: presetList(),
      jobs: [...jobs.values()],
      settings: JSON.parse(JSON.stringify(settings)),
      providers: providerStatuses(),
      busy,
      serverVersion: SERVER_VERSION,
      ...(projectPath ? { projectPath } : {}),
    };
  }

  function send(ws, event) {
    if (ws.readyState === 1) ws.send(JSON.stringify(event));
  }
  function broadcast(event) {
    for (const ws of sockets) send(ws, event);
  }
  const broadcastState = () => broadcast({ type: "state", state: buildState() });

  // ---------- jobs ----------

  function startJob(kind, label) {
    const job = { id: `job${++jobCounter}`, kind, label, progress: 0, status: "running" };
    jobs.set(job.id, job);
    broadcast({ type: "job", job: { ...job } });
    return job;
  }
  function updateJob(job, patch) {
    Object.assign(job, patch);
    broadcast({ type: "job", job: { ...job } });
  }

  // ---------- media ----------

  const mediaDir = (assetId) => join(dataDir, "media", assetId);

  async function makeThumb(asset) {
    const dir = mediaDir(asset.id);
    mkdirSync(dir, { recursive: true });
    await ffmpeg([
      "-ss",
      String(Math.min(1, asset.duration / 2)),
      "-i",
      asset.path,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:-2",
      join(dir, "thumb.jpg"),
    ]);
  }

  async function makeProxies(asset) {
    const dir = mediaDir(asset.id);
    const job = startJob("proxy", `Preparing ${basename(asset.path)}`);
    try {
      await ffmpeg([
        "-i",
        asset.path,
        "-vf",
        "scale=-2:480",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-g",
        "15",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        join(dir, "proxy.mp4"),
      ]);
      updateJob(job, { progress: 0.5 });
      const frames = 10;
      await ffmpeg([
        "-i",
        asset.path,
        "-vf",
        `fps=${frames}/${Math.max(1, asset.duration)},scale=160:-2,tile=${frames}x1`,
        "-frames:v",
        "1",
        join(dir, "filmstrip.jpg"),
      ]);
      updateJob(job, { progress: 0.8 });
      const peaks = asset.hasAudio ? await waveformPeaks(asset.path) : [];
      writeFileSync(join(dir, "waveform.json"), JSON.stringify({ peaks }));
      updateJob(job, { progress: 1, status: "done" });
    } catch (err) {
      updateJob(job, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
    broadcastState();
  }

  /** Import files through the real `import_media` command, then build thumbnails and proxies. */
  async function importPaths(paths) {
    const before = new Set(Object.keys(session.project.assets));
    for (const path of paths) {
      const r = await tryRunCommand({ session, allowedRoots, source: "manual" }, "import_media", {
        path,
      });
      if (!r.ok) return { ok: false, error: r.error };
    }
    const added = Object.values(session.project.assets).filter((a) => !before.has(a.id));
    // The thumbnail is quick, so it is ready when the UI first asks; proxies take longer and report as a job.
    for (const asset of added) {
      await makeThumb(asset).catch(() => {});
      void makeProxies(asset);
    }
    broadcastState();
    return { ok: true, summary: `Imported ${added.length} file(s).` };
  }

  // ---------- commands ----------

  async function runManual(name, args) {
    const ctx = { session, allowedRoots, source: "manual" };
    if (name === "export_video") {
      const job = startJob("export", "Export");
      // Optional fake lead-in so tests can reliably observe progress on a very fast render.
      const pad = options.exportPadMs ?? 0;
      for (let i = 1; i <= 5 && pad > 0; i++) {
        await sleep(pad / 5);
        updateJob(job, { progress: i * 0.1 });
      }
      const r = await tryRunCommand(
        { ...ctx, onProgress: (f) => updateJob(job, { progress: Math.min(0.99, f) }) },
        name,
        args,
      );
      if (r.ok) updateJob(job, { progress: 1, status: "done", result: args?.path });
      else updateJob(job, { status: "error", error: r.error });
      broadcastState();
      return r.ok
        ? { ok: true, summary: r.summary, ...(r.data !== undefined ? { data: r.data } : {}) }
        : r;
    }
    const r = await tryRunCommand(ctx, name, args);
    broadcastState();
    return r.ok
      ? { ok: true, summary: r.summary, ...(r.data !== undefined ? { data: r.data } : {}) }
      : r;
  }

  // ---------- scripted assistant ----------

  const emitChat = (runId, event) => broadcast({ type: "chat", runId, event });

  async function say(runId, text, signal) {
    // Stream a few words at a time, like a real model.
    const words = text.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 3) {
      if (signal.aborted) return;
      emitChat(runId, { type: "text", text: words.slice(i, i + 3).join("") });
      await sleep(chatDelay / 2);
    }
  }

  async function callTool(runId, name, args, signal) {
    if (signal.aborted) return null;
    const id = `call${++runCounter}`;
    emitChat(runId, { type: "tool_call", id, name, args });
    await sleep(chatDelay);
    const r = await tryRunCommand({ session, allowedRoots, source: "ai" }, name, args);
    emitChat(runId, {
      type: "tool_result",
      id,
      name,
      ok: r.ok,
      summary: r.ok ? r.summary : r.error,
    });
    broadcastState();
    await sleep(chatDelay);
    return r;
  }

  async function scriptedRun(runId, message, signal) {
    const lower = message.toLowerCase();
    emitChat(runId, { type: "status", text: "Thinking..." });
    await sleep(chatDelay * 2);
    if (lower.includes("slowly")) {
      // A long run, so tests can press Stop.
      emitChat(runId, { type: "status", text: "Working on it..." });
      for (let i = 0; i < 100 && !signal.aborted; i++) await sleep(100);
      return;
    }
    if (!session.project.timeline.tracks.some((t) => t.clips.length > 0)) {
      await say(
        runId,
        "There is no video on the timeline yet. Import one first and I will edit it.",
        signal,
      );
      return;
    }
    await callTool(runId, "get_project", {}, signal);
    if (lower.includes("silence")) {
      await say(runId, "Cutting the silent pauses.", signal);
      const r = await callTool(runId, "remove_silences", {}, signal);
      await say(runId, r?.ok ? ` Done: ${r.summary}` : " That did not work.", signal);
    } else if (lower.includes("title")) {
      const r = await callTool(
        runId,
        "add_overlay",
        { preset: "title-fade", start: 0, text: "My Video" },
        signal,
      );
      await say(
        runId,
        r?.ok ? "I added a title at the start." : "I could not add a title.",
        signal,
      );
    } else if (/cut to (\d+)/.test(lower)) {
      const seconds = Number(/cut to (\d+)/.exec(lower)?.[1]);
      const r = await callTool(
        runId,
        "keep_only",
        { ranges: [{ start: 0, end: seconds }] },
        signal,
      );
      await say(
        runId,
        r?.ok ? `The video now runs ${seconds} seconds.` : "I could not shorten it.",
        signal,
      );
    } else if (lower.includes("fail")) {
      await callTool(runId, "split", { at: 9999 }, signal);
      await say(runId, "That edit was not possible.", signal);
    } else {
      await say(
        runId,
        "I'm the scripted test assistant. Try: remove silences, add a title, or cut to 3 seconds.",
        signal,
      );
    }
  }

  function startChat(message) {
    const runId = `run${++runCounter}`;
    const controller = new AbortController();
    chatAbort = controller;
    busy = true;
    broadcastState();
    void (async () => {
      try {
        await scriptedRun(runId, message, controller.signal);
        emitChat(runId, { type: "done", turns: 1 });
      } catch (err) {
        emitChat(runId, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        busy = false;
        chatAbort = null;
        broadcastState();
      }
    })();
    return runId;
  }

  // ---------- local model ----------

  const MODEL = {
    id: "mock-small",
    label: "Mock Small 3B (Q4)",
    sizeBytes: 2_100_000_000,
    description: "Small and quick. Good for simple edits.",
  };
  const modelStatus = () => ({
    recommended: MODEL,
    installed: localModel.installed,
    running: localModel.running,
    detail: localModel.running
      ? "Answering requests."
      : localModel.installed
        ? "Downloaded."
        : "Not downloaded yet.",
  });

  async function localModelAction(action) {
    if (action === "install") {
      const job = startJob("model-download", MODEL.label);
      void (async () => {
        for (let i = 1; i <= 10; i++) {
          await sleep(options.modelStepMs ?? 150);
          updateJob(job, { progress: i / 10 });
        }
        localModel.installed = true;
        updateJob(job, { status: "done" });
        broadcastState();
      })();
    } else if (action === "start") {
      const job = startJob("model-start", MODEL.label);
      void (async () => {
        await sleep(options.modelStepMs ?? 150);
        localModel.running = true;
        updateJob(job, { progress: 1, status: "done" });
        broadcastState();
      })();
    } else if (action === "stop") {
      localModel.running = false;
      broadcastState();
    } else if (action === "uninstall") {
      localModel.running = false;
      localModel.installed = false;
      broadcastState();
    }
  }

  // ---------- HTTP ----------

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new Error("Body too large");
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
  }

  function reply(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function serveMedia(req, res, pathname) {
    const [, , , assetId, kind] = pathname.split("/");
    const entry = MEDIA_FILES[kind ?? ""];
    const file = entry && assetId ? join(mediaDir(decodeURIComponent(assetId)), entry.file) : null;
    if (!entry || !file || !existsSync(file)) return reply(res, 404, { error: "No such media" });
    const size = statSync(file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, {
        "Content-Type": entry.type,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      "Content-Type": entry.type,
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    return createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url ?? "/", "http://mock");
    const given =
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token");
    if (given !== token) return reply(res, 401, { error: "Unauthorized" });
    requests.push({ method: req.method, path: url.pathname });

    const route = `${req.method} ${url.pathname}`;
    try {
      if (url.pathname.startsWith(`${API.media}/`) && req.method === "GET")
        return serveMedia(req, res, url.pathname);
      if (route === `GET ${API.health}`)
        return reply(res, 200, { ok: true, version: SERVER_VERSION });
      if (route === `GET ${API.state}`) return reply(res, 200, buildState());
      if (route === `POST ${API.command}`) {
        const body = await readJson(req);
        if (typeof body.name !== "string") return reply(res, 400, { error: "name is required" });
        return reply(res, 200, await runManual(body.name, body.args ?? {}));
      }
      if (route === `POST ${API.importMedia}`) {
        const body = await readJson(req);
        if (!Array.isArray(body.paths) || body.paths.length === 0)
          return reply(res, 400, { error: "paths is required" });
        const r = await importPaths(body.paths);
        return reply(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error });
      }
      if (route === `POST ${API.projectNew}`) {
        const body = await readJson(req);
        session = new Session(emptyProject(body.name ?? "Untitled"));
        projectPath = undefined;
        broadcastState();
        return reply(res, 200, { ok: true });
      }
      if (route === `POST ${API.projectSave}`) {
        projectPath =
          (await readJson(req)).path ?? projectPath ?? join(dataDir, "project.dax.json");
        broadcastState();
        return reply(res, 200, { ok: true, path: projectPath });
      }
      if (route === `POST ${API.projectOpen}`)
        return reply(res, 400, { error: "Opening projects is not supported by the mock server" });
      if (route === `POST ${API.chat}`) {
        const body = await readJson(req);
        if (typeof body.message !== "string" || !body.message.trim())
          return reply(res, 400, { error: "message is required" });
        const active = providerStatuses().find((p) => p.kind === settings.activeProvider);
        if (!active?.available)
          return reply(res, 409, { error: active?.detail ?? "No assistant is set up" });
        if (busy) return reply(res, 409, { error: "The assistant is already working" });
        return reply(res, 202, { runId: startChat(body.message) });
      }
      if (route === `POST ${API.chatCancel}`) {
        chatAbort?.abort();
        return reply(res, 200, { ok: true });
      }
      if (route === `GET ${API.settings}`) return reply(res, 200, settings);
      if (route === `PUT ${API.settings}`) {
        const body = await readJson(req);
        if (typeof body.activeProvider !== "string" || typeof body.providers !== "object")
          return reply(res, 400, { error: "Invalid settings" });
        settings.activeProvider = body.activeProvider;
        settings.providers = body.providers;
        broadcastState();
        return reply(res, 200, settings);
      }
      if (route === `POST ${API.apiKey}`) {
        const body = await readJson(req);
        if (typeof body.kind !== "string" || typeof body.apiKey !== "string" || !body.apiKey)
          return reply(res, 400, { error: "kind and apiKey are required" });
        secrets[body.kind] = body.apiKey;
        broadcastState();
        // Never echo the key back.
        return reply(res, 200, { ok: true });
      }
      if (route === `GET ${API.providers}`) return reply(res, 200, providerStatuses());
      if (route === `GET ${API.localModel}`) return reply(res, 200, modelStatus());
      if (route === `POST ${API.localModel}`) {
        const body = await readJson(req);
        await localModelAction(body.action);
        return reply(res, 200, modelStatus());
      }
      return reply(res, 404, { error: `No route for ${route}` });
    } catch (err) {
      return reply(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ---------- lifecycle ----------

  let http = null;
  let wss = null;

  async function listen() {
    http = createServer((req, res) => void handle(req, res));
    wss = new WebSocketServer({ noServer: true });
    http.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://mock");
      if (url.pathname !== API.ws || url.searchParams.get("token") !== token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        return socket.destroy();
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws);
        ws.on("close", () => sockets.delete(ws));
        send(ws, { type: "state", state: buildState() });
      });
    });
    await new Promise((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, "127.0.0.1", resolve);
    });
    port = http.address().port;
  }

  async function stopListening() {
    for (const ws of sockets) ws.terminate();
    sockets.clear();
    wss?.close();
    await new Promise((resolve) => (http ? http.close(() => resolve()) : resolve()));
    http?.closeAllConnections?.();
    http = null;
  }

  await listen();

  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    token,
    get port() {
      return port;
    },
    dataDir,
    /** The real core Session, for assertions. */
    get session() {
      return session;
    },
    /** Every authorised request so far, for assertions. */
    requests,
    /** API keys stored through the API (so tests can check they were saved but never returned). */
    secrets,
    settings,
    /** Import files exactly as `POST /api/import` does (thumbnail now, proxies in the background). */
    importPaths,
    /** Run a command directly as the user would, without the UI. */
    command: (name, args = {}) => runManual(name, args),
    /** Set whether a CLI (`cli-claude`, ...) is `missing`, `out` (not signed in) or `in`. */
    setCli(kind, status) {
      cli[kind] = status;
      broadcastState();
    },
    /** Simulate a lost connection: close the listener and every socket. */
    stop: stopListening,
    /** Come back on the same port after {@link stop}. */
    start: listen,
    /** Stop everything and delete the temp data dir. */
    async close() {
      chatAbort?.abort();
      await stopListening();
      if (ownsDataDir) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// Run directly: start a server and print one JSON line, like the real `dax-server` does.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const server = await startMockServer({
    port: Number(arg("port", 0)),
    token: arg("token", "dev"),
    aiReady: process.argv.includes("--ai"),
  });
  const video = arg("video");
  if (video) await server.importPaths([video]);
  console.log(
    JSON.stringify({
      url: server.url,
      token: server.token,
      port: server.port,
      version: SERVER_VERSION,
    }),
  );
  const stop = () => server.close().then(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
