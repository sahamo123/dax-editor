// Pure helpers for scripts/prepare-sidecars.mjs: target-triple handling, checksum verification and
// the LGPL guard on FFmpeg binaries. No network and no global state, so they are unit-testable.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { win32 } from "node:path";

/** Select the host archive extractor. Windows uses its ZIP-capable bsdtar, never Git's GNU tar that treats drive letters as remote hosts. */
export function archiveExtractor(platform, systemRoot = "C:\\Windows") {
  return platform === "win32" ? win32.join(systemRoot, "System32", "tar.exe") : "tar";
}

/** FFmpeg configure flags that make a build GPL or non-redistributable; none may appear. */
const FORBIDDEN_FFMPEG_FLAGS = [
  "--enable-gpl",
  "--enable-nonfree",
  "--enable-libx264",
  "--enable-libx265",
  "--enable-libxvid",
  "--enable-libfdk-aac",
];

/** Whether a target triple is a Windows one (executables get an `.exe` suffix). */
export function isWindowsTriple(triple) {
  return triple.includes("-windows-");
}

/** Name of a Tauri `externalBin` file for `base` on `triple`, e.g. `dax-node-x86_64-pc-windows-msvc.exe`. */
export function sidecarFileName(base, triple) {
  return `${base}-${triple}${isWindowsTriple(triple) ? ".exe" : ""}`;
}

/** Extract the `host:` triple from `rustc -Vv` output (works on Rust versions without `--print host-tuple`). */
export function parseHostTriple(rustcVerbose) {
  const match = /^host:\s*(\S+)\s*$/m.exec(rustcVerbose);
  if (!match) throw new Error("could not find a `host:` line in `rustc -Vv` output");
  return match[1];
}

/** SHA-256 of a file as lower-case hex, streamed so large binaries do not fill memory. */
export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Throw unless the file's SHA-256 equals `expected` (case-insensitive). */
export async function verifySha256(path, expected) {
  const actual = await sha256File(path);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`checksum mismatch for ${path}\n  expected ${expected}\n  actual   ${actual}`);
  }
}

/**
 * Return the forbidden configure flags found in an FFmpeg binary (empty array means LGPL-clean).
 * FFmpeg embeds its `configuration:` line as text, so a byte search works across architectures
 * without being able to run the binary (needed when cross-building for another CPU).
 */
export function findForbiddenFfmpegFlags(binary) {
  // Anchor on a space or quote before the flag so `--disable-gpl` can never match `--enable-gpl`.
  return FORBIDDEN_FFMPEG_FLAGS.filter((flag) => binary.includes(` ${flag}`));
}

/** Whether the buffer looks like an FFmpeg build at all (guards against checking the wrong file). */
export function looksLikeFfmpeg(binary) {
  return binary.includes("--prefix=") || binary.includes("libavcodec");
}
