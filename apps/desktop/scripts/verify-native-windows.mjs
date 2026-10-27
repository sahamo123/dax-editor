// Opt-in installed Tauri acceptance on an isolated Windows CI machine; no policy changes or production debug settings.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

if (
  process.platform !== "win32" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.DAX_NATIVE_SMOKE !== "1"
)
  throw new Error("Native acceptance runs only in the explicitly enabled isolated Windows CI job.");
const output = resolve("artifacts/native-windows-acceptance");
await mkdir(output, { recursive: true });
const install = resolve(process.env.RUNNER_TEMP, "dax-native-installed");
const work = join(homedir(), `dax-native-acceptance-${process.pid}`);
await mkdir(work, { recursive: true });
const safeEnv = {};
for (const name of [
  "SystemRoot",
  "WINDIR",
  "PATH",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramData",
  "COMSPEC",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
])
  if (process.env[name]) safeEnv[name] = process.env[name];
async function find(directory, names) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && names.some((name) => entry.name.toLowerCase() === name)) return path;
    if (entry.isDirectory()) {
      const found = await find(path, names);
      if (found) return found;
    }
  }
  return null;
}
async function run(binary, args, timeout = 180_000, env = safeEnv) {
  await new Promise((done, fail) => {
    const child = spawn(binary, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (chunk) => {
      errors = (errors + chunk.toString()).slice(-3000);
    });
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error("Native installation operation timed out"));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? done() : fail(new Error(`Native test operation exited ${code}: ${errors}`));
    });
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((done) => server.close(done));
  return address.port;
}
let app, browser, page, connection, result;
let phase = "initialization";
function mark(value) {
  phase = value;
  console.log(`Native acceptance: ${phase}`);
}
async function request(path, body) {
  const response = await fetch(`${connection.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.ok, true, data.error ?? "Native engine request failed");
  if (data.ok === false) throw new Error(data.error);
  return data;
}
async function command(name, args = {}) {
  return request("/api/command", { name, args });
}
async function nativeDialog(title, path, action) {
  assert.ok(Number.isSafeInteger(app.pid));
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-File",
      resolve("apps/desktop/scripts/native-file-dialog.ps1"),
      "-DialogProcessId",
      String(app.pid),
      "-Title",
      title,
      "-Path",
      path,
      "-Action",
      action,
    ],
    30_000,
    { ...safeEnv, GITHUB_ACTIONS: "true", DAX_NATIVE_SMOKE: "1" },
  );
}
async function launch(binary, phase) {
  mark(`launch ${phase}`);
  const port = await freePort();
  app = spawn(binary, [], {
    env: {
      ...safeEnv,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
      WEBVIEW2_USER_DATA_FOLDER: join(work, `webview-${phase}`),
    },
    windowsHide: true,
    stdio: "ignore",
  });
  app.on("error", () => {});
  await expect
    .poll(
      async () => {
        if (app.exitCode !== null || app.signalCode !== null)
          throw new Error(`Installed application exited ${app.exitCode ?? app.signalCode}`);
        try {
          return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 180_000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  mark(`attach ${phase}`);
  await expect
    .poll(() => browser.contexts().flatMap((context) => context.pages()).length)
    .toBeGreaterThan(0);
  page = browser.contexts().flatMap((context) => context.pages())[0];
  assert.ok(page);
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__, undefined, { timeout: 30_000 });
  connection = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("get_server_info"));
  assert.equal(new URL(connection.url).hostname, "127.0.0.1");
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Import", exact: true }),
  ).toBeEnabled({ timeout: 60_000 });
  return page;
}
async function closeNative() {
  mark("graceful shutdown");
  const pid = app.pid;
  assert.ok(Number.isSafeInteger(pid));
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `if (-not (Get-Process -Id ${pid}).CloseMainWindow()) { throw 'Could not request native window close' }`,
    ],
    { env: safeEnv, windowsHide: true, stdio: "ignore" },
  );
  await expect.poll(() => app.exitCode, { timeout: 30_000 }).not.toBeNull();
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${connection.url}/api/health`, {
            headers: { Authorization: `Bearer ${connection.token}` },
          });
          return false;
        } catch {
          return true;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  browser = undefined;
  page = undefined;
}
try {
  const installerDirectory = resolve(process.env.DAX_NATIVE_INSTALLER_DIR);
  const installer = await find(installerDirectory, ["dax editor_0.0.1_x64-setup.exe"]);
  assert.ok(installer, "Expected the fixed candidate installer");
  assert.equal(existsSync(install), false, "Clean-install target must not already exist");
  mark("clean install");
  await run(installer, ["/S", `/D=${install}`]);
  const binary = await find(install, ["dax-editor.exe"]);
  assert.ok(binary, "Installed executable missing");
  const binarySha256 = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  const ffmpeg = await find(install, ["dax-ffmpeg.exe", "dax-ffmpeg-x86_64-pc-windows-msvc.exe"]);
  assert.ok(ffmpeg);
  const ffprobe = await find(install, [
    "dax-ffprobe.exe",
    "dax-ffprobe-x86_64-pc-windows-msvc.exe",
  ]);
  assert.ok(ffprobe);
  const source = join(work, "source.mp4");
  mark("generate footage");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x180:r=12:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "mpeg4",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  await launch(binary, "initial");
  mark("manual editing");
  await page.setViewportSize({ width: 1024, height: 700 });
  await request("/api/project/new", { name: "Native Windows acceptance" });
  await page.getByRole("banner").getByRole("button", { name: "Import", exact: true }).click();
  await nativeDialog("Import video", source, "Open");
  await expect
    .poll(async () => Object.keys((await request("/api/state")).project.assets).length, {
      timeout: 60_000,
    })
    .toBe(1);
  await command("set_format", { width: 320, height: 180, fps: 12 });
  const preview = page.getByTestId("video-a");
  await expect
    .poll(() => preview.evaluate((video) => video.readyState), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  await page.getByTestId("preview").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => preview.evaluate((video) => video.currentTime)).toBeGreaterThan(0.1);
  await page.getByTestId("preview").getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  const showTools = page.getByRole("button", { name: "Show side panel", exact: true });
  if (await showTools.isVisible()) await showTools.click();
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Title at playhead").fill("Native title check");
  await page.getByRole("button", { name: "Add title", exact: true }).click();
  await expect
    .poll(async () => (await request("/api/state")).project.timeline.overlays.length)
    .toBe(1);
  await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await request("/api/state")).project.timeline.overlays.length)
    .toBe(0);
  await page.getByRole("banner").getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await request("/api/state")).project.timeline.overlays.length)
    .toBe(1);
  const closeTools = page.getByRole("button", { name: "Close tools panel" });
  if (await closeTools.isVisible()) await closeTools.click();
  await page.getByRole("button", { name: "Review effects", exact: true }).click();
  mark("review playback");
  const review = page.getByLabel("Complete edit review", { exact: true });
  await expect(review).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => review.evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(2);
  await review.evaluate((video) => video.play());
  await expect.poll(() => review.evaluate((video) => video.currentTime)).toBeGreaterThan(0.1);
  await page.screenshot({ path: join(output, "native-review.png") });
  await page.getByRole("button", { name: "Back to editing" }).click();
  const exported = join(work, "native-export.mp4");
  mark("export");
  const previousJobs = new Set((await request("/api/state")).jobs.map((job) => job.id));
  await page.getByRole("banner").getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export video", exact: true });
  await exportDialog.getByRole("button", { name: "Browse...", exact: true }).click();
  await nativeDialog("Export video", exported, "Save");
  await expect(exportDialog.getByRole("textbox")).toHaveValue(exported);
  await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await request("/api/state")).jobs.find(
          (job) => job.kind === "export" && !previousJobs.has(job.id),
        )?.status,
      { timeout: 120_000 },
    )
    .toBe("done");
  const streams = JSON.parse(
    execFileSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", exported], {
      env: safeEnv,
      encoding: "utf8",
      windowsHide: true,
    }),
  ).streams;
  assert.ok(streams.some((stream) => stream.codec_type === "video"));
  assert.ok(streams.some((stream) => stream.codec_type === "audio"));
  const projectPath = join(work, "native-project.dax.json");
  await request("/api/project/save", { path: projectPath });
  const saved = (await request("/api/state")).project;
  const appState = join(process.env.APPDATA, "org.daxeditor.desktop", "server", "state.json");
  assert.ok(existsSync(appState));
  await closeNative();
  mark("same-version reinstall");
  await run(installer, ["/S", `/D=${install}`]);
  await launch(binary, "reinstalled");
  assert.deepEqual((await request("/api/state")).project, saved);
  await closeNative();
  const uninstaller = await find(install, ["uninstall.exe"]);
  assert.ok(uninstaller);
  mark("uninstall preserves project");
  await run(uninstaller, ["/S"]);
  assert.ok(existsSync(projectPath));
  assert.ok(existsSync(appState));
  result = {
    status: "PASS",
    sourceRun: 40505507400,
    nativeWebView: true,
    cleanInstall: true,
    manualTitleUndoRedo: true,
    reviewPlayback: true,
    audioVideoExport: true,
    gracefulShutdown: true,
    sameVersionReinstallPersistence: true,
    uninstallPreservesProject: true,
    nativeDialogsVerified: true,
    interactivePreviewPlayback: true,
    ownerLaptopPolicyVerified: false,
    binarySha256,
  };
} catch (error) {
  result = { status: "FAIL", phase, error: error.message, sourceRun: 40505507400 };
  console.error(`Native acceptance failed during ${phase}: ${error.message}`);
  // CI-only OS diagnostics omit command lines, environment and application data (which contain secrets).
  try {
    const diagnostics = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='Stop'; Get-Process | Where-Object {$_.ProcessName -match 'dax|msedgewebview2'} | Select-Object Id,ProcessName,SessionId,Responding,MainWindowHandle | ConvertTo-Json; Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1001;StartTime=(Get-Date).AddMinutes(-8)} -ErrorAction SilentlyContinue | Where-Object {$_.Message -match 'dax-editor|WebView2'} | Select-Object Id,Message | ConvertTo-Json",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    console.error(diagnostics);
    result = { ...result, diagnostics };
  } catch {
    console.error("Native OS diagnostics unavailable");
  }
  if (page) await page.screenshot({ path: join(output, "native-failure.png") }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app && app.exitCode === null && app.signalCode === null && Number.isSafeInteger(app.pid)) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      result = { ...result, cleanup: "Process already exited or tree termination failed" };
    }
  }
  await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2));
}
console.log(`Native Windows acceptance: ${result.status}`);
if (result.status !== "PASS") process.exitCode = 1;
