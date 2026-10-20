// Unit tests for the pure pieces: range parsing, Host/Origin helpers, path containment, peaks, jobs, logger and CLI args.

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerArgs } from "./args.js";
import { JobManager } from "./jobs.js";
import { createLogger } from "./logger.js";
import { filmstripFrames, PeakAccumulator, waveformRate } from "./media-pipeline.js";
import { isSafeId, PathNotAllowedError, resolveInsideRoots } from "./paths.js";
import { parseRange } from "./range.js";
import {
  bearerToken,
  corsHeaders,
  isAllowedHost,
  isAllowedOrigin,
  normalizeOrigin,
  safeEqual,
} from "./security.js";

describe("parseRange", () => {
  it("serves everything when there is no Range header", () => {
    expect(parseRange(undefined, 100)).toEqual({ kind: "full" });
  });
  it("parses explicit, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ kind: "partial", start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
  });
  it("clamps an end past the file and a suffix longer than the file", () => {
    expect(parseRange("bytes=50-5000", 100)).toEqual({ kind: "partial", start: 50, end: 99 });
    expect(parseRange("bytes=-5000", 100)).toEqual({ kind: "partial", start: 0, end: 99 });
  });
  it("marks ranges outside the file unsatisfiable", () => {
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=500-600", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=0-0", 0)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange(`bytes=${"9".repeat(400)}-`, 100)).toEqual({ kind: "unsatisfiable" });
  });
  it("ignores malformed, reversed, multi-range and non-byte ranges", () => {
    for (const h of [
      "bytes=abc",
      "bytes=5-2",
      "bytes=0-1,5-6",
      "items=0-1",
      "bytes=-",
      "bytes 0-1",
      "",
    ]) {
      expect(parseRange(h, 100)).toEqual({ kind: "full" });
    }
  });
});

describe("security helpers", () => {
  it("accepts only loopback hosts on the listening port", () => {
    expect(isAllowedHost("127.0.0.1:4000", 4000)).toBe(true);
    expect(isAllowedHost("localhost:4000", 4000)).toBe(true);
    expect(isAllowedHost("LOCALHOST:4000", 4000)).toBe(true);
    for (const bad of [
      "evil.com:4000",
      "127.0.0.1:4001",
      "127.0.0.1",
      "[::1]:4000",
      "localhost.evil.com:4000",
      undefined,
      "",
    ]) {
      expect(isAllowedHost(bad, 4000)).toBe(false);
    }
  });
  it("normalises origins and rejects wildcards and paths", () => {
    expect(normalizeOrigin("HTTP://localhost:5173/")).toBe("http://localhost:5173");
    expect(normalizeOrigin("tauri://localhost")).toBe("tauri://localhost");
    for (const bad of ["*", "localhost:5173", "http://localhost:5173/app", "http://", ""]) {
      expect(() => normalizeOrigin(bad)).toThrow(/Invalid origin/);
    }
  });
  it("allows no Origin header but only listed origins otherwise", () => {
    const allowed = new Set(["http://localhost:5173"]);
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5174", allowed)).toBe(false);
    expect(isAllowedOrigin("null", allowed)).toBe(false);
    expect(corsHeaders("http://evil.example", allowed)).toEqual({});
    expect(corsHeaders("http://localhost:5173", allowed)["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:5173",
    );
  });
  it("extracts bearer tokens and compares in constant time", () => {
    expect(bearerToken({ authorization: "Bearer abc" })).toBe("abc");
    expect(bearerToken({ authorization: "bearer abc" })).toBe("abc");
    expect(bearerToken({ authorization: "Basic abc" })).toBeUndefined();
    expect(bearerToken({ authorization: "Bearer " })).toBeUndefined();
    expect(bearerToken({})).toBeUndefined();
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("resolveInsideRoots", () => {
  let root: string;
  let outside: string;
  beforeAll(async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), "dax-paths-")));
    root = join(base, "root");
    outside = join(base, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "link"), process.platform === "win32" ? "junction" : "dir");
  });
  afterAll(async () => rm(join(root, ".."), { recursive: true, force: true }));

  it("accepts files and not-yet-existing files inside a root", async () => {
    expect(await resolveInsideRoots(join(root, "a.mp4"), [root])).toBe(join(root, "a.mp4"));
    expect(await resolveInsideRoots(join(root, "new", "deep", "x.mp4"), [root])).toBe(
      join(root, "new", "deep", "x.mp4"),
    );
  });
  it("refuses relative paths, .. escapes, sibling prefixes and NUL bytes", async () => {
    await expect(resolveInsideRoots("a.mp4", [root])).rejects.toBeInstanceOf(PathNotAllowedError);
    await expect(
      resolveInsideRoots(join(root, "..", "outside", "secret.txt"), [root]),
    ).rejects.toThrow(/outside the allowed/);
    await expect(resolveInsideRoots(`${root}-evil/x`, [root])).rejects.toThrow(
      /outside the allowed/,
    );
    await expect(resolveInsideRoots(`${root}/a\0.mp4`, [root])).rejects.toThrow(/NUL/);
  });
  it("refuses a symlink inside the root that points outside it", async () => {
    await expect(resolveInsideRoots(join(root, "link", "secret.txt"), [root])).rejects.toThrow(
      /resolves outside/,
    );
  });
  it("only accepts ids made of letters, digits, underscore and dash", () => {
    expect(isSafeId("asset_lx3k2a1-9")).toBe(true);
    for (const bad of ["", "..", "a/b", "a\\b", "a.b", "a b", "%2e%2e", "x".repeat(81)]) {
      expect(isSafeId(bad)).toBe(false);
    }
  });
});

