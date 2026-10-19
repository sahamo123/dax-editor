// The engine the Playwright tests (and `pnpm mock-server`) talk to. Despite the name it is NOT a re-implementation of
// the API: it runs the REAL `@dax/server` in-process (real routes, security gate, WebSocket, media pipeline, core
// commands, FFmpeg), so request and response shapes cannot drift from production. Only the edges that need a
// model, a signed-in CLI or a 2 GB download are replaced with controllable fakes injected through the server's own
// interfaces: a scripted chat assistant, a fake local model, and a provider registry whose CLI states tests can set.
//
// Library use:  const server = await startMockServer({ aiReady: true });  ... await server.close();
// Command line: node e2e/mock-server.mjs --port 4399 --token dev-token-dev-token --ai --video /path/to/clip.mp4
// For the whole engine as a separate process, see real-engine.mjs.

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tryRunCommand } from "@dax/core";
import { createProviderRegistry } from "@dax/engine";
import { createLogger, startServer } from "@dax/server";
import { engineApi } from "./engine-api.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Origins the app may be served from in the tests (the Playwright preview server and the Vite dev server). */
const DEFAULT_ORIGINS = [
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

/** The model the fake local-model controller pretends to offer. */
const MODEL = {
  modelId: "mock-small",
  label: "Mock Small 3B (Q4)",
  description: "Small and quick. Good for simple edits.",
  sizeBytes: 2_100_000_000,
};

/**
 * A `LocalModelController` that downloads and starts nothing but behaves like the real one: progress
 * callbacks, abort signals, and a status line. `stepMs` is the delay of each of its 10 steps.
 */
function createFakeLocalModel(initial, stepMs) {
  const state = { installed: initial, running: initial };
  /** Resolve after `ms`, or reject as soon as the task is cancelled. */
  const wait = (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });
  return {
    state,
    controller: {
      async status() {
        return {
          installed: state.installed,
          running: state.running,
          detail: state.running
            ? "Answering requests."
            : state.installed
              ? "Downloaded."
              : "Not downloaded yet.",
          ...MODEL,
          ...(state.running ? { baseUrl: "http://127.0.0.1:1/v1" } : {}),
        };
      },
      async install(_modelId, task) {
        for (let i = 1; i <= 10; i++) {
          await wait(stepMs, task.signal);
          task.onProgress(i / 10);
        }
        state.installed = true;
      },
      async start(task) {
        await wait(stepMs, task.signal);
        task.onProgress(1);
        state.running = true;
      },
      async stop() {
        state.running = false;
      },
      async uninstall() {
        state.installed = false;
      },
    },
  };
}

/**
 * The scripted assistant: understands a few phrases and calls real commands as the AI (`source: "ai"`).
 * Like the real engine's runner, it reports an unavailable provider as an `error` event rather than by refusing.
 */
function createScriptedAssistant(registry, chatDelay) {
  let calls = 0;
  const say = async (ctx, text) => {
    // Stream a few words at a time, like a real model.
    const words = text.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 3) {
      if (ctx.signal.aborted) return;
      ctx.onEvent({ type: "text", text: words.slice(i, i + 3).join("") });
      await sleep(chatDelay / 2);
    }
  };
  const callTool = async (ctx, name, args) => {
    if (ctx.signal.aborted) return null;
    const id = `call${++calls}`;
    ctx.onEvent({ type: "tool_call", id, name, args });
    await sleep(chatDelay);
    const r = await tryRunCommand(
      { session: ctx.session, allowedRoots: [...ctx.allowedRoots], source: "ai" },
      name,
      args,
    );
    ctx.onEvent({ type: "tool_result", id, name, ok: r.ok, summary: r.ok ? r.summary : r.error });
    await sleep(chatDelay);
    return r;
  };
  const script = async (message, ctx) => {
    const lower = message.toLowerCase();
    ctx.onEvent({ type: "status", text: "Thinking..." });
    await sleep(chatDelay * 2);
    if (lower.includes("slowly")) {
      // A long run, so tests can press Stop.
      ctx.onEvent({ type: "status", text: "Working on it..." });
      for (let i = 0; i < 100 && !ctx.signal.aborted; i++) await sleep(100);
      return;
    }
    if (!ctx.session.project.timeline.tracks.some((t) => t.clips.length > 0)) {
      await say(ctx, "There is no video on the timeline yet. Import one first and I will edit it.");
      return;
    }
    await callTool(ctx, "get_project", {});
    if (lower.includes("silence")) {
      await say(ctx, "Cutting the silent pauses.");
      const r = await callTool(ctx, "remove_silences", {});
      await say(ctx, r?.ok ? ` Done: ${r.summary}` : " That did not work.");
    } else if (lower.includes("title")) {
      const r = await callTool(ctx, "add_overlay", {
        preset: "title-fade",
        start: 0,
        text: "My Video",
      });
      await say(ctx, r?.ok ? "I added a title at the start." : "I could not add a title.");
    } else if (/cut to (\d+)/.test(lower)) {
      const seconds = Number(/cut to (\d+)/.exec(lower)?.[1]);
      const r = await callTool(ctx, "keep_only", { ranges: [{ start: 0, end: seconds }] });
      await say(ctx, r?.ok ? `The video now runs ${seconds} seconds.` : "I could not shorten it.");
    } else if (lower.includes("fail")) {
      await callTool(ctx, "split", { at: 9999 });
      await say(ctx, "That edit was not possible.");
    } else {
      await say(
        ctx,
        "I'm the scripted test assistant. Try: remove silences, add a title, or cut to 3 seconds.",
      );
    }
  };
  // The factory the server calls once per chat message.
  return async (env) => {
    const active = (await registry.list(env)).find((p) => p.kind === env.settings.activeProvider);
    if (!active?.available) {
      return {
        async run(_message, ctx) {
          ctx.onEvent({ type: "error", message: active?.detail ?? "No AI provider is available." });
        },
      };
    }
    return {
      async run(message, ctx) {
        await script(message, ctx);
        if (!ctx.signal.aborted) ctx.onEvent({ type: "done", turns: 1 });
      },
    };
  };
}

