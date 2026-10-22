// Optional Blender executes only application-owned templates; FFmpeg encodes frames with permitted codecs.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  ffmpegBin,
  isPathInside,
  listEncoders,
  type MotionRenderer,
  MotionRequestSchema,
  rankEncoders,
  withEncoderFallback,
} from "@dax/core";

const exec = promisify(execFile);

async function findBlender(): Promise<{ path: string; version: string } | undefined> {
  let foundButUnavailable = false;
  const candidates = [process.env.DAX_BLENDER_BIN, "blender"];
  if (process.platform === "win32") {
    const parent = join(process.env.ProgramFiles ?? "C:\\Program Files", "Blender Foundation");
    for (const name of (await readdir(parent).catch(() => []))
      .filter((value) => /^Blender [45]\./.test(value))
      .sort()
      .reverse())
      candidates.push(join(parent, name, "blender.exe"));
  }
  for (const path of candidates) {
    if (!path) continue;
    try {
      const { stdout } = await exec(path, ["--version"], { timeout: 5000, windowsHide: true });
      const version = /Blender ([45]\.\d+\.\d+)/.exec(stdout)?.[1];
      if (version) return { path, version };
    } catch {
      if (existsSync(path)) foundButUnavailable = true;
      /* Optional program may be absent or blocked by system policy. */
    }
  }
  if (foundButUnavailable)
    throw new Error(
      "Blender was found but could not start. Check operating-system application-control approval and required runtime dependencies, then use Check Blender again.",
    );
  return undefined;
}

function runBlender(
  binary: string,
  args: string[],
  signal: AbortSignal | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((done, fail) => {
    if (signal?.aborted) {
      fail(new Error("Cancelled"));
      return;
    }
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    let pending = "";
    const abort = () => child.kill("SIGKILL");
    const timer = setTimeout(abort, 30 * 60_000);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = (lines.pop() ?? "").slice(-8000);
      for (const line of lines) onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-3000);
    });
    child.once("error", fail);
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) fail(new Error("Cancelled"));
      else if (code !== 0) fail(new Error(`Blender render failed (${code}): ${tail.slice(-800)}`));
      else done();
    });
  });
}

/** Create a bounded CPU renderer using an optional user-installed Blender 4.x/5.x. */
export function createBlenderRenderer(dataDir: string): MotionRenderer {
  const root = resolve(dataDir, "renders");
  return {
    async status() {
      let found: Awaited<ReturnType<typeof findBlender>>;
      try {
        found = await findBlender();
      } catch (error) {
        return {
          available: false,
          detail: error instanceof Error ? error.message : "Blender could not start.",
        };
      }
      return found
        ? {
            available: true,
            version: found.version,
            detail: `Blender ${found.version} is available`,
          }
        : {
            available: false,
            detail:
              "Install Blender 4.5 LTS or newer from blender.org, then restart the editor. For a portable install set DAX_BLENDER_BIN to blender.exe.",
          };
    },
    async render(raw, options) {
      const request = MotionRequestSchema.parse(raw);
      const found = await findBlender();
      if (!found)
        throw new Error(
          "Blender is not installed or cannot run. Open Motion setup for instructions.",
        );
      const source = fileURLToPath(
        new URL("../../core/assets/blender/template.py", import.meta.url),
      );
      const bundled = fileURLToPath(new URL("../assets/blender/template.py", import.meta.url));
      const script = existsSync(bundled) ? bundled : source;
      if (!existsSync(script))
        throw new Error("The application motion template is missing. Repair the installation.");
      await mkdir(root, { recursive: true, mode: 0o700 });
      const folder = await mkdtemp(join(root, "blender-"));
      if (!isPathInside(root, folder)) throw new Error("Invalid render workspace");
      const frames = join(folder, "frames");
      const output = join(folder, "animation.mp4");
      await mkdir(frames);
      const params = join(folder, "parameters.json");
      await writeFile(params, JSON.stringify({ ...request, frames }));
      try {
        await runBlender(
          found.path,
          [
            "--background",
            "--factory-startup",
            "--disable-autoexec",
            "--threads",
            "2",
            "--python",
            script,
            "--",
            params,
          ],
          options.signal,
          (line) => {
            const progress = /DAX_FRAME (\d+)\/(\d+)/.exec(line);
            if (progress) options.onProgress?.((Number(progress[1]) / Number(progress[2])) * 0.9);
          },
        );
        const candidates = rankEncoders(await listEncoders()).filter(
          (encoder) => encoder !== "libx264" && encoder !== "libx265",
        );
        await withEncoderFallback(
          async (encoder) => {
            await exec(
              ffmpegBin(),
              [
                "-y",
                "-v",
                "error",
                "-framerate",
                String(request.fps),
                "-i",
                join(frames, "frame_%04d.png"),
                "-c:v",
                encoder,
                "-threads",
                "2",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                output,
              ],
              {
                ...(options.signal ? { signal: options.signal } : {}),
                timeout: 120_000,
                windowsHide: true,
                maxBuffer: 1024 * 1024,
              },
            );
          },
          { candidates, ...(options.signal ? { signal: options.signal } : {}) },
        );
        options.onProgress?.(1);
        if (!isPathInside(folder, frames)) throw new Error("Invalid frame workspace");
        await rm(frames, { recursive: true, force: true });
        return output;
      } catch (error) {
        if (isPathInside(root, folder)) await rm(folder, { recursive: true, force: true });
        throw error;
      }
    },
  };
}
