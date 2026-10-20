// Where speech models and the whisper-cli runtime live on disk, and how to find an executable on PATH.
// Pure path logic plus a PATH scan; it never downloads or starts processes.

import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Per-user folder that holds everything dax-editor downloads for speech-to-text.
 *
 * Resolution order: the `DAX_DATA_DIR` environment variable, then the platform
 * convention (`%APPDATA%\dax-editor`, `~/Library/Application Support/dax-editor`,
 * `$XDG_DATA_HOME/dax-editor` or `~/.local/share/dax-editor`). Nothing is created here.
 */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DAX_DATA_DIR) return env.DAX_DATA_DIR;
  if (process.platform === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "dax-editor");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "dax-editor");
  }
  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "dax-editor");
}

/** Folder for downloaded ggml speech models under `dataDir`. */
export function modelsDir(dataDir: string): string {
  return join(dataDir, "speech", "models");
}

/** Folder for downloaded whisper.cpp runtimes under `dataDir`; one sub-folder per version and platform. */
export function runtimeDir(dataDir: string): string {
  return join(dataDir, "speech", "bin");
}

/** True when `path` exists and the current user may execute (or, on Windows, read) it. */
export async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find `name` on `PATH` (honouring `PATHEXT` on Windows). Returns the absolute
 * path of the first match, or `undefined`. Never throws.
 */
export async function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)]
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}
