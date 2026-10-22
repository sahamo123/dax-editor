// Tests for the sidecar preparation helpers and for the pinned lock file (no network).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  archiveExtractor,
  findForbiddenFfmpegFlags,
  looksLikeFfmpeg,
  parseHostTriple,
  sha256File,
  sidecarFileName,
  verifySha256,
} from "./sidecars-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("Windows archive extraction uses native bsdtar independently of PATH", () => {
  assert.equal(archiveExtractor("win32", "D:\\Windows"), "D:\\Windows\\System32\\tar.exe");
  assert.equal(archiveExtractor("win32"), "C:\\Windows\\System32\\tar.exe");
  assert.equal(archiveExtractor("darwin"), "tar");
  assert.equal(archiveExtractor("linux"), "tar");
});
const lock = JSON.parse(readFileSync(join(here, "..", "sidecars.lock.json"), "utf8"));

test("sidecar file names carry the target triple and .exe only on Windows", () => {
  assert.equal(
    sidecarFileName("dax-node", "aarch64-apple-darwin"),
    "dax-node-aarch64-apple-darwin",
  );
  assert.equal(
    sidecarFileName("dax-node", "x86_64-pc-windows-msvc"),
    "dax-node-x86_64-pc-windows-msvc.exe",
  );
});

test("host triple is read from rustc -Vv output", () => {
  const sample = "rustc 1.97.0\nbinary: rustc\nhost: x86_64-unknown-linux-gnu\nrelease: 1.97.0\n";
  assert.equal(parseHostTriple(sample), "x86_64-unknown-linux-gnu");
  assert.throws(() => parseHostTriple("nothing here"));
});

test("an LGPL FFmpeg configuration passes the guard", () => {
  const lgpl = Buffer.from(
    "configuration: --prefix=/x --enable-version3 --disable-libx264 --disable-libx265 --enable-libopenh264 --disable-gpl",
  );
  assert.deepEqual(findForbiddenFfmpegFlags(lgpl), []);
  assert.equal(looksLikeFfmpeg(lgpl), true);
});

test("GPL and non-free FFmpeg configurations are caught", () => {
  const gpl = Buffer.from(
    "configuration: --prefix=/x --enable-gpl --enable-libx264 --enable-nonfree",
  );
  assert.deepEqual(findForbiddenFfmpegFlags(gpl), [
    "--enable-gpl",
    "--enable-nonfree",
    "--enable-libx264",
  ]);
});

test("a file that is not FFmpeg is rejected by looksLikeFfmpeg", () => {
  assert.equal(looksLikeFfmpeg(Buffer.from("#!/bin/sh\necho hi\n")), false);
});

test("checksum verification accepts the right hash and rejects a wrong one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dax-sidecar-test-"));
  try {
    const file = join(dir, "blob");
    writeFileSync(file, "hello");
    const hash = await sha256File(file);
    assert.equal(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    await verifySha256(file, hash.toUpperCase());
    await assert.rejects(verifySha256(file, "0".repeat(64)), /checksum mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lock file: every pinned asset has a SHA-256 and consistent names", () => {
  const sha = /^[0-9a-f]{64}$/;
  for (const [triple, asset] of Object.entries(lock.node.assets)) {
    assert.match(asset.sha256, sha, `node ${triple}`);
    assert.ok(asset.file.includes(lock.node.version), `node ${triple} file matches the version`);
    assert.ok(asset.inner.startsWith(asset.file.replace(/\.(tar\.xz|tar\.gz|zip)$/, "")));
  }
  for (const [triple, asset] of Object.entries(lock.ffmpeg.assets)) {
    assert.match(asset.sha256, sha, `ffmpeg ${triple}`);
    // Only LGPL builds may be pinned.
    assert.ok(asset.file.includes("-lgpl-"), `ffmpeg ${triple} must be an lgpl build`);
    assert.ok(!asset.file.includes("-gpl-"), `ffmpeg ${triple} must not be a gpl build`);
  }
  assert.ok(lock.node.baseUrl.startsWith("https://"));
  assert.ok(lock.ffmpeg.baseUrl.startsWith("https://"));
});
