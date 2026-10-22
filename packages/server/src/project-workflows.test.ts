// Project lifecycle through the authenticated API, without an AI provider or media downloads.
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { startHarness } from "./test/harness.js";

describe("project lifecycle", () => {
  it("preserves unspecified editor format properties through the shared API", async () => {
    const h = await startHarness();
    try {
      await h.command("set_format", { fit: "cover", fps: 24 });
      await h.command("set_format", { preset: "square-1080" });
      expect((await h.req("/api/state")).json<StateResponse>().project.timeline).toMatchObject({
        width: 1080,
        height: 1080,
        fit: "cover",
        fps: 24,
      });
      await h.command("apply_edit_batch", {
        operations: [{ name: "set_format", args: { preset: "landscape-720p" } }],
      });
      expect((await h.req("/api/state")).json<StateResponse>().project.timeline).toMatchObject({
        width: 1280,
        height: 720,
        fit: "cover",
        fps: 24,
      });
    } finally {
      await h.cleanup();
    }
  });
  it("records scratch projects and reopens one after creating another", async () => {
    const h = await startHarness();
    try {
      await h.post("/api/project/new", { name: "First project" });
      const recent = (await h.req("/api/project/recent")).json<{ paths: string[] }>();
      const path = recent.paths[0];
      await h.post("/api/project/new", { name: "Second project" });
      expect((await h.post("/api/project/open", { path })).status).toBe(200);
      expect((await h.req("/api/state")).json<StateResponse>().project.name).toBe("First project");
    } finally {
      await h.cleanup();
    }
  });
  it("opens an uploaded copy and refuses out-of-root media without replacing the project", async () => {
    const h = await startHarness();
    try {
      const state = (await h.req("/api/state")).json<StateResponse>();
      const copy = structuredClone(state.project);
      copy.name = "Imported copy";
      expect((await h.post("/api/project/copy", { project: copy })).status).toBe(200);
      expect((await h.req("/api/state")).json<StateResponse>().project.name).toBe("Imported copy");
      copy.assets.bad = {
        id: "bad",
        path: process.platform === "win32" ? "C:\\not-allowed\\bad.mp4" : "/not-allowed/bad.mp4",
        kind: "video",
        duration: 1,
        hasAudio: false,
      };
      expect((await h.post("/api/project/copy", { project: copy })).status).toBe(403);
      expect((await h.req("/api/state")).json<StateResponse>().project.assets).toEqual({});
    } finally {
      await h.cleanup();
    }
  });
});
