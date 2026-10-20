// Starts the REAL engine as a separate process, exactly the way the desktop shell's sidecar does:
// `dax-engine --data-dir <tmp> --origin <app origin> --allow-root <dir>`, token in `DAX_SERVER_TOKEN`, one JSON
// line on stdout. No provider is configured, so the assistant is the engine's default "not set up" behaviour
// unless a test saves settings that point at a model.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegBin, ffprobeBin } from "@dax/core";
import { engineApi } from "./engine-api.mjs";

/** Absolute path of the built engine executable (`@dax/engine`'s `dist/cli.js`). */
function engineCli() {
  return join(dirname(fileURLToPath(import.meta.resolve("@dax/engine"))), "cli.js");
}

// Preserve media tools while isolating the child's CLI search path and home from the host account.
function mediaBinary(file) {
  if (isAbsolute(file)) return file;
  for (const dir of (process.env.PATH ?? process.env.Path ?? "").split(delimiter)) {
    const candidate = join(
      dir,
      process.platform === "win32" && !file.endsWith(".exe") ? `${file}.exe` : file,
    );
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Required test media tool is missing: ${file}`);
}

/**
 * Launch `dax-engine` and resolve once it has printed its startup line.
 * Options: `origin` (the browser origin of the app), `allowRoots` (folders imports/exports may use),
 * `env` (extra environment, for example `DAX_SKILLS_DIR`).
 * The returned object has `url`, `token`, `dataDir`, `api` (see engine-api.mjs), `logs` (its stderr lines)
 * and `close()`, which stops the process and deletes its temp data folder (and only that folder).
 */
export async function startRealEngine({ origin, allowRoots = [], env = {} }) {
  const dataDir = mkdtempSync(join(tmpdir(), "dax-engine-e2e-"));
  const token = randomBytes(24).toString("base64url");
  const args = [engineCli(), "--data-dir", dataDir, "--origin", origin];
  for (const root of allowRoots) args.push("--allow-root", root);
  // stdin stays open (a pipe): the engine exits when its parent's stdin closes, as it does under the desktop shell.
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      PATH: join(dataDir, "empty-path"),
      HOME: dataDir,
      USERPROFILE: dataDir,
      APPDATA: join(dataDir, "appdata"),
      LOCALAPPDATA: join(dataDir, "local-appdata"),
      DAX_CLAUDE_BIN: join(dataDir, "missing-cli.exe"),
      DAX_CODEX_BIN: join(dataDir, "missing-codex.exe"),
      DAX_FFMPEG: mediaBinary(ffmpegBin()),
      DAX_FFPROBE: mediaBinary(ffprobeBin()),
      ...env,
      DAX_SERVER_TOKEN: token,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const logs = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => logs.push(...String(d).split("\n").filter(Boolean)));

  const exited = new Promise((resolve) => child.once("exit", resolve));
  const info = await new Promise((resolve, reject) => {
    let out = "";
    const fail = (why) =>
      reject(new Error(`dax-engine did not start (${why}): ${logs.join(" | ")}`));
    const timer = setTimeout(() => fail("timeout"), 30_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      const line = out.split("\n")[0];
      if (!out.includes("\n")) return;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line));
      } catch {
        fail(`bad startup line ${line}`);
      }
    });
    child.once("exit", (code) => fail(`exit ${code}`));
    child.once("error", (e) => fail(String(e)));
  }).catch((err) => {
    child.kill("SIGKILL");
    rmSync(dataDir, { recursive: true, force: true });
    throw err;
  });

  return {
    url: info.url,
    token: info.token,
    port: info.port,
    dataDir,
    logs,
    api: engineApi(info.url, info.token),
    /** Close the parent pipe for graceful shutdown on every OS; force only after 10 s. */
    async close() {
      child.stdin.end();
      const killer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(killer);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
