import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

/**
 * A Connector is a place media can come from or go to: the local disk today;
 * Google Drive, Dropbox, S3, rclone remotes and so on later. File bytes move
 * directly between the provider and local disk, never through a third-party relay.
 */
export interface RemoteFile {
  /** Provider-specific identifier, passed back to `download`. */
  ref: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  mimeType?: string;
}

export interface TransferOptions {
  /** Called with bytes transferred so far and the total, if known. */
  onProgress?: (done: number, total?: number) => void;
  signal?: AbortSignal;
}

export interface Connector {
  readonly id: string;
  readonly name: string;
  /** List a folder; omit `folderRef` for the root. */
  list(folderRef?: string): Promise<RemoteFile[]>;
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
    if (this.roots && !this.roots.some((r) => abs === r || abs.startsWith(r + "/") || abs.startsWith(r + "\\"))) {
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
