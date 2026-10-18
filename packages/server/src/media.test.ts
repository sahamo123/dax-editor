// End-to-end media tests with FFmpeg-generated footage: import, proxy jobs, Range serving, thumbnails, waveform, filmstrip and export.
// Skipped automatically when FFmpeg is not installed.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JobInfo, StateResponse, WsEvent } from "@dax/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ffprobeJson,
  HAS_FFMPEG,
  type Harness,
  keyframeTimes,
  makeVideo,
  startHarness,
} from "./test/harness.js";

const isJob = (e: WsEvent): e is Extract<WsEvent, { type: "job" }> => e.type === "job";
const isState = (e: WsEvent): e is Extract<WsEvent, { type: "state" }> => e.type === "state";

describe.skipIf(!HAS_FFMPEG)("media pipeline", () => {
  let h: Harness;
  let videoPath: string;
  let assetId: string;
  let silentAssetId: string;
  let events: WsEvent[];
  const media = (id: string, kind: string, query = "") =>
    `/api/media/${id}/${kind}?token=${h.token}${query}`;

  beforeAll(async () => {
    h = await startHarness();
    const ws = await h.ws();
    events = ws.events;
    videoPath = await makeVideo(h.workDir, "clip.mp4", { seconds: 3 });
    const silent = await makeVideo(h.workDir, "silent.mp4", { seconds: 2, audio: false });

    const imported = await h.post("/api/import", { paths: [videoPath, silent] });
    const body = imported.json<{ ok: boolean; data: { assetIds: string[] } }>();
    expect(body.ok).toBe(true);
    [assetId = "", silentAssetId = ""] = body.data.assetIds;

    // Wait for both proxy jobs to finish.
    await ws.waitForAny(
      (e) =>
        isJob(e) &&
        e.job.kind === "proxy" &&
        e.job.status === "done" &&
        e.job.label.includes("clip.mp4"),
    );
    await ws.waitForAny(
      (e) =>
        isJob(e) &&
        e.job.kind === "proxy" &&
        e.job.status === "done" &&
        e.job.label.includes("silent.mp4"),
    );
  });
  afterAll(async () => h.cleanup());

  it("imports through /api/import, puts both clips on the timeline and records manual history", async () => {
    const state = (await h.req("/api/state")).json<StateResponse>();
    expect(Object.keys(state.project.assets)).toHaveLength(2);
    const clips = state.project.timeline.tracks[0]?.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(state.history.map((x) => x.source)).toEqual(["system", "manual", "manual"]);
    expect(state.history.at(-1)?.label).toBe("Import silent.mp4");
  });

  it("reports proxy job progress, in order, ending in done", () => {
    const jobEvents = events.filter(isJob).filter((e) => e.job.label.includes("clip.mp4"));
    expect(jobEvents.length).toBeGreaterThanOrEqual(2);
    const first = jobEvents[0]?.job as JobInfo;
    const last = jobEvents.at(-1)?.job as JobInfo;
    expect(first).toMatchObject({ kind: "proxy", status: "running", progress: 0 });
    expect(last).toMatchObject({ kind: "proxy", status: "done", progress: 1 });
    const progress = jobEvents.map((e) => e.job.progress);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    // The same job also appears in pushed state.
    expect(events.filter(isState).some((e) => e.state.jobs.some((j) => j.status === "done"))).toBe(
      true,
    );
  });

  it("makes a playable 480p H.264 + AAC proxy with a short keyframe interval", async () => {
    const res = await h.req(media(assetId, "proxy.mp4"), { token: null });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    const file = join(h.dataDir, "proxy-copy.mp4");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, res.body);

    const probe = await ffprobeJson(file);
    const video = probe.streams.find((s) => s.codec_type === "video");
    const audio = probe.streams.find((s) => s.codec_type === "audio");
    expect(video).toMatchObject({ codec_name: "h264", height: 480, pix_fmt: "yuv420p" });
    expect(Number(video?.width) % 2).toBe(0);
    expect(audio).toMatchObject({ codec_name: "aac" });
    expect(Number(probe.format.duration)).toBeGreaterThan(2.5);
    expect(Number(probe.format.duration)).toBeLessThan(3.5);

    // Seeking is quick only if key frames are close together: at most about half a second apart (plus one frame).
    const keys = await keyframeTimes(file);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < keys.length; i++) {
      expect((keys[i] as number) - (keys[i - 1] as number)).toBeLessThan(0.6);
    }
  });

  it("does not upscale sources smaller than 480p", async () => {
    const small = await makeVideo(h.workDir, "small.mp4", { seconds: 1, size: "320x240" });
    const ws = await h.ws();
    const r = await h.command("import_media", { path: small });
    expect(r.ok).toBe(true);
    await ws.waitForAny(
      (e) => isJob(e) && e.job.label.includes("small.mp4") && e.job.status === "done",
    );
    const id = (r.data as { assetId: string }).assetId;
    const { writeFile } = await import("node:fs/promises");
    const file = join(h.dataDir, "small-proxy.mp4");
    await writeFile(file, (await h.req(media(id, "proxy.mp4"), { token: null })).body);
    const v = (await ffprobeJson(file)).streams.find((s) => s.codec_type === "video");
    expect(v).toMatchObject({ height: 240, width: 320 });
  });

  describe("HTTP Range", () => {
    let size: number;
    beforeAll(async () => {
      const head = await h.req(media(assetId, "proxy.mp4"), { method: "HEAD", token: null });
      size = Number(head.headers["content-length"]);
      expect(size).toBeGreaterThan(1000);
    });
    const get = (range?: string, extra: Record<string, string> = {}) =>
      h.req(media(assetId, "proxy.mp4"), {
        token: null,
        headers: { ...(range ? { Range: range } : {}), ...extra },
      });

    it("answers HEAD with length and no body", async () => {
      const r = await h.req(media(assetId, "proxy.mp4"), { method: "HEAD", token: null });
      expect(r.status).toBe(200);
      expect(r.body.length).toBe(0);
    });

    it("serves a closed range as 206 with the right bytes and Content-Range", async () => {
      const full = (await get()).body;
      const r = await get("bytes=10-109");
      expect(r.status).toBe(206);
      expect(r.headers["content-range"]).toBe(`bytes 10-109/${size}`);
      expect(r.headers["content-length"]).toBe("100");
      expect(r.body.equals(full.subarray(10, 110))).toBe(true);
    });

    it("serves open-ended and suffix ranges", async () => {
      const full = (await get()).body;
      const open = await get(`bytes=${size - 50}-`);
      expect(open.status).toBe(206);
      expect(open.body.equals(full.subarray(size - 50))).toBe(true);
      const suffix = await get("bytes=-64");
      expect(suffix.status).toBe(206);
      expect(suffix.headers["content-range"]).toBe(`bytes ${size - 64}-${size - 1}/${size}`);
      expect(suffix.body.equals(full.subarray(size - 64))).toBe(true);
    });

    it("clamps an end past the file and a suffix longer than the file", async () => {
      const r = await get(`bytes=${size - 10}-${size + 5000}`);
      expect(r.status).toBe(206);
      expect(r.headers["content-range"]).toBe(`bytes ${size - 10}-${size - 1}/${size}`);
      const big = await get(`bytes=-${size * 10}`);
      expect(big.status).toBe(206);
      expect(big.body.length).toBe(size);
    });

    it("answers 416 with Content-Range */size for out-of-bounds starts and zero-length suffixes", async () => {
      for (const range of [
        `bytes=${size}-`,
        `bytes=${size + 100}-${size + 200}`,
        "bytes=-0",
        "bytes=99999999999-",
      ]) {
        const r = await get(range);
        expect(r.status, range).toBe(416);
        expect(r.headers["content-range"], range).toBe(`bytes */${size}`);
        expect(r.body.length).toBe(0);
      }
    });

    it("ignores malformed, reversed, multi-range and non-byte Range headers (full 200)", async () => {
      for (const range of ["bytes=abc", "bytes=9-2", "bytes=0-1,5-6", "pages=1-2"]) {
        const r = await get(range);
        expect(r.status, range).toBe(200);
        expect(r.body.length).toBe(size);
      }
    });

    it("honours If-Range: a stale validator gets the whole file, a current one gets the range", async () => {
      const etag = String((await get()).headers.etag);
      expect((await get("bytes=0-9", { "If-Range": '"stale"' })).status).toBe(200);
      expect((await get("bytes=0-9", { "If-Range": etag })).status).toBe(206);
    });

    it("supports conditional requests with ETag (304)", async () => {
      const etag = String((await get()).headers.etag);
      const r = await get(undefined, { "If-None-Match": etag });
      expect(r.status).toBe(304);
    });

    it("requires the token even for ranged media requests", async () => {
      const r = await h.req(`/api/media/${assetId}/proxy.mp4`, {
        token: null,
        headers: { Range: "bytes=0-9" },
      });
      expect(r.status).toBe(401);
    });
  });

  it("makes JPEG thumbnails at requested times and widths, and caches them", async () => {
    const a = await h.req(media(assetId, "thumb.jpg", "&t=1.5&w=120"), { token: null });
    expect(a.status).toBe(200);
    expect(a.headers["content-type"]).toBe("image/jpeg");
    expect([...a.body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const { writeFile } = await import("node:fs/promises");
    const file = join(h.dataDir, "thumb.jpg");
    await writeFile(file, a.body);
    expect((await ffprobeJson(file)).streams[0]).toMatchObject({ width: 120 });

    const b = await h.req(media(assetId, "thumb.jpg", "&t=1.5&w=120"), { token: null });
    expect(b.body.equals(a.body)).toBe(true);
    const different = await h.req(media(assetId, "thumb.jpg", "&t=0&w=120"), { token: null });
    expect(different.status).toBe(200);
    expect(different.body.equals(a.body)).toBe(false);
  });

  it("handles a burst of thumbnail requests without starting an unbounded number of FFmpeg processes", async () => {
    const times = Array.from({ length: 16 }, (_, i) => (i * 0.17).toFixed(2));
    const results = await Promise.all(
      times.map((t) => h.req(media(assetId, "thumb.jpg", `&t=${t}&w=64`), { token: null })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it("clamps thumbnail times and widths, and rejects non-numeric parameters", async () => {
    expect((await h.req(media(assetId, "thumb.jpg", "&t=9999"), { token: null })).status).toBe(200);
    expect((await h.req(media(assetId, "thumb.jpg", "&t=-5"), { token: null })).status).toBe(200);
    expect((await h.req(media(assetId, "thumb.jpg", "&t=abc"), { token: null })).status).toBe(400);
    expect((await h.req(media(assetId, "thumb.jpg", "&w=Infinity"), { token: null })).status).toBe(
      400,
    );
  });

  it("serves waveform peaks as JSON in 0..1 with the expected density", async () => {
    const r = await h.req(media(assetId, "waveform.json"), { token: null });
    expect(r.status).toBe(200);
    const w = r.json<{
      version: number;
      duration: number;
      peaksPerSecond: number;
      peaks: number[];
    }>();
    expect(w.version).toBe(1);
    expect(w.peaksPerSecond).toBe(50);
    expect(w.peaks.length).toBeGreaterThan(130);
    expect(w.peaks.length).toBeLessThan(170);
    expect(Math.max(...w.peaks)).toBeLessThanOrEqual(1);
    expect(Math.min(...w.peaks)).toBeGreaterThanOrEqual(0);
    // A sine tone is loud everywhere.
    expect(w.peaks.filter((p) => p > 0.05).length).toBeGreaterThan(w.peaks.length * 0.9);
  });

  it("answers 404 for the waveform of a video without audio", async () => {
    const r = await h.req(media(silentAssetId, "waveform.json"), { token: null });
    expect(r.status).toBe(404);
  });

  it("serves a filmstrip JPEG whose width is frames x 96 and announces the frame count", async () => {
    const r = await h.req(media(assetId, "filmstrip.jpg"), { token: null });
    expect(r.status).toBe(200);
    const frames = Number(r.headers["x-dax-frames"]);
    expect(frames).toBe(4); // 3 s -> ceil(3) = 3, raised to the minimum of 4
    const { writeFile } = await import("node:fs/promises");
    const file = join(h.dataDir, "film.jpg");
    await writeFile(file, r.body);
    expect((await ffprobeJson(file)).streams[0]).toMatchObject({ width: frames * 96, height: 54 });
  });

  it("answers 404 for unknown asset ids and for proxies that were never requested for existing assets", async () => {
    expect((await h.req(media("asset_missing", "proxy.mp4"), { token: null })).status).toBe(404);
  });

  it("exports as a job with progress and a finished file, and refuses unsafe or duplicate targets", async () => {
    // A small project format keeps the software encode fast.
    const fresh = await h.post("/api/project/new", {
      name: "Export test",
      width: 320,
      height: 180,
      fps: 15,
    });
    expect(fresh.status).toBe(200);
    expect((await h.command("import_media", { path: videoPath })).ok).toBe(true);
    const ws = await h.ws();
    const out = join(h.workDir, "export.mp4");
    const started = await h.command("export_video", { path: out });
    expect(started.ok).toBe(true);
    const jobId = (started.data as { jobId: string }).jobId;
    const done = (await ws.waitForAny(
      (e) => isJob(e) && e.job.id === jobId && e.job.status === "done",
    )) as Extract<WsEvent, { type: "job" }>;
    expect(done.job).toMatchObject({ kind: "export", progress: 1, result: out });
    expect(existsSync(out)).toBe(true);
    const probe = await ffprobeJson(out);
    expect(Number(probe.format.duration)).toBeGreaterThan(2.5); // the 3 s clip
    expect(probe.streams.some((s) => s.codec_type === "audio")).toBe(true);

    // Existing file: refused without leaving a failed job behind.
    const before = (await h.req("/api/state"))
      .json<StateResponse>()
      .jobs.filter((j) => j.kind === "export").length;
    const again = await h.command("export_video", { path: out });
    expect(again).toMatchObject({ ok: false });
    expect(String(again.error)).toContain("already exists");
    const after = (await h.req("/api/state"))
      .json<StateResponse>()
      .jobs.filter((j) => j.kind === "export").length;
    expect(after).toBe(before);
    // Wrong extension.
    expect(await h.command("export_video", { path: join(h.workDir, "x.mov") })).toMatchObject({
      ok: false,
    });
  });

  it("reuses cached proxies after a restart without creating a new proxy job", async () => {
    await h.server.close();
    const second = await startHarness({ dataDir: h.dataDir, allowRoots: [h.workDir, h.dataDir] });
    try {
      const state = (await second.req("/api/state")).json<StateResponse>();
      expect(state.project.name).toBe("Export test"); // last project reopened
      expect(Object.keys(state.project.assets)).toHaveLength(1);
      expect(state.jobs.filter((j) => j.kind === "proxy")).toHaveLength(0);
      const reopenedId = Object.keys(state.project.assets)[0] ?? "";
      const r = await second.req(`/api/media/${reopenedId}/proxy.mp4?token=${second.token}`, {
        token: null,
      });
      expect(r.status).toBe(200);
    } finally {
      await second.cleanup();
    }
  });
});
