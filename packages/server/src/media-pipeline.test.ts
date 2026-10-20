// Tests for MediaPipeline internals that need no HTTP server: how it treats encoders when a source file is bad.

import { copyFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAsset, emptyProject, probe, resetEncoderProbes } from "@dax/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProcessRegistry } from "./ffmpeg-run.js";
import { JobManager } from "./jobs.js";
import { createLogger } from "./logger.js";
import { MediaPipeline } from "./media-pipeline.js";
import { HAS_FFMPEG, makeVideo } from "./test/harness.js";

describe.skipIf(!HAS_FFMPEG)("media pipeline encoder health", () => {
  let dir: string;
  let jobs: JobManager;
  let pipeline: MediaPipeline;

  beforeAll(async () => {
    resetEncoderProbes();
    dir = await realpath(await mkdtemp(join(tmpdir(), "dax-pipe-")));
    jobs = new JobManager(() => undefined);
    pipeline = new MediaPipeline({
      cacheDir: join(dir, "cache"),
      allowedRoots: [dir],
      jobs,
      registry: new ProcessRegistry(),
      log: createLogger(() => undefined),
      onChange: () => undefined,
    });
  });
  afterAll(async () => {
    await pipeline.shutdown();
    await rm(dir, { recursive: true, force: true });
  });

  it("shutdown waits for active preview workers to close before cache removal", async () => {
    const registry = new ProcessRegistry();
    const add = registry.add.bind(registry);
    let workerClosed = false;
    let started: () => void = () => undefined;
    const workerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(registry, "add").mockImplementation((child) => {
      add(child);
      child.once("close", () => {
        workerClosed = true;
      });
      started();
    });
    const cacheDir = join(dir, "shutdown-cache");
    const active = new MediaPipeline({
      cacheDir,
      allowedRoots: [dir],
      jobs: new JobManager(() => undefined),
      registry,
      log: createLogger(() => undefined),
      onChange: () => undefined,
    });
    const asset = await probe(
      await makeVideo(dir, "shutdown.mp4", { seconds: 10, size: "640x360" }),
    );
    try {
      active.ensureAssets(addAsset(emptyProject("shutdown"), asset));
      await workerStarted;
      await active.shutdown();
      expect(workerClosed).toBe(true);
      await rm(cacheDir, { recursive: true, force: true });
      await expect(active.fileFor(asset, "proxy.mp4", new URLSearchParams())).rejects.toMatchObject(
        { status: 503 },
      );
    } finally {
      await active.shutdown();
      await registry.killAll();
      await rm(cacheDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  /** Wait until the newest job whose label contains `name` stops running. */
  async function finished(name: string) {
    for (let i = 0; i < 600; i++) {
      const job = jobs
        .list()
        .filter((j) => j.label.includes(name))
        .at(-1);
      if (job && job.status !== "running") return job;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`job for ${name} never finished`);
  }

  /** Wait until a job for `name` has been created after the first `count` of them. */
  async function nextJob(name: string, count: number) {
    for (let i = 0; i < 600; i++) {
      if (jobs.list().filter((j) => j.label.includes(name)).length > count) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no new job for ${name}`);
  }

  it("a corrupt source does not block every encoder for later, healthy sources", async () => {
    const good = await probe(await makeVideo(dir, "good.mp4", { seconds: 1, size: "320x240" }));
    // A file that looks like a video by name but is garbage: every encoder "fails" on it.
    const badPath = join(dir, "corrupt.mp4");
    await writeFile(badPath, Buffer.from("this is not a video, it is a very corrupt file"));
    const bad = { ...good, id: "ast_bad", path: badPath };

    pipeline.ensureAssets(addAsset(emptyProject("t"), bad));
    expect((await finished("corrupt.mp4")).status).toBe("error");

    // Before the fix the corrupt file got every encoder added to a block list, so this proxy could never be made.
    pipeline.ensureAssets(addAsset(emptyProject("t"), good));
    const job = await finished("good.mp4");
    expect(job.error).toBeUndefined();
    expect(job.status).toBe("done");
  });

  it("retries a source that was missing at first, on the next change once the file is back", async () => {
    const src = await makeVideo(dir, "late-src.mp4", { seconds: 1, size: "320x240" });
    const late = join(dir, "late.mp4");
    const asset = { ...(await probe(src)), id: "ast_late", path: late };
    const project = addAsset(emptyProject("t"), asset);

    pipeline.ensureAssets(project);
    expect((await finished("late.mp4")).status).toBe("error");

    await copyFile(src, late);
    const before = jobs.list().filter((j) => j.label.includes("late.mp4")).length;
    pipeline.ensureAssets(project);
    // Before the fix the failed attempt stayed "started", so no second job was ever made and this timed out.
    await nextJob("late.mp4", before);
    expect((await finished("late.mp4")).status).toBe("done");
  });
});
