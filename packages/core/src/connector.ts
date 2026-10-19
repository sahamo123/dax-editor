// Where media comes from and goes to: the Connector interface and the local-disk implementation. Cloud providers implement the same interface.

import { copyFile, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * True when `child` is `root` itself or lives somewhere beneath it.
 * Uses `relative()` rather than string prefixes so it is correct for both
 * `/` and `\` separators and does not confuse `/a/bc` with `/a/b`.
 */
export function isPathInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The real location of `path`: symlinks resolved for the deepest part that exists, with the missing tail re-attached.
 * Lets a file that does not exist yet (an export target) be checked against the folders it would land in.
 */
export async function realpathOfNearest(path: string): Promise<string> {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      return resolve(await realpath(current), ...missing.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

/** A file or folder as listed by a {@link Connector}. */
export interface RemoteFile {
  /** Provider-specific identifier, passed back to `download`. */
  ref: string;
  name: string;
  isDirectory: boolean;
  /** Size in bytes; absent for folders or when the provider does not say. */
  size?: number;
  /** ISO-8601 last-modified time. */
  modified?: string;
  mimeType?: string;
}

/** Optional controls for downloads and uploads. */
export interface TransferOptions {
  /** Called with bytes transferred so far and the total, if known. */
  onProgress?: (done: number, total?: number) => void;
  /** Abort the transfer; partial data may be kept so a later call can resume. */
  signal?: AbortSignal;
}

/**
 * A place media can come from or go to: the local disk today; Google Drive,
 * Dropbox, S3, rclone remotes and so on later. File bytes move directly
 * between the provider and local disk, never through a third-party relay.
 */
export interface Connector {
  /** Stable identifier, e.g. `local` or `gdrive`. */
  readonly id: string;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** List a folder; omit `folderRef` for the root. */
  list(folderRef?: string): Promise<RemoteFile[]>;
  /** Describe a single file or folder. */
  stat(ref: string): Promise<RemoteFile>;
  /** Bring a file onto local disk and return its local path. Implementations should resume partial downloads. */
  download(ref: string, destDir: string, opts?: TransferOptions): Promise<string>;
  /** Send a local file to the provider and return its new ref. Optional: some sources are read-only. */
  upload?(localPath: string, folderRef?: string, opts?: TransferOptions): Promise<string>;
}

/** The local filesystem, optionally restricted to a set of allowed root folders. */
export class LocalConnector implements Connector {
  readonly id = "local";
  readonly name = "This computer";
  private readonly roots?: string[];

  constructor(allowedRoots?: string[]) {
    this.roots = allowedRoots?.map((r) => resolve(r));
  }

  private check(path: string): string {
    const abs = resolve(path);
    if (this.roots && !this.roots.some((root) => isPathInside(root, abs))) {
      throw new Error(`Path is outside the allowed folders: ${abs}`);
    }
    return abs;
  }

  async list(folderRef = "."): Promise<RemoteFile[]> {
    const dir = this.check(folderRef);
    const entries = await readdir(dir, { withFileTypes: true });
    return Promise.all(
      entries.map(async (e) => {
        const full = join(dir, e.name);
        const s = await stat(full);
        return {
          ref: full,
          name: e.name,
          isDirectory: e.isDirectory(),
          size: s.isDirectory() ? undefined : s.size,
          modified: s.mtime.toISOString(),
        };
      }),
    );
  }

  /** Describe a single file or folder on the local disk. Applies the allowed-folders check. */
  async stat(ref: string): Promise<RemoteFile> {
    const abs = this.check(ref);
    const s = await stat(abs);
    return {
      ref: abs,
      name: basename(abs),
      isDirectory: s.isDirectory(),
      size: s.isDirectory() ? undefined : s.size,
      modified: s.mtime.toISOString(),
    };
  }

  /** Local files are already on disk, so "download" copies only when asked to place them elsewhere. */
  async download(ref: string, destDir: string): Promise<string> {
    const src = this.check(ref);
    await mkdir(destDir, { recursive: true });
    const dest = join(destDir, basename(src));
    await copyFile(src, dest);
    return dest;
  }
}
