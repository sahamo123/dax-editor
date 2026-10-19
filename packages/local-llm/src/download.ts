/**
 * Resumable, verified file download over HTTP(S).
 *
 * Data is written to `<dest>.part` (with a small `<dest>.part.json` sidecar that records which
 * remote file the bytes belong to). A later call resumes with an HTTP `Range` request. The file
 * only appears at `dest` through an atomic rename after size and SHA-256 checks pass, so a
 * half-written model can never be mistaken for a good one. Knows nothing about models or llama.cpp.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DownloadAbortedError,
  HashMismatchError,
  HttpError,
  InsufficientDiskSpaceError,
} from "./errors.js";

/** A snapshot of a running download, passed to `onProgress`. Sizes are bytes. */
export interface DownloadProgress {
  /** `downloading` while bytes arrive; `verifying` while the final hash is computed. */
  phase: "downloading" | "verifying";
  /** Bytes of the file that are on disk so far (including a resumed part). */
  receivedBytes: number;
  /** Total size of the file when the server told us, otherwise `undefined`. */
  totalBytes: number | undefined;
  /** Bytes that were already on disk when this call started (0 for a fresh download). */
  resumedFromBytes: number;
  /** Recent transfer rate in bytes per second (0 until measurable). */
  bytesPerSecond: number;
}

/** Options for {@link downloadFile}. */
export interface DownloadOptions {
  /** Called at most about every `progressIntervalMs` and once at the end of each phase. */
  onProgress?: (progress: DownloadProgress) => void;
  /** Aborts the transfer. The partial file is kept so a later call can resume. */
  signal?: AbortSignal;
  /** Expected lower-case or upper-case hex SHA-256 of the complete file. Strongly recommended. */
  sha256?: string;
  /** Expected size in bytes; used for the disk check before the server has answered. */
  expectedSize?: number;
  /** Extra request headers (for example an `Authorization` token). Never logged. */
  headers?: Record<string, string>;
  /** Fetch implementation, for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Extra free space to require on top of the bytes still to download. Default 64 MiB. */
  diskMarginBytes?: number;
  /** How many times to resume after a dropped connection before giving up. Default 4. */
  maxRetries?: number;
  /** Base delay in ms between retries (doubles each time). Default 500. */
  retryDelayMs?: number;
  /** Minimum ms between progress callbacks. Default 100. */
  progressIntervalMs?: number;
  /** If `dest` already exists and matches `sha256`, return immediately. Default `true`. */
  skipIfValid?: boolean;
}

/** What {@link downloadFile} returns. */
export interface DownloadResult {
  /** Absolute or relative path that was passed as `dest` (the verified file). */
  path: string;
  /** Final size in bytes. */
  sizeBytes: number;
  /** SHA-256 of the file as lower-case hex (always computed). */
  sha256: string;
  /** Bytes that came from a previous partial download (0 when started from scratch). */
  resumedFromBytes: number;
  /** True if `dest` already existed and was valid, so nothing was downloaded. */
  alreadyPresent: boolean;
}

interface PartMeta {
  url: string;
  etag?: string;
  lastModified?: string;
  totalBytes?: number;
}

/** Compute the SHA-256 of a file as lower-case hex, reading it in a stream. */
export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function exists(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size;
  } catch {
    return undefined;
  }
}

async function readMeta(path: string): Promise<PartMeta | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PartMeta;
  } catch {
    return undefined;
  }
}