describe("PeakAccumulator", () => {
  it("takes the maximum absolute sample per window and scales to 0..1", () => {
    const acc = new PeakAccumulator(2);
    const buf = Buffer.alloc(8);
    for (const [i, v] of [100, -16384, 0, 32767].entries()) buf.writeInt16LE(v, i * 2);
    acc.push(buf);
    expect(acc.finish()).toEqual([0.5, 1]);
  });
  it("handles a sample split across chunks and a final partial window", () => {
    const acc = new PeakAccumulator(2);
    const buf = Buffer.alloc(6);
    for (const [i, v] of [8192, 0, -32768].entries()) buf.writeInt16LE(v, i * 2);
    acc.push(buf.subarray(0, 3));
    acc.push(buf.subarray(3));
    expect(acc.finish()).toEqual([0.25, 1]);
  });
  it("derives sensible rates and frame counts", () => {
    expect(waveformRate(60)).toBe(50);
    expect(waveformRate(4000)).toBe(5);
    expect(filmstripFrames(0.5)).toBe(4);
    expect(filmstripFrames(10.2)).toBe(11);
    expect(filmstripFrames(99999)).toBe(120);
  });
});

describe("JobManager", () => {
  it("throttles progress, never goes backwards, and keeps the first outcome", () => {
    const seen: string[] = [];
    const jobs = new JobManager((j, change) =>
      seen.push(`${change}:${j.status}:${j.progress.toFixed(2)}`),
    );
    const h = jobs.create("proxy", "x");
    h.progress(0.001);
    h.progress(0.5);
    h.progress(0.2);
    h.done("out");
    h.fail("late");
    expect(seen).toEqual(["created:running:0.00", "progress:running:0.50", "finished:done:1.00"]);
    expect(jobs.list()[0]).toMatchObject({ status: "done", result: "out", progress: 1 });
    expect(jobs.isRunning("proxy")).toBe(false);
  });
  it("keeps running jobs and only the most recent finished ones", () => {
    const jobs = new JobManager(() => undefined);
    const running = jobs.create("export", "long");
    for (let i = 0; i < 30; i++) jobs.create("proxy", `p${i}`).done();
    const list = jobs.list();
    expect(list.filter((j) => j.status === "done")).toHaveLength(20);
    expect(list.some((j) => j.id === running.id)).toBe(true);
  });
});

describe("logger", () => {
  it("redacts registered secrets and ignores very short ones", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log.addSecret("super-secret-key");
    log.addSecret("abc");
    log.info("using super-secret-key and abc");
    expect(lines[0]).toContain("using [redacted] and abc");
    expect(log.redact("x super-secret-key y")).toBe("x [redacted] y");
  });
  it("drops lines below the level", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l), "warn");
    log.info("no");
    log.warn("yes");
    expect(lines).toHaveLength(1);
  });
});

describe("parseServerArgs", () => {
  it("parses the documented flags", () => {
    const r = parseServerArgs(
      [
        "--port",
        "0",
        "--data-dir",
        "/d",
        "--origin",
        "http://localhost:5173/",
        "--origin",
        "tauri://localhost",
        "--allow-root",
        "/a",
        "--allow-root",
        "/b",
      ],
      {},
    );
    expect(r.options).toMatchObject({
      port: 0,
      dataDir: resolve("/d"),
      origins: ["http://localhost:5173", "tauri://localhost"],
      allowRoots: [resolve("/a"), resolve("/b")],
    });
    expect(r.exitOnStdinClose).toBe(true);
  });
  it("reads the token from the environment and honours --no-exit-on-stdin-close", () => {
    const r = parseServerArgs(["--no-exit-on-stdin-close"], {
      DAX_SERVER_TOKEN: "0123456789abcdef",
    });
    expect(r.options.token).toBe("0123456789abcdef");
    expect(r.exitOnStdinClose).toBe(false);
  });
  it("rejects bad ports, unknown flags and wildcard origins", () => {
    expect(() => parseServerArgs(["--port", "70000"], {})).toThrow(/--port/);
    expect(() => parseServerArgs(["--port", "x"], {})).toThrow(/--port/);
    expect(() => parseServerArgs(["--nope"], {})).toThrow();
    expect(() => parseServerArgs(["--origin", "*"], {})).toThrow(/Invalid origin/);
  });
});
