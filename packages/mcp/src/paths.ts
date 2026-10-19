// Path allow-list with symlink resolution, applied before a command runs. Core's own check compares resolved
// path strings only, so a symlink inside an allowed folder could still point outside it; this closes that gap.

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isPathInside } from "@dax/core";

/** Real path of `p`, or of its closest existing ancestor with the missing tail re-attached (for files not written yet). */
function realpathLoose(p: string): string {
  const abs = resolve(p);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  if (parent === abs) return abs;
  return resolve(realpathLoose(parent), abs.slice(parent.length + 1));
}

/**
 * Check that `path` lies inside one of `roots` after resolving symlinks on both sides.
 * Returns an error message fit to show a model, or undefined when the path is allowed.
 * With no `roots` everything is allowed (the caller chose an unrestricted server).
 */
export function checkInsideRoots(
  path: string,
  roots: readonly string[] | undefined,
): string | undefined {
  if (!roots) return undefined;
  const real = realpathLoose(path);
  const ok = roots.some((root) => isPathInside(realpathLoose(root), real));
  return ok ? undefined : `Path is outside the allowed folders: ${resolve(path)}`;
}

/** Commands whose `path` argument names a file on disk and so must pass {@link checkInsideRoots}. */
export const PATH_ARGUMENT_COMMANDS: ReadonlySet<string> = new Set([
  "import_media",
  "export_video",
]);
