// Tests that the stand-in engine server honours the launch contract the Tauri shell relies on:
// ServerInfo line, token and Origin checks, Range requests, exit on stdin end and on SIGTERM.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "shell-placeholder", "dax-server-standin.mjs");

/** Start the stand-in and resolve with its ServerInfo and the child process. */
function start(extraArgs = [], env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dax-standin-"));
  const child = spawn(
    process.execPath,
    [entry, "--port", "0", "--data-dir", dir, "--origin", "tauri://localhost", ...extraArgs],
    {
      env: { ...process.env, DAX_SERVER_TOKEN: "test-token", ...env },
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  return new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const line = buffer.split("\n")[0];
      if (buffer.includes("\n")) resolve({ info: JSON.parse(line), child, dir });
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`exited early with ${code}`)));
  });
}

const exited = (child) =>
  new Promise((resolve) => child.once("exit", (code, sig) => resolve({ code, sig })));

test("prints a ServerInfo line using the token from the environment, and exits on stdin end", async () => {
  const { info, child, dir } = await start();
  try {
    assert.equal(info.token, "test-token");
    assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(info.port, Number(new URL(info.url).port));
    const done = exited(child);
    child.stdin.end();
    assert.equal((await done).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exits on SIGTERM (graceful on POSIX, forced on Windows)", async () => {
  const { child, dir } = await start();
  try {
    const done = exited(child);
    child.kill("SIGTERM");
    const result = await done;
    if (process.platform === "win32") assert.equal(result.sig, "SIGTERM");
    else assert.equal(result.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health needs the token, a loopback Host and an allowed Origin", async () => {
  const { info, child, dir } = await start();
  try {
    const auth = { Authorization: "Bearer test-token" };
    assert.equal((await fetch(`${info.url}/api/health`)).status, 401);
    assert.equal((await fetch(`${info.url}/api/health`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${info.url}/api/health?token=test-token`)).status, 200);
    const bad = await fetch(`${info.url}/api/health`, {
      headers: { ...auth, Origin: "https://evil.example" },
    });
    assert.equal(bad.status, 403);
    const good = await fetch(`${info.url}/api/health`, {
      headers: { ...auth, Origin: "tauri://localhost" },
    });
    assert.equal(good.headers.get("access-control-allow-origin"), "tauri://localhost");
  } finally {
    child.kill("SIGTERM");
    await exited(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serves files with Range support, only inside the allowed roots", async () => {
  const root = mkdtempSync(join(tmpdir(), "dax-standin-root-"));
  const file = join(root, "clip.mp4");
  writeFileSync(file, "0123456789");
  const { info, child, dir } = await start(["--allow-root", root]);
  try {
    const url = (p) => `${info.url}/api/dev/file?path=${encodeURIComponent(p)}&token=test-token`;
    const ranged = await fetch(url(file), { headers: { Range: "bytes=2-5" } });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await ranged.text(), "2345");
    const outside = await fetch(url("/etc/hostname"));
    assert.ok([403, 404].includes(outside.status));
  } finally {
    child.kill("SIGTERM");
    await exited(child);
    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
