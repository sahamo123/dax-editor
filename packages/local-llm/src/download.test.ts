import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DownloadProgress, downloadFile, sha256File } from "./download.js";
import {
  DownloadAbortedError,
  HashMismatchError,
  HttpError,
  InsufficientDiskSpaceError,
} from "./errors.js";
import { startFileServer, type TestFileServer } from "./test-helpers/file-server.js";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
// Large enough to span many 64 KiB chunks, small enough to stay fast.
const content = randomBytes(1_500_000);
const contentHash = sha(content);

let server: TestFileServer;
let dir: string;

beforeAll(async () => {
  server = await startFileServer({ "/model.gguf": content });
});
afterAll(async () => {
  await server.close();
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dax-dl-"));
  server.behavior = {};
  server.requests.length = 0;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const quick = { retryDelayMs: 5 };

describe("downloadFile", () => {
  it("downloads, verifies the hash and renames atomically", async () => {
    const dest = join(dir, "m.gguf");
    const progress: DownloadProgress[] = [];
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      onProgress: (p) => progress.push(p),
      ...quick,
    });
    expect(result.sizeBytes).toBe(content.length);
    expect(result.alreadyPresent).toBe(false);
    expect(readFileSync(dest).equals(content)).toBe(true);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(existsSync(`${dest}.part.json`)).toBe(false);
    expect(progress[0]?.phase).toBe("downloading");
    expect(progress.at(-1)?.phase).toBe("verifying");
    const downloading = progress.filter((p) => p.phase === "downloading");
    expect(downloading.at(-1)?.receivedBytes).toBe(content.length);
    expect(downloading.at(-1)?.totalBytes).toBe(content.length);
  });

  it("resumes a partial download with a Range request", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(`${dest}.part`, content.subarray(0, 700_000));
    writeFileSync(`${dest}.part.json`, JSON.stringify({ url: `${server.url}/model.gguf` }));
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      ...quick,
    });
    expect(result.resumedFromBytes).toBe(700_000);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.range).toBe("bytes=700000-");
    expect(readFileSync(dest).equals(content)).toBe(true);
  });

  it("sends If-Range with the stored ETag so a changed file restarts", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(`${dest}.part`, content.subarray(0, 1000));
    writeFileSync(
      `${dest}.part.json`,
      JSON.stringify({ url: `${server.url}/model.gguf`, etag: '"abc"' }),
    );
    await downloadFile(`${server.url}/model.gguf`, dest, { sha256: contentHash, ...quick });
    expect(server.requests[0]?.ifRange).toBe('"abc"');
  });

  it("resumes automatically after the connection drops midway", async () => {
    server.behavior = { dropAfterBytes: 400_000, dropTimes: 2 };
    const dest = join(dir, "m.gguf");
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      ...quick,
    });
    expect(readFileSync(dest).equals(content)).toBe(true);
    expect(server.requests.length).toBeGreaterThanOrEqual(3);
    // Every retry after the first must have asked for the remainder only.
    expect(server.requests[1]?.range).toMatch(/^bytes=\d+-$/);
    expect(result.sizeBytes).toBe(content.length);
  });

  it("starts over when the server ignores Range (HTTP 200)", async () => {
    server.behavior = { ignoreRange: true };
    const dest = join(dir, "m.gguf");
    writeFileSync(`${dest}.part`, Buffer.from("garbage that must not be spliced in"));
    writeFileSync(`${dest}.part.json`, JSON.stringify({ url: `${server.url}/model.gguf` }));
    await downloadFile(`${server.url}/model.gguf`, dest, { sha256: contentHash, ...quick });
    expect(readFileSync(dest).equals(content)).toBe(true);
  });

  it("discards a partial file that belongs to another URL", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(`${dest}.part`, Buffer.from("bytes of some other file"));
    writeFileSync(`${dest}.part.json`, JSON.stringify({ url: "http://example.invalid/other" }));
    await downloadFile(`${server.url}/model.gguf`, dest, { sha256: contentHash, ...quick });
    expect(server.requests[0]?.range).toBeUndefined();
    expect(readFileSync(dest).equals(content)).toBe(true);
  });

  it("treats a complete .part file (HTTP 416) as finished", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(`${dest}.part`, content);
    writeFileSync(`${dest}.part.json`, JSON.stringify({ url: `${server.url}/model.gguf` }));
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      ...quick,
    });
    expect(result.sizeBytes).toBe(content.length);
    expect(readFileSync(dest).equals(content)).toBe(true);
  });

  it("rejects a hash mismatch, deletes the partial data and never creates the target", async () => {
    const dest = join(dir, "m.gguf");
    const wrong = sha(Buffer.from("something else"));
    const error = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: wrong,
      ...quick,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HashMismatchError);
    expect((error as HashMismatchError).expected).toBe(wrong);
    expect((error as HashMismatchError).actual).toBe(contentHash);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it("rejects a size mismatch", async () => {
    const dest = join(dir, "m.gguf");
    await expect(
      downloadFile(`${server.url}/model.gguf`, dest, { expectedSize: 123, ...quick }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(existsSync(dest)).toBe(false);
  });

  it("aborts, keeps the partial file, and a later call resumes it", async () => {
    server.behavior = { chunkDelayMs: 5 };
    const dest = join(dir, "m.gguf");
    const controller = new AbortController();
    const first = downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.receivedBytes > 300_000) controller.abort();
      },
      ...quick,
    });
    await expect(first).rejects.toBeInstanceOf(DownloadAbortedError);
    const partial = statSync(`${dest}.part`).size;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(content.length);
    expect(existsSync(dest)).toBe(false);

    server.behavior = {};
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      ...quick,
    });
    expect(result.resumedFromBytes).toBe(partial);
    expect(readFileSync(dest).equals(content)).toBe(true);
  });

  it("fails fast when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadFile(`${server.url}/model.gguf`, join(dir, "m.gguf"), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(DownloadAbortedError);
    expect(server.requests).toHaveLength(0);
  });

  it("refuses to start when the disk has too little space", async () => {
    const dest = join(dir, "m.gguf");
    const error = await downloadFile(`${server.url}/model.gguf`, dest, {
      diskMarginBytes: 1024 ** 5, // a petabyte of safety margin cannot be satisfied
      ...quick,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientDiskSpaceError);
    expect((error as InsufficientDiskSpaceError).requiredBytes).toBeGreaterThan(
      (error as InsufficientDiskSpaceError).availableBytes,
    );
    expect(existsSync(dest)).toBe(false);
  });

  it("does not retry client errors such as 404", async () => {
    await expect(
      downloadFile(`${server.url}/missing`, join(dir, "x"), { ...quick }),
    ).rejects.toMatchObject({ status: 404 });
    expect(server.requests).toHaveLength(1);
  });

  it("gives up after maxRetries on server errors", async () => {
    server.behavior = { failWithStatus: 503 };
    await expect(
      downloadFile(`${server.url}/model.gguf`, join(dir, "x"), { maxRetries: 2, ...quick }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(server.requests).toHaveLength(3);
  });

  it("skips the download when the target already has the right hash", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(dest, content);
    const result = await downloadFile(`${server.url}/model.gguf`, dest, {
      sha256: contentHash,
      ...quick,
    });
    expect(result.alreadyPresent).toBe(true);
    expect(server.requests).toHaveLength(0);
  });

  it("re-downloads when the existing target is corrupt", async () => {
    const dest = join(dir, "m.gguf");
    writeFileSync(dest, Buffer.from("corrupt"));
    await downloadFile(`${server.url}/model.gguf`, dest, { sha256: contentHash, ...quick });
    expect(readFileSync(dest).equals(content)).toBe(true);
  });
});

describe("sha256File", () => {
  it("hashes a file", async () => {
    const f = join(dir, "x");
    writeFileSync(f, "hello");
    expect(await sha256File(f)).toBe(sha(Buffer.from("hello")));
  });
});
