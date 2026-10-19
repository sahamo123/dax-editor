// Path safety: allowed-root containment that also defeats symlinks, and the strict id format used in URLs and cache folders.
// Everything that turns client-supplied text into a filesystem path goes through here.

import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { isPathInside } from "@dax/core";

/** Thrown when a path is not absolute, not inside the allowed folders, or escapes them through a symlink. The HTTP layer answers 403. */
export class PathNotAllowedError extends Error {}

/** Asset ids and cache keys in URLs must match this: letters, digits, `_` and `-` only, so no separator or `..` can appear. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** True when `id` is safe to use as one path segment (see {@link SAFE_ID}). */
export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

/** Resolve symlinks of the deepest part of `path` that exists, then re-attach the rest. Lets us check a file that is about to be created. */
async function realpathOfNearest(path: string): Promise<string> {
  const missing: string[] = [];
  let current = path;
  for (;;) {
    try {
      const real = await realpath(current);
      return resolve(real, ...missing.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

/**
 * Check that `input` is an absolute path inside one of `roots` and return its normalised form.
 * `..` segments are collapsed before the check, and symlinks are resolved so a link inside an
 * allowed folder cannot point outside it. Works for paths that do not exist yet (exports, saves).
 * Throws {@link PathNotAllowedError}, whose message is safe to show to the user.
 */
export async function resolveInsideRoots(input: string, roots: readonly string[]): Promise<string> {
  if (input.includes("\0")) throw new PathNotAllowedError("Path contains a NUL byte");
  if (!isAbsolute(input)) throw new PathNotAllowedError(`Path must be absolute: ${input}`);
  const abs = resolve(input);
  if (!roots.some((r) => isPathInside(resolve(r), abs))) {
    throw new PathNotAllowedError(`Path is outside the allowed folders: ${abs}`);
  }
  const real = await realpathOfNearest(abs);
  const realRoots = await Promise.all(roots.map((r) => realpathOfNearest(resolve(r))));
  if (!realRoots.some((r) => isPathInside(r, real))) {
    throw new PathNotAllowedError(`Path resolves outside the allowed folders: ${abs}`);
  }
  return abs;
}
