// Development-only explicit runtime selection; packaged applications keep their verified bundled binaries.
import { join } from "node:path";

/** Select bundled executables by default, or already-installed PATH tools only after an explicit development flag. */
export function previewRuntime(binaries, useSystem = false) {
  return {
    DAX_FFMPEG: useSystem ? "ffmpeg" : join(binaries, "dax-ffmpeg-x86_64-pc-windows-msvc.exe"),
    DAX_FFPROBE: useSystem ? "ffprobe" : join(binaries, "dax-ffprobe-x86_64-pc-windows-msvc.exe"),
  };
}
