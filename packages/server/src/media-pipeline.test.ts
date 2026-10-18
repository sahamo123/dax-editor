// Tests for MediaPipeline internals that need no HTTP server: how it treats encoders when a source file is bad.

import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAsset, emptyProject, probe, resetEncoderProbes } from "@dax/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    pipeline.shutdown();
    await rm(dir, { recursive: true, force: true });
  });

  /** Wait until the job whose label contains `name` stops running. */
  async function finished(name: string) {
    for (let i = 0; i < 600; i++) {
      const job = jobs.list().find((j) => j.label.includes(name));
      if (job && job.status !== "running") return job;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`job for ${name} never finished`);
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
});
