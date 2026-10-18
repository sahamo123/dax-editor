// Resumable, verified file download: HTTP Range resume, SHA-256 check, atomic rename, disk-space check.
// Used for speech models and the whisper-cli runtime. Uses the global fetch, injectable for tests.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { SttError } from "./errors.js";

/** Progress report from {@link downloadFile}. */
export interface DownloadProgress {
  /** Bytes on disk so far, including bytes kept from an earlier attempt. */
  receivedBytes: number;
  /** Total size in bytes when the server (or the caller) told us; otherwise 0. */
  totalBytes: number;
  /** `receivedBytes / totalBytes` in 0..1, or 0 when the total is unknown. */
  fraction: number;
  /** True while the finished file is being checked against its SHA-256. */
  verifying: boolean;
}

/** Options for {@link downloadFile}. */
export interface DownloadOptions {
  /** Expected SHA-256 of the whole file, hex. When set, a mismatch deletes the download and throws `hash-mismatch`. */
  sha256?: string;
  /** Expected size in bytes; used for the disk check and progress when the server omits a length. */
  expectedBytes?: number;
  /** Receives progress about every 250 ms and once at the end. */
  onProgress?: (p: DownloadProgress) => void;
  /** Abort to stop; the partial file is kept so the next call resumes. */
  signal?: AbortSignal;
  /** Replacement for the global `fetch` (tests, proxies). */
  fetchImpl?: typeof fetch;
  /** Extra attempts after a dropped connection, each resuming where the last stopped. Default 2. */
  retries?: number;
  /** Extra request headers, such as `User-Agent`. */
  headers?: Record<string, string>;
  /** Free space to leave untouched, in bytes. Default 64 MiB. */
  diskMarginBytes?: number;
}

/** SHA-256 of a file, streamed (constant memory), lower-case hex. */
export async function sha256File(path: string, upToBytes?: number): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(
    path,
    upToBytes === undefined ? {} : { start: 0, end: upToBytes - 1 },
  );
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Download `url` to `dest`, resuming a previous partial download when there is one.
 *
 * Bytes go to `dest + ".part"` and the file is renamed to `dest` only after the size and (when given)
 * SHA-256 check out, so `dest` is either absent or complete. Resume sends `Range: bytes=N-`; a server
 * that ignores it (status 200) makes the download restart from zero; a stale part file that the server
 * rejects (416) is verified, and thrown away when it does not hash correctly. If `dest` already exists
 * and matches `sha256`, nothing is downloaded. Before writing, free space on the target volume must
 * cover the remaining bytes plus a margin, otherwise a `disk-space` error is thrown.
 *
 * Throws {@link SttError} with code `download-failed` (HTTP error or connection lost after all
 * retries), `hash-mismatch`, `disk-space` or `cancelled`. Resolves with `dest`.
 */
