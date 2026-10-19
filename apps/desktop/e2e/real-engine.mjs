// Starts the REAL engine as a separate process, exactly the way the desktop shell's sidecar does:
// `dax-engine --data-dir <tmp> --origin <app origin> --allow-root <dir>`, token in `DAX_SERVER_TOKEN`, one JSON
// line on stdout. No provider is configured, so the assistant is the engine's default "not set up" behaviour
// unless a test saves settings that point at a model.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { engineApi } from "./engine-api.mjs";

/** Absolute path of the built engine executable (`@dax/engine`'s `dist/cli.js`). */
function engineCli() {
  return join(dirname(fileURLToPath(import.meta.resolve("@dax/engine"))), "cli.js");
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
    env: { ...process.env, ...env, DAX_SERVER_TOKEN: token },
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
    /** Stop the engine (SIGTERM, then SIGKILL after 10 s) and remove its data folder. */
    async close() {
      child.kill("SIGTERM");
      const killer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(killer);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
