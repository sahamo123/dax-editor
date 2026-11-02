// Guarded chat requests must not be attributed to a project or provider selected after submission.
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { startHarness } from "./test/harness.js";

describe("chat context guard", () => {
  it("rejects a request for a replaced project without creating a task", async () => {
    const h = await startHarness();
    try {
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect(before.projectId).toBeDefined();
      expect(before.providerContextVersion).toBeTypeOf("number");
      expect((await h.post("/api/project/new", { name: "Second" })).status).toBe(200);
      const response = await h.post("/api/chat", {
        message: "stale project",
        expectedProjectId: before.projectId,
        expectedProviderEpoch: before.providerContextVersion,
      });
      expect(response.status).toBe(409);
      expect(response.text()).toMatch(/project|context/i);
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.tasks?.some((task) => task.title === "stale project")).toBe(false);
    } finally {
      await h.cleanup();
    }
  });

  it("rejects a provider changed away and back, even when its kind matches again", async () => {
    const h = await startHarness();
    try {
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect(before.providerContextVersion).toBeTypeOf("number");
      await h.post("/api/settings", { ...before.settings, activeProvider: "openrouter" });
      await h.post("/api/settings", before.settings);
      const after = (await h.req("/api/state")).json<StateResponse>();
      expect(after.settings.activeProvider).toBe(before.settings.activeProvider);
      expect(after.providerContextVersion).not.toBe(before.providerContextVersion);
      const response = await h.post("/api/chat", {
        message: "stale provider",
        expectedProjectId: before.projectId,
        expectedProviderEpoch: before.providerContextVersion,
      });
      expect(response.status).toBe(409);
      expect(response.text()).toMatch(/provider|assistant|context/i);
      expect(
        (await h.req("/api/state"))
          .json<StateResponse>()
          .tasks?.some((task) => task.title === "stale provider"),
      ).toBe(false);
    } finally {
      await h.cleanup();
    }
  });

  it("accepts matching guards and legacy requests, but rejects partial guards", async () => {
    const h = await startHarness();
    try {
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.providerContextVersion).toBeTypeOf("number");
      expect(
        (await h.post("/api/chat", { message: "partial", expectedProjectId: state.projectId }))
          .status,
      ).toBe(400);
      const guarded = await h.post("/api/chat", {
        message: "matching",
        queue: true,
        expectedProjectId: state.projectId,
        expectedProviderEpoch: state.providerContextVersion,
      });
      expect(guarded.status).toBe(202);
      expect((await h.post("/api/chat", { message: "legacy", queue: true })).status).toBe(202);
    } finally {
      await h.cleanup();
    }
  });
});