export async function downloadFile(
  url: string,
  dest: string,
  opts: DownloadOptions = {},
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const part = `${dest}.part`;
  await mkdir(dirname(dest), { recursive: true });

  if (opts.sha256 && (await exists(dest))) {
    if ((await sha256File(dest)) === opts.sha256.toLowerCase()) {
      const size = (await stat(dest)).size;
      opts.onProgress?.({ receivedBytes: size, totalBytes: size, fraction: 1, verifying: false });
      return dest;
    }
    await rm(dest, { force: true });
  }

  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await attemptDownload(url, dest, part, doFetch, opts);
      return dest;
    } catch (err) {
      if (err instanceof SttError && err.code !== "download-failed") throw err;
      lastError = err;
      if (opts.signal?.aborted)
        throw new SttError("cancelled", "Download was cancelled; call again to resume.");
    }
  }
  throw lastError instanceof SttError
    ? lastError
    : new SttError(
        "download-failed",
        `Download of ${url} failed: ${(lastError as Error)?.message}`,
        {
          cause: lastError,
        },
      );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function attemptDownload(
  url: string,
  dest: string,
  part: string,
  doFetch: typeof fetch,
  opts: DownloadOptions,
): Promise<void> {
  let have = (await exists(part)) ? (await stat(part)).size : 0;
  // "identity" keeps Content-Length equal to the bytes on disk (no transparent gzip).
  const headers: Record<string, string> = { "Accept-Encoding": "identity", ...opts.headers };
  if (have > 0) headers.Range = `bytes=${have}-`;

  let res: Response;
  try {
    res = await doFetch(url, { headers, signal: opts.signal, redirect: "follow" });
  } catch (err) {
    if (opts.signal?.aborted)
      throw new SttError("cancelled", "Download was cancelled; call again to resume.");
    throw new SttError("download-failed", `Could not reach ${url}: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (res.status === 416) {
    // The server says our offset is past the end: the part file is either complete or garbage.
    await res.body?.cancel();
    if (opts.sha256 && (await sha256File(part)) === opts.sha256.toLowerCase()) {
      await rename(part, dest);
      return;
    }
    await rm(part, { force: true });
    throw new SttError(
      "download-failed",
      "Resume offset was rejected; the partial file was discarded. Retrying from the start.",
    );
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new SttError(
      "download-failed",
      `Download of ${url} failed with HTTP ${res.status} ${res.statusText}.`.trim(),
    );
  }

  let append = res.status === 206 && have > 0;
  if (res.status === 206) {
    const m = /bytes\s+(\d+)-/.exec(res.headers.get("content-range") ?? "");
    if (m && Number(m[1]) !== have) append = false; // misaligned resume: do not trust it
  }
  if (!append) have = 0;

  const bodyLength = Number(res.headers.get("content-length") ?? 0);
  const total = (append ? have : 0) + bodyLength || (opts.expectedBytes ?? 0);
  await checkDisk(
    dirname(dest),
    Math.max(0, (total || opts.expectedBytes || 0) - have),
    opts.diskMarginBytes ?? 64 * 1024 * 1024,
  );

  const fh = await open(part, append ? "a" : "w");
  let received = have;
  let lastReport = 0;
  const report = (verifying = false, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    opts.onProgress?.({
      receivedBytes: received,
      totalBytes: total,
      fraction: total ? Math.min(1, received / total) : 0,
      verifying,
    });
  };
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await fh.write(value);
      received += value.byteLength;
      report();
    }
  } catch (err) {
    if (opts.signal?.aborted)
      throw new SttError("cancelled", "Download was cancelled; call again to resume.");
    throw new SttError(
      "download-failed",
      `Connection lost after ${received} bytes: ${(err as Error).message}`,
      { cause: err },
    );
  } finally {
    await fh.close();
  }

  if (total && received !== total) {
    throw new SttError(
      "download-failed",
      `Download ended early: got ${received} of ${total} bytes.`,
    );
  }
  if (opts.sha256) {
    report(true, true);
    const actual = await sha256File(part);
    if (actual !== opts.sha256.toLowerCase()) {
      await rm(part, { force: true });
      throw new SttError(
        "hash-mismatch",
        `Downloaded file from ${url} does not match the expected SHA-256 (expected ${opts.sha256.toLowerCase()}, got ${actual}). It was deleted; do not install it.`,
      );
    }
  }
  await rename(part, dest);
  opts.onProgress?.({
    receivedBytes: received,
    totalBytes: total || received,
    fraction: 1,
    verifying: false,
  });
}

/** Throw `disk-space` unless the volume holding `dir` has `needBytes + marginBytes` free. */
async function checkDisk(dir: string, needBytes: number, marginBytes: number): Promise<void> {
  if (needBytes <= 0) return;
  let free: number;
  try {
    const s = await statfs(dir);
    free = Number(s.bavail) * Number(s.bsize);
  } catch {
    return; // unknown file system: let the write fail naturally instead of blocking
  }
  if (free < needBytes + marginBytes) {
    const mb = (n: number) => `${Math.ceil(n / 1048576)} MB`;
    throw new SttError(
      "disk-space",
      `Not enough free disk space in ${dir}: need ${mb(needBytes)} plus ${mb(marginBytes)} spare, have ${mb(free)}.`,
    );
  }
}
