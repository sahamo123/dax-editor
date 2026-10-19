import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer, tempDir } from "../test-support/helpers.js";
import { type DownloadProgress, downloadFile, sha256File } from "./download.js";
import type { SttError } from "./errors.js";

const body = randomBytes(3 * 1024 * 1024);
const sha = createHash("sha256").update(body).digest("hex");
let dir: string;
let server: TestServer | undefined;

beforeAll(() => {
  dir = tempDir();
});
afterEach(async () => {
  await server?.close();
  server = undefined;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const dest = (name: string) => join(dir, name);
const failure = async (p: Promise<unknown>): Promise<SttError> => {
  try {
    await p;
  } catch (e) {
    return e as SttError;
  }
  throw new Error("expected the promise to reject");
};

describe("downloadFile", () => {
  it("downloads, verifies the hash, renames atomically and leaves no .part file", async () => {
    server = await startServer(body);
    const out = dest("ok.bin");
    const seen: DownloadProgress[] = [];
    await downloadFile(`${server.url}/file`, out, { sha256: sha, onProgress: (p) => seen.push(p) });
    expect(readFileSync(out).equals(body)).toBe(true);
    expect(existsSync(`${out}.part`)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ receivedBytes: body.length, fraction: 1 });
    expect(seen.some((p) => p.verifying)).toBe(true);
  });

  it("resumes a partial download with an HTTP Range request", async () => {
    server = await startServer(body);
    const out = dest("resume.bin");
    writeFileSync(`${out}.part`, body.subarray(0, 1_000_000));
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
    expect(server.requests[0]?.range).toBe("bytes=1000000-");
  });

  it("restarts from zero when the server ignores Range", async () => {
    server = await startServer(body, { ignoreRange: true });
    const out = dest("norange.bin");
    writeFileSync(`${out}.part`, Buffer.from("stale bytes that must not survive"));
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
  });

  it("survives a dropped connection by resuming where it stopped", async () => {
    server = await startServer(body, { dropAfterBytes: 700_000 });
    const out = dest("drop.bin");
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
    expect(server.requests).toHaveLength(2);
    expect(String(server.requests[1]?.range)).toMatch(/^bytes=\d+-$/);
  });

  it("deletes the download and says so when the hash does not match", async () => {
    server = await startServer(body);
    const out = dest("bad.bin");
    const err = await failure(downloadFile(`${server.url}/file`, out, { sha256: "0".repeat(64) }));
    expect(err.code).toBe("hash-mismatch");
    expect(err.message).toContain(sha);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.part`)).toBe(false);
  });

  it("catches a corrupt partial file that a resume would otherwise bless", async () => {
    server = await startServer(body);
    const out = dest("corrupt.bin");
    writeFileSync(`${out}.part`, randomBytes(500_000)); // not a prefix of the real file
    const err = await failure(downloadFile(`${server.url}/file`, out, { sha256: sha }));
    expect(err.code).toBe("hash-mismatch");
    expect(existsSync(out)).toBe(false);
  });

  it("does not download again when the file is already there and matches", async () => {
    server = await startServer(body);
    const out = dest("have.bin");
    writeFileSync(out, body);
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(server.requests).toHaveLength(0);
  });

  it("re-downloads a file that exists but fails its hash", async () => {
    server = await startServer(body);
    const out = dest("stale.bin");
    writeFileSync(out, "old");
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
  });

  it("accepts a complete part file when the server answers 416 to the resume", async () => {
    server = await startServer(body);
    const out = dest("complete-part.bin");
    writeFileSync(`${out}.part`, body);
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
  });

  it("reports HTTP errors with the status and URL", async () => {
    server = await startServer(body, { status: 404 });
    const err = await failure(
      downloadFile(`${server.url}/file`, dest("missing.bin"), { retries: 0 }),
    );
    expect(err.code).toBe("download-failed");
    expect(err.message).toMatch(/HTTP 404/);
  });

  it("reports an unreachable server clearly", async () => {
    const err = await failure(
      downloadFile("http://127.0.0.1:9/file", dest("none.bin"), { retries: 0 }),
    );
    expect(err.code).toBe("download-failed");
    expect(err.message).toMatch(/Could not reach/);
  });

  it("stops on abort and keeps the partial file for next time", async () => {
    server = await startServer(body);
    const out = dest("abort.bin");
    const ac = new AbortController();
    const err = await failure(
      downloadFile(`${server.url}/file`, out, {
        sha256: sha,
        signal: ac.signal,
        onProgress: () => ac.abort(),
      }),
    );
    expect(err.code).toBe("cancelled");
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.part`)).toBe(true);
    // ...and the next call finishes the job from where it stopped.
    await downloadFile(`${server.url}/file`, out, { sha256: sha });
    expect(readFileSync(out).equals(body)).toBe(true);
  });

  it("refuses to start when the disk cannot hold the file", async () => {
    server = await startServer(body);
    const err = await failure(
      downloadFile(`${server.url}/file`, dest("huge.bin"), {
        diskMarginBytes: 2 ** 60,
        retries: 0,
      }),
    );
    expect(err.code).toBe("disk-space");
    expect(err.message).toMatch(/Not enough free disk space/);
  });
});

describe("sha256File", () => {
  it("hashes a file in a stream, optionally only a prefix", async () => {
    const p = dest("hash.bin");
    writeFileSync(p, body);
    expect(await sha256File(p)).toBe(sha);
    expect(await sha256File(p, 10)).toBe(
      createHash("sha256").update(body.subarray(0, 10)).digest("hex"),
    );
    expect(statSync(p).size).toBe(body.length);
  });
});
