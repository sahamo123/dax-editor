// Finds a command-line agent's executable: on PATH first, then in the places installers put it.
// Desktop apps often start with a minimal PATH (for example launched from the macOS Dock), so the common folders matter.
// This module only checks that an executable file exists. It never opens anything that could hold a login.

import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Where `findExecutable` looks and how. All fields are optional so production code can use the defaults. */
export interface LocateOptions {
  /** Environment to read `PATH` (and Windows variables) from. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Default `process.platform`. */
  platform?: NodeJS.Platform;
  /** Home folder used to build the common install folders. Default the OS home folder. */
  homeDir?: string;
  /** Folders searched after `PATH`. Default `commonInstallDirs`. Pass `[]` to search `PATH` only. */
  commonDirs?: readonly string[];
}

/**
 * Folders where the official installers and common package managers put command-line tools, in the order we try them.
 * Only folders, never files: we look for an executable inside them and nothing else.
 */
export function commonInstallDirs(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === "win32") {
    const appData = env.APPDATA ?? join(home, "AppData", "Roaming");
    const localAppData = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      join(home, ".local", "bin"),
      join(appData, "npm"),
      join(localAppData, "Programs", "claude"),
      join(localAppData, "Microsoft", "WinGet", "Links"),
    ];
  }
  const dirs = [
    join(home, ".local", "bin"),
    join(home, ".claude", "local"),
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    "/usr/local/bin",
    "/usr/bin",
  ];
  if (platform === "darwin") dirs.push("/opt/homebrew/bin");
  else dirs.push("/home/linuxbrew/.linuxbrew/bin", "/snap/bin");
  return dirs;
}

/** True when `file` is a regular file the current user may run (on Windows: has an executable extension). */
export function isExecutableFile(
  file: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (platform === "win32") return /\.(exe|com)$/i.test(file);
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find `name` (for example `"claude"`) and return its absolute path, or undefined when it is not installed.
 * `PATH` entries come first so the user's own choice wins; the common install folders follow.
 * On Windows only `.exe` and `.com` files are accepted, because Node cannot safely spawn `.cmd` shims without a shell.
 */
export function findExecutable(name: string, options: LocateOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const pathValue = env.PATH ?? env.Path ?? "";
  const dirs = [
    ...pathValue.split(delimiter).filter((d) => d.length > 0),
    ...(options.commonDirs ?? commonInstallDirs(platform, home, env)),
  ];
  const fileNames = platform === "win32" ? [`${name}.exe`, `${name}.com`] : [name];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    for (const fileName of fileNames) {
      const candidate = join(dir, fileName);
      if (isExecutableFile(candidate, platform)) return candidate;
    }
  }
  return undefined;
}
