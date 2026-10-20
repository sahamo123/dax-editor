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
  return {
    api: engineApi(info.url, info.token),
    async stop() {
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
  assert.equal(local.running, true, JSON.stringify(local));
  assert.equal(local.modelId, "qwen3.5-2b-q4km");
  console.log("Offline model running; engine startup needed no external fetch.");
  const imported = await engine.api.importPaths([source]);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  await engine.api.settled(90_000);
  const format = await engine.api.command("set_format", { width: 640, height: 360, fps: 30 });
  assert.equal(format.ok, true, JSON.stringify(format));
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
  assert.ok(Math.abs(Number(metadata.format.duration) - 4) < 0.1);
  const record = JSON.parse(await readFile(join(dataDir, "run/llama-server.pid.json"), "utf8"));
  await engine.stop();
  assert.throws(() => process.kill(record.pid, 0), "Inference process survived shutdown");
  engine = await start();
  assert.ok(
    (await engine.api.project()).timeline.overlays.some((o) => /Offline Ready/i.test(o.text)),
    "Saved edit missing after restart",
  );
  assert.equal((await engine.api.call("GET", "/api/local-model")).body.running, true);
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