/** Free bytes available to this process on the volume that holds `directory`. */
export async function freeDiskBytes(directory: string): Promise<number> {
  const s = await statfs(directory);
  return Number(s.bavail) * Number(s.bsize);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Parse the total length out of a `Content-Range: bytes 10-99/100` header. */
function totalFromContentRange(header: string | null): number | undefined {
  const m = header?.match(/\/(\d+)\s*$/);
  return m?.[1] ? Number(m[1]) : undefined;
}

/**
 * Download `url` to `dest`, resuming a previous partial transfer when possible.
 *
 * - Writes `dest.part` and renames it to `dest` only after the size and (if given) SHA-256 match.
 * - Sends `Range: bytes=N-` (with `If-Range` when an ETag is known) when `dest.part` exists. A
 *   server that ignores the range (HTTP 200) makes the download restart from zero.
 * - Checks free disk space for the bytes still missing plus `diskMarginBytes` before writing.
 * - Retries dropped connections by resuming, up to `maxRetries`; HTTP 4xx errors are not retried.
 * - On a hash or size mismatch the partial data is deleted (it may be corrupt) and
 *   {@link HashMismatchError} is thrown; the caller can simply call again.
 *
 * @throws DownloadAbortedError when `signal` aborts (the `.part` file is kept).
 * @throws InsufficientDiskSpaceError when the volume is too full.
 * @throws HashMismatchError when the finished file's SHA-256 differs from `options.sha256`.
 * @throws HttpError on a non-success status or when retries are exhausted.
 */
export async function downloadFile(
  url: string,
  dest: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const doFetch = options.fetch ?? fetch;
  const expectedHash = options.sha256?.toLowerCase();
  const partPath = `${dest}.part`;
  const metaPath = `${dest}.part.json`;
  await mkdir(dirname(dest), { recursive: true });

  if (options.skipIfValid !== false && expectedHash) {
    const size = await exists(dest);
    if (size !== undefined && (await sha256File(dest, options.signal)) === expectedHash) {
      return {
        path: dest,
        sizeBytes: size,
        sha256: expectedHash,
        resumedFromBytes: 0,
        alreadyPresent: true,
      };
    }
  }

  const maxRetries = options.maxRetries ?? 4;
  const interval = options.progressIntervalMs ?? 100;
  let attempt = 0;
  let resumedFromBytes = 0;
  let firstAttempt = true;

  // Retry loop: every pass re-reads how much is on disk, so a dropped connection simply resumes.
  for (;;) {
    if (options.signal?.aborted) throw new DownloadAbortedError(url);
    let existing = (await exists(partPath)) ?? 0;
    const meta = await readMeta(metaPath);
    if (existing > 0 && meta && meta.url !== url) {
      // The part file belongs to another URL; its bytes are useless here.
      await rm(partPath, { force: true });
      existing = 0;
    }
    if (firstAttempt) resumedFromBytes = existing;
    firstAttempt = false;

    const headers: Record<string, string> = {
      "Accept-Encoding": "identity", // a compressed body would break byte offsets
      ...options.headers,
    };
    if (existing > 0) {
      headers.Range = `bytes=${existing}-`;
      const validator = meta?.etag ?? meta?.lastModified;
      if (validator) headers["If-Range"] = validator;
    }

    try {
      const response = await doFetch(url, { headers, signal: options.signal, redirect: "follow" });

      if (response.status === 416) {
        // Range not satisfiable: either the part is already complete, or it is garbage.
        const total = totalFromContentRange(response.headers.get("content-range"));
        await response.body?.cancel();
        if (total !== undefined && total === existing) {
          return await finish();
        }
        await rm(partPath, { force: true });
        await rm(metaPath, { force: true });
        continue;
      }
      if (response.status !== 200 && response.status !== 206) {
        await response.body?.cancel();
        throw new HttpError(`GET ${url} failed with HTTP ${response.status}`, response.status);
      }

      let offset = existing;
      if (response.status === 200 && existing > 0) {
        // Server ignored our Range (or the file changed): start over so we never splice two files.
        offset = 0;
      }
      const contentLength = Number(response.headers.get("content-length") ?? Number.NaN);
      const total =
        response.status === 206
          ? totalFromContentRange(response.headers.get("content-range"))
          : Number.isFinite(contentLength)
            ? contentLength
            : undefined;
      const totalBytes = total ?? options.expectedSize;

      // Disk check: bytes still to write, plus a margin for the OS and the next file.
      if (totalBytes !== undefined) {
        const need =
          Math.max(0, totalBytes - offset) + (options.diskMarginBytes ?? 64 * 1024 * 1024);
        const have = await freeDiskBytes(dirname(dest));
        if (have < need) {
          await response.body?.cancel();
          throw new InsufficientDiskSpaceError(dirname(dest), need, have);
        }
      }

      await writeFile(
        metaPath,
        JSON.stringify({
          url,
          etag: response.headers.get("etag") ?? undefined,
          lastModified: response.headers.get("last-modified") ?? undefined,
          totalBytes,
        } satisfies PartMeta),
      );

      const file = await open(partPath, offset === 0 ? "w" : "r+");
      let received = offset;
      let lastEmit = 0;
      let rateWindowStart = Date.now();
      let rateWindowBytes = 0;
      let rate = 0;
      const emit = (force: boolean) => {
        const now = Date.now();
        if (!force && now - lastEmit < interval) return;
        lastEmit = now;
        options.onProgress?.({
          phase: "downloading",
          receivedBytes: received,
          totalBytes,
          resumedFromBytes,
          bytesPerSecond: rate,
        });
      };
      try {
        if (!response.body) throw new HttpError(`GET ${url} returned no body`, response.status);
        emit(true);
        // Write at an explicit position so a 206 appends exactly where the part file ends.
        let position = offset;
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          await file.write(chunk, 0, chunk.length, position);
          position += chunk.length;
          received += chunk.length;
          rateWindowBytes += chunk.length;
          const now = Date.now();
          if (now - rateWindowStart >= 1000) {
            rate = (rateWindowBytes * 1000) / (now - rateWindowStart);
            rateWindowStart = now;
            rateWindowBytes = 0;
          }
          emit(false);
        }
        await file.truncate(position);
        await file.sync();
      } finally {
        await file.close();
      }
      emit(true);
      if (totalBytes !== undefined && received < totalBytes) {
        // The connection ended early without an error: treat as a drop and resume.
        throw new HttpError(`GET ${url} ended after ${received} of ${totalBytes} bytes`);
      }
      return await finish();
    } catch (error) {
      if (options.signal?.aborted) throw new DownloadAbortedError(url);
      if (error instanceof HttpError && error.status !== undefined && error.status < 500)
        throw error;
      if (
        error instanceof InsufficientDiskSpaceError ||
        error instanceof HashMismatchError ||
        error instanceof DownloadAbortedError
      ) {
        throw error;
      }
      attempt += 1;
      if (attempt > maxRetries) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new HttpError(`Download of ${url} failed after ${maxRetries} retries: ${reason}`);
      }
      await sleep((options.retryDelayMs ?? 500) * 2 ** (attempt - 1), options.signal);
    }
  }

  /** Verify the part file and move it into place. */
  async function finish(): Promise<DownloadResult> {
    const size = (await exists(partPath)) ?? 0;
    const expectedSize = options.expectedSize;
    options.onProgress?.({
      phase: "verifying",
      receivedBytes: size,
      totalBytes: size,
      resumedFromBytes,
      bytesPerSecond: 0,
    });
    const actual = await sha256File(partPath, options.signal);
    if (expectedHash && actual !== expectedHash) {
      // Corrupt or tampered bytes: never keep them, or every resume would fail the same way.
      await rm(partPath, { force: true });
      await rm(metaPath, { force: true });
      throw new HashMismatchError(url, expectedHash, actual);
    }
    if (expectedSize !== undefined && size !== expectedSize) {
      await rm(partPath, { force: true });
      await rm(metaPath, { force: true });
      throw new HttpError(`Downloaded ${size} bytes from ${url}, expected ${expectedSize}`);
    }
    await rename(partPath, dest);
    await rm(metaPath, { force: true });
    return { path: dest, sizeBytes: size, sha256: actual, resumedFromBytes, alreadyPresent: false };
  }
}
