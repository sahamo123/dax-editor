// Finding and opening the project file a command works on. Projects are `.dax.json` files managed by core's Session,
// which also keeps the undo history beside the file, so undo works across separate CLI invocations.

import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { emptyProject, Session } from "@dax/core";
import { CliError, type CliIo, EXIT } from "./io.js";

/** Default file name when no project is given and none exists in the current folder. */
export const DEFAULT_PROJECT_FILE = "project.dax.json";

/**
 * Decide which project file to use: the explicit `--project` value, else `DAX_PROJECT`, else the only
 * `*.dax.json` in the current folder, else `project.dax.json` there (which may not exist yet).
 * @throws CliError (usage) when the folder holds several projects and none was chosen.
 */
export function resolveProjectFile(io: CliIo, explicit?: string): string {
  const chosen = explicit ?? (io.env.DAX_PROJECT || undefined);
  if (chosen) return resolve(io.cwd, chosen);
  let found: string[] = [];
  try {
    found = readdirSync(io.cwd)
      .filter((f) => f.endsWith(".dax.json"))
      .sort();
  } catch {
    // An unreadable folder just means there is nothing to discover.
  }
  if (found.length > 1) {
    throw new CliError(
      `Several projects here (${found.join(", ")}). Choose one with --project <file> or set DAX_PROJECT.`,
      EXIT.usage,
    );
  }
  return resolve(io.cwd, found[0] ?? DEFAULT_PROJECT_FILE);
}

/** Project name taken from a file name: `my-talk.dax.json` becomes `my-talk`. */
export function projectNameFromFile(file: string): string {
  return (
    basename(file)
      .replace(/\.dax\.json$/, "")
      .replace(/\.json$/, "") || "Untitled"
  );
}

/** A short reason for a failed open, without a stack trace or a wall of schema issues. */
function reason(err: unknown): string {
  const issues = (err as { issues?: Array<{ path: Array<string | number>; message: string }> })
    .issues;
  if (Array.isArray(issues) && issues[0]) {
    return `not a valid dax project (${issues[0].path.join(".") || "root"}: ${issues[0].message})`;
  }
  if (err instanceof SyntaxError) return "not valid JSON";
  return err instanceof Error ? err.message : String(err);
}

/**
 * Open the project file in a Session.
 *
 * With `create`, a missing file is created as an empty project (named after the file) so the first
 * `dax import` just works. Without it, a missing file yields a scratch in-memory session that is never
 * written, so reading commands never leave files behind.
 * @throws CliError (project exit code) when the file exists but cannot be read or is not a valid project.
 */
export async function openProject(file: string, create: boolean): Promise<Session> {
  try {
    if (!create && !existsSync(file)) return new Session(emptyProject(projectNameFromFile(file)));
    return await Session.open(file, projectNameFromFile(file));
  } catch (err) {
    throw new CliError(`Cannot open project ${file}: ${reason(err)}`, EXIT.project);
  }
}
