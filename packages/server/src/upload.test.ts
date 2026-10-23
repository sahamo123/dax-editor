// Browser imports retain valid media locally and reject unauthorized, invalid or oversized uploads.
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_UPLOAD_BYTES } from "@dax/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { HAS_FFMPEG, type Harness, makeVideo, startHarness } from "./test/harness.js";

let h: Harness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});
describe("browser upload", () => {
  it.skipIf(!HAS_FFMPEG)(
    "stages audio without importing video, then validates it through the shared audio command",
    async () => {
      h = await startHarness();
      const video = await makeVideo(h.workDir, "base.mp4");
      await h.post("/api/import", { paths: [video] });
      const wave = Buffer.alloc(44 + 16000);
      wave.write("RIFF", 0);
      wave.writeUInt32LE(wave.length - 8, 4);
      wave.write("WAVEfmt ", 8);
      wave.writeUInt32LE(16, 16);
      wave.writeUInt16LE(1, 20);
      wave.writeUInt16LE(1, 22);
      wave.writeUInt32LE(8000, 24);
      wave.writeUInt32LE(16000, 28);
      wave.writeUInt16LE(2, 32);
      wave.writeUInt16LE(16, 34);
      wave.write("data", 36);
      wave.writeUInt32LE(16000, 40);
      const staged = await h.req("/api/import/upload?name=music.wav&stage=true", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: wave,
      });
      expect(staged.json().ok).toBe(true);
      const path = staged.json<{ data: { path: string } }>().data.path;
      expect((await h.command("add_audio", { path, role: "music", start: 0 })).ok).toBe(true);
      expect(
        (
          await h.req("/api/import/upload?name=music.wav", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: wave,
          })
        ).status,
      ).toBe(400);
      const bad = await h.req("/api/import/upload?name=bad.wav&stage=true", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "not audio",
      });
      expect(
        (await h.command("add_audio", { path: bad.json<{ data: { path: string } }>().data.path }))
          .ok,
      ).toBe(false);
    },
  );
  it.skipIf(!HAS_FFMPEG)(
    "allows app-owned uploads while preserving a restrictive external-path policy",
    async () => {
      h = await startHarness({ allowRoots: [join(tmpdir(), "dax-external-imports-disabled")] });
      const source = await makeVideo(h.workDir, "restricted.mp4");
      expect((await h.post("/api/import", { paths: [source] })).json().ok).toBe(false);
      const uploaded = await h.req("/api/import/upload?name=restricted.mp4", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await readFile(source),
      });
      expect(uploaded.json().ok).toBe(true);
    },
  );
  it.skipIf(!HAS_FFMPEG)("stages a planning attachment without changing the timeline", async () => {
    h = await startHarness();
    const source = await makeVideo(h.workDir, "attachment.mp4");
    const r = await h.req("/api/import/upload?name=attachment.mp4&stage=true", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await readFile(source),
    });
    expect(r.json().ok).toBe(true);
    const state = (await h.req("/api/state")).json<{
      project: { assets: Record<string, unknown> };
    }>();
    expect(Object.keys(state.project.assets)).toHaveLength(0);
    const body = r.json<{ data: { path: string } }>();
    expect((await readFile(body.data.path)).length).toBeGreaterThan(0);
  });
  it("requires authorization before accepting bytes", async () => {
    h = await startHarness();
    const r = await h.req("/api/import/upload?name=a.mp4", {
      method: "POST",
      token: null,
      body: "x",
    });
    expect(r.status).toBe(401);
  });
  it("rejects unsupported extensions and excessive declared sizes", async () => {
    h = await startHarness();
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: "x",
    };
    expect((await h.req("/api/import/upload?name=script.exe", opts)).status).toBe(400);
    expect(
      (
        await h.req("/api/import/upload?name=a.mp4", {
          ...opts,
          headers: { ...opts.headers, "Content-Length": String(MAX_UPLOAD_BYTES + 1) },
        })
      ).status,
    ).toBe(413);
  });
  it("removes invalid media after probing fails", async () => {
    h = await startHarness();
    const r = await h.req("/api/import/upload?name=bad.mp4", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: "not video",
    });
    expect(r.json().ok).toBe(false);
    expect(await readdir(`${h.dataDir}/uploads`)).toEqual([]);
  });
  it.skipIf(!HAS_FFMPEG)(
    "imports real selected bytes without trusting the supplied filename as a destination",
    async () => {
      h = await startHarness();
      const file = await makeVideo(h.workDir, "selected.mp4");
      const r = await h.req("/api/import/upload?name=..%2F..%2Fclip.mp4", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await readFile(file),
      });
      expect(r.json().ok).toBe(true);
      const state = (await h.req("/api/state")).json<{
        project: { assets: Record<string, { path: string }> };
      }>();
      expect(Object.values(state.project.assets)[0]?.path).toContain("uploads");
    },
  );
});
