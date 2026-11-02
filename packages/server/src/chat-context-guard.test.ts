// Guarded chat requests must not be attributed to a project or provider selected after submission.
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { NullLocalModelController } from "./stubs.js";
import { startHarness } from "./test/harness.js";

describe("chat context guard", () => {
  it("returns a conflict without creating a task while the local model is changing", async () => {
    const model = new NullLocalModelController();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(model, "install").mockImplementation(async () => gate);
    const h = await startHarness({ localModel: model });
    try {
      const initial = (await h.req("/api/state")).json<StateResponse>();
      expect(
        (await h.post("/api/settings", { ...initial.settings, activeProvider: "local" })).status,
      ).toBe(200);
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect((await h.post("/api/local-model/install", {})).status).toBe(202);
      const response = await h.post("/api/chat", {
        message: "local transition",
        expectedProjectId: before.projectId,
        expectedProviderEpoch: before.providerContextVersion,
      });
      expect(response.status).toBe(409);
      expect(response.text()).toMatch(/local model.*changing/i);
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.tasks?.some((task) => task.title === "local transition")).toBe(false);
    } finally {
      release();
      await h.cleanup();
      vi.restoreAllMocks();
    }
  });

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
      const changed = await h.post("/api/settings", {
        ...before.settings,
        activeProvider: "openrouter",
      });
      expect(changed.status, changed.text()).toBe(200);
      const restored = await h.post("/api/settings", before.settings);
      expect(restored.status, restored.text()).toBe(200);
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