/**
 * Start the engine on 127.0.0.1.
 * Options: `port` (0 = any), `token` (at least 16 characters), `aiReady` (a downloaded, running local model, so
 * chat works), `allowedRoots` (folders imports/exports may use), `origins` (browser origins allowed),
 * `chatDelayMs` (pause between scripted chat events), `modelStepMs` (delay per step of the fake model download),
 * `dataDir` (default: a fresh temp folder that `close()` deletes).
 */
export async function startMockServer(options = {}) {
  const token = options.token ?? "test-token-test-token";
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "dax-mock-"));
  const ownsDataDir = !options.dataDir;
  mkdirSync(dataDir, { recursive: true });
  const chatDelay = options.chatDelayMs ?? 40;
  const logs = [];
  const log = createLogger((line) => logs.push(line), "info");

  // Fakes for the parts that need the outside world; they live across stop()/start() like a user's machine does.
  const fakeModel = createFakeLocalModel(Boolean(options.aiReady), options.modelStepMs ?? 150);
  const cli = { "cli-claude": "missing", "cli-codex": "missing", "cli-gemini": "missing" };
  const base = createProviderRegistry({ localReady: async () => fakeModel.state.running });
  const registry = {
    async list(env) {
      // The real registry for everything it knows; CLI sign-in states come from the test (setCli).
      return (await base.list(env)).map((p) => {
        if (!p.kind.startsWith("cli-")) return p;
        const name = p.kind.slice(4);
        const st = cli[p.kind];
        return st === "in"
          ? { kind: p.kind, available: true, detail: "Signed in", signedIn: true }
          : st === "out"
            ? {
                kind: p.kind,
                available: false,
                detail: `Not signed in. Run ${name} once to sign in.`,
                signedIn: false,
              }
            : { kind: p.kind, available: false, detail: `${name} is not installed` };
      });
    },
  };

  let running;
  let port = options.port ?? 0;
  const origins = options.origins ?? DEFAULT_ORIGINS;
  const launch = async () => {
    running = await startServer({
      dataDir,
      port,
      token,
      origins,
      ...(options.allowedRoots ? { allowRoots: options.allowedRoots } : {}),
      agentRunner: createScriptedAssistant(registry, chatDelay),
      providers: registry,
      localModel: fakeModel.controller,
      logger: log,
    });
    port = running.info.port;
  };
  await launch();

  const api = engineApi(`http://127.0.0.1:${port}`, token);
  const readJson = (name) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    token,
    get port() {
      return port;
    },
    dataDir,
    /** Lines the server logged (it never logs tokens or keys). */
    logs,
    /** The REST helper for this server: `state()`, `project()`, `history()`, `command()`, ... */
    api,
    /** The open project, read through the real API. */
    project: api.project,
    /** The history list, read through the real API. */
    history: api.history,
    /** Run a command exactly as the UI would (`POST /api/command`). */
    command: api.command,
    /** Import files exactly as the UI does (`POST /api/import`), then wait for the proxies to finish. */
    async importPaths(paths) {
      const r = await api.importPaths(paths);
      await api.settled();
      return r;
    },
    /** API keys as stored on disk (`secrets.json`); tests use it to check that a key was saved but never returned. */
    get secrets() {
      return readJson("secrets.json").apiKeys;
    },
    /** Settings as stored on disk (`settings.json`). */
    get settings() {
      return readJson("settings.json");
    },
    /** Set whether a CLI (`cli-claude`, ...) is `missing`, `out` (not signed in) or `in`. */
    setCli(kind, status) {
      cli[kind] = status;
    },
    /** Simulate a lost connection: shut the server down (the project is saved, like a real exit). */
    async stop() {
      await running.close();
    },
    /** Come back on the same port, token and data folder after {@link stop}; the last project reopens. */
    async start() {
      await launch();
    },
    /** Stop everything and delete the temp data dir. */
    async close() {
      await running.close();
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
    token: arg("token", "dev-token-dev-token"),
    aiReady: process.argv.includes("--ai"),
  });
  const video = arg("video");
  if (video) await server.importPaths([video]);
  console.log(
    JSON.stringify({ url: server.url, token: server.token, port: server.port, version: "mock" }),
  );
  const stop = () => server.close().then(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
