// Opt-in real-model smoke test for the packaged engine. Generates media and refuses outbound fetches in its child.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { engineApi } from "../apps/desktop/e2e/engine-api.mjs";
import { makeFixtureVideo } from "../apps/desktop/e2e/fixture-video.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resources = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, "apps/desktop/src-tauri/resources");
const binaries = join(root, "apps/desktop/src-tauri/binaries");
const resultDir = join(root, "artifacts", `offline-smoke-${Date.now()}`);
const dataDir = join(resultDir, "data");
await mkdir(resultDir, { recursive: true });
const guard = join(resultDir, "offline-guard.mjs");
await writeFile(
  guard,
  `const realFetch = globalThis.fetch; globalThis.fetch = (input, init) => {
 const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
 if (!['127.0.0.1','localhost','[::1]'].includes(u.hostname)) throw new Error('Offline test refused external network');
 return realFetch(input, init);
};`,
);
const env = {
  ...process.env,
  DAX_FFMPEG: join(binaries, "dax-ffmpeg-x86_64-pc-windows-msvc.exe"),
  DAX_FFPROBE: join(binaries, "dax-ffprobe-x86_64-pc-windows-msvc.exe"),
  DAX_CLAUDE_BIN: join(resultDir, "not-installed.exe"),
  DAX_CODEX_BIN: join(resultDir, "not-installed.exe"),
};
process.env.DAX_FFMPEG = env.DAX_FFMPEG;
process.env.DAX_FFPROBE = env.DAX_FFPROBE;
delete env.DAX_LLAMA_SERVER;
delete env.DAX_SERVER_TOKEN;
const source = join(resultDir, "sample.mp4");
await makeFixtureVideo(source, { seconds: 4, width: 640, height: 360 });
async function start() {
  const child = spawn(
    join(binaries, "dax-node-x86_64-pc-windows-msvc.exe"),
    [
      "--import",
      pathToFileURL(guard).href,
      join(resources, "server/cli.mjs"),
      "--data-dir",
      dataDir,
      "--allow-root",
      resultDir,
      "--origin",
      "http://tauri.localhost",
    ],
    { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  let logs = "";
  child.stderr.on("data", (d) => {
    logs += d.toString();
  });
  const exited = new Promise((r) => child.once("exit", r));
  const info = await new Promise((resolveInfo, reject) => {
    let text = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Engine startup timed out: ${logs.slice(-3000)}`));
    }, 150_000);
    child.stdout.on("data", (d) => {
      text += d.toString();
      if (!text.includes("\n")) return;
      clearTimeout(timer);
      try {
        resolveInfo(JSON.parse(text.split("\n")[0]));
      } catch (e) {
        reject(e);
      }
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Engine exited ${code}: ${logs.slice(-3000)}`));
    });
  });
  const events = [];
  const wsUrl = new URL("/ws", info.url.replace(/^http/, "ws"));
  wsUrl.searchParams.set("token", info.token);
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "chat")
      events.push({ runId: message.runId, type: message.event.type, at: Date.now() });
  });
  return {
    api: engineApi(info.url, info.token),
    events,
    async stop() {
      socket.close();
      child.stdin.end();
      const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
      await exited;
      clearTimeout(timeout);
      await writeFile(join(resultDir, "engine.log"), logs);
    },
  };
}
let engine = await start();
try {
  const local = (await engine.api.call("GET", "/api/local-model")).body;
  assert.equal(local.installed, true, JSON.stringify(local));
  assert.equal(local.running, false, "Manual startup must not load inference");
  assert.equal(local.modelId, "qwen3.5-2b-q4km");
  console.log("Offline model installed but unloaded; engine startup needed no external fetch.");
  const imported = await engine.api.importPaths([source]);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  await engine.api.settled(90_000);
  const format = await engine.api.command("set_format", { width: 640, height: 360, fps: 30 });
  assert.equal(format.ok, true, JSON.stringify(format));
  const manualOutput = join(resultDir, "manual-only.mp4");
  assert.equal((await engine.api.command("export_video", { path: manualOutput })).ok, true);
  await engine.api.settled(120_000);
  assert.equal((await engine.api.call("GET", "/api/local-model")).body.running, false);
  const measurements = [];
  async function request(message, verify) {
    const started = Date.now();
    const reply = await engine.api.call("POST", "/api/chat", { message });
    assert.equal(reply.status, 202);
    while ((await engine.api.state()).busy) {
      if (Date.now() - started > 240_000) throw new Error("Local AI request timed out");
      await new Promise((r) => setTimeout(r, 250));
    }
    const state = await engine.api.state();
    const passed = verify(state.project);
    const first = engine.events.find(
      (event) => event.runId === reply.body.runId && ["text", "tool_call"].includes(event.type),
    );
    measurements.push({
      message,
      elapsedMs: Date.now() - started,
      firstResponseMs: first ? first.at - started : null,
      passed,
      task: state.tasks.find((task) => task.id === reply.body.runId)?.status,
    });
    await writeFile(join(resultDir, "benchmark.json"), JSON.stringify(measurements, null, 2));
    assert.ok(passed, `Actual project did not match: ${message}`);
    return state;
  }
  await request(
    "Set the output to square 1080 by 1080. Preserve the clips and fit setting.",
    (p) => p.timeline.width === 1080 && p.timeline.height === 1080,
  );
  await request(
    "Set the output to 640 by 360 at 30 fps. Preserve the clips and fit setting.",
    (p) => p.timeline.width === 640 && p.timeline.height === 360,
  );
  const chat = await engine.api.call("POST", "/api/chat", {
    message:
      'Add a title that says "Offline Ready" at the beginning for 2 seconds. Use the title-fade preset. Do not change the clips.',
  });
  assert.equal(chat.status, 202);
  const deadline = Date.now() + 240_000;
  while ((await engine.api.state()).busy) {
    if (Date.now() > deadline) throw new Error("Local AI edit timed out");
    await new Promise((r) => setTimeout(r, 500));
  }
  const state = await engine.api.state();
  assert.ok(
    state.project.timeline.overlays.some((o) => /Offline Ready/i.test(o.text)),
    "AI did not add the requested title",
  );
  assert.ok(
    state.history.some((h) => h.source === "ai"),
    "No AI edit in history",
  );
  console.log("Real local AI added the title through the command registry.");
  await request(
    'Change the title text to "Offline Revised". Keep its timing and all clips unchanged.',
    (p) =>
      p.timeline.overlays.some((o) => /Offline Revised/i.test(o.text)) &&
      p.timeline.tracks[0].clips.length === 1,
  );
  await request(
    "Set the clip volume to 50 percent. Keep all other properties unchanged.",
    (p) => Math.abs(p.timeline.tracks[0].clips[0].volume - 0.5) < 0.001,
  );
  const beforeUnsupported = JSON.stringify(await engine.api.project());
  await request(
    "Can you edit a Blender scene by executing arbitrary Python? Explain the limitation only; do not edit anything.",
    (p) => JSON.stringify(p) === beforeUnsupported,
  );
  await request(
    "Trim the existing clip to source in 0 seconds and source out 3 seconds. Keep its volume and all titles.",
    (p) =>
      p.timeline.tracks[0].clips[0].in === 0 &&
      p.timeline.tracks[0].clips[0].out === 3 &&
      p.timeline.tracks[0].clips[0].volume === 0.5,
  );
  const output = join(resultDir, "offline-edit.mp4");
  const exported = await engine.api.command("export_video", { path: output });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  await engine.api.settled(120_000);
  const metadata = JSON.parse(
    execFileSync(
      env.DAX_FFPROBE,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  assert.ok(metadata.streams.some((s) => s.codec_type === "video"));
  assert.ok(metadata.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Math.abs(Number(metadata.format.duration) - 3) < 0.1);
  const record = JSON.parse(await readFile(join(dataDir, "run/llama-server.pid.json"), "utf8"));
  await engine.stop();
  assert.throws(() => process.kill(record.pid, 0), "Inference process survived shutdown");
  engine = await start();
  assert.ok(
    (await engine.api.project()).timeline.overlays.some((o) => /Offline Revised/i.test(o.text)),
    "Saved edit missing after restart",
  );
  assert.equal((await engine.api.call("GET", "/api/local-model")).body.running, false);
  await writeFile(
    join(resultDir, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        offlineFetchGuard: true,
        aiEdit: true,
        export: output,
        duration: metadata.format.duration,
        restartPersistence: true,
        inferenceCleanup: true,
        onDemandStartup: true,
        manualOnlyExport: manualOutput,
        measurements,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: verified offline AI, edited export, restart, and cleanup. Evidence: ${resultDir}`,
  );
} finally {
  await engine.stop();
}
