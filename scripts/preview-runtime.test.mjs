// An unavailable bundled runtime must never cause an implicit switch to another executable.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { previewRuntime } from "./preview-runtime.mjs";

test("development preview defaults to the packaged runtimes", () => {
  assert.deepEqual(previewRuntime("binaries"), {
    DAX_FFMPEG: join("binaries", "dax-ffmpeg-x86_64-pc-windows-msvc.exe"),
    DAX_FFPROBE: join("binaries", "dax-ffprobe-x86_64-pc-windows-msvc.exe"),
  });
});
test("system tools require an explicit development selection", () => {
  assert.deepEqual(previewRuntime("binaries", true), {
    DAX_FFMPEG: "ffmpeg",
    DAX_FFPROBE: "ffprobe",
  });
});
