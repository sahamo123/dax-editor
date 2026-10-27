// A review render must use the real combined-effects export path without editing history or exposing arbitrary files.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StateResponse } from "@dax/protocol";
import { expect, it } from "vitest";
import { ffprobeJson, HAS_FFMPEG, makeVideo, startHarness } from "./test/harness.js";

it.skipIf(!HAS_FFMPEG)(
  "renders complete edits as private revision-bound Range media, with no history changes",
  async () => {
    const h = await startHarness();
    let output: string | undefined;
    try {
      const source = await makeVideo(h.workDir, "source.mp4", { seconds: 2, size: "320x180" });
      const logo = join(h.workDir, "logo.png");
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=32x32",
        "-frames:v",
        "1",
        "-threads",
        "1",
        logo,
      ]);
      await h.post("/api/import", { paths: [source] });
      const command = async (name: string, args: Record<string, unknown> = {}) => {
        const r = await h.post("/api/command", { name, args });
        const result = r.json<{
          ok: boolean;
          error?: string;
          data: { previewId: string; jobId: string; revision: number };
        }>();
        expect(result.ok, result.error).toBe(true);
        return result.data;
      };
      await command("set_format", { width: 320, height: 180, fps: 12 });
      await command("add_zoom", { start: 0, end: 2, scale: 1.3 });
      await command("add_image_overlay", { path: logo, start: 0, duration: 2, animation: "none" });
      await command("add_audio", { path: source, role: "music", start: 0, length: 2, volume: 0.2 });
      const before = (await h.req("/api/state")).json<StateResponse>();
      const review = await command("render_preview");
      let state = (await h.req("/api/state")).json<StateResponse>();
      for (let attempt = 0; attempt < 200; attempt++) {
        const job = state.jobs.find((item) => item.id === review.jobId);
        if (job?.status !== "running") break;
        await new Promise((done) => setTimeout(done, 50));
        state = (await h.req("/api/state")).json<StateResponse>();
      }
      const job = state.jobs.find((item) => item.id === review.jobId);
      expect(job?.status, job?.error).toBe("done");
      output = job?.result;
      expect(state.project).toEqual(before.project);
      expect(state.history).toEqual(before.history);
      const route = `/api/media/previews/${review.previewId}/proxy.mp4`;
      expect((await h.req(route, { token: null })).status).toBe(401);
      const response = await h.req(`${route}?token=${h.token}`, {
        token: null,
        headers: { Range: "bytes=0-99" },
      });
      expect(response.status).toBe(206);
      expect(response.body.length).toBe(100);
      const complete = await h.req(route);
      const file = join(h.workDir, "review.mp4");
      await writeFile(file, complete.body);
      const info = await ffprobeJson(file);
      expect(info.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
      expect(info.streams.find((stream) => stream.codec_type === "video")).toMatchObject({
        width: 320,
        height: 180,
      });
      expect((await h.req("/api/media/previews/__proto__/proxy.mp4")).status).toBe(404);
      await command("set_format", { width: 320, height: 180, fps: 15 });
      expect((await h.req(route)).status).toBe(404);
      await h.server.close();
      if (output) expect(existsSync(output)).toBe(false);
    } finally {
      await h.cleanup();
    }
    expect(output).toBeDefined();
    if (output) expect(existsSync(output)).toBe(false);
  },
  40_000,
);
