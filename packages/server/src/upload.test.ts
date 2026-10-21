// Browser imports retain valid media locally and reject unauthorized, invalid or oversized uploads.
import { readdir, readFile } from "node:fs/promises";
import { MAX_UPLOAD_BYTES } from "@dax/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { HAS_FFMPEG, type Harness, makeVideo, startHarness } from "./test/harness.js";

let h: Harness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});
describe("browser upload", () => {
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
