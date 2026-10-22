// Project lifecycle through the authenticated API, without an AI provider or media downloads.
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { startHarness } from "./test/harness.js";

describe("project lifecycle", () => {
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
