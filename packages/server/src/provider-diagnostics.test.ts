// Connection status is explicit and invalidated when saved configuration changes.
import type { ProviderStatus, StateResponse } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import { startHarness } from "./test/harness.js";

describe("provider connection diagnostics API", () => {
  it("reports configured until probed, never edits, and clears verification on settings changes", async () => {
    const h = await startHarness({
      providers: {
        async list(): Promise<ProviderStatus[]> {
          return [
            {
              kind: "openai",
              available: true,
              connectionState: "configured",
              detail: "Configured (connection not tested)",
            },
          ];
        },
        async test(_env, kind) {
          return {
            kind,
            status: "connected",
            toolsSupported: true,
            checkedAt: Date.now(),
            detail: "Connected",
          };
        },
        async models() {
          return ["model-a"];
        },
      },
    });
    try {
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect(before.providers[0]?.connectionState).toBe("configured");
      expect((await h.post("/api/providers/test", { kind: "openai" })).json()).toMatchObject({
        status: "connected",
      });
      const after = (await h.req("/api/state")).json<StateResponse>();
      expect(after.providers[0]?.connectionState).toBe("connected");
      expect(after.history).toEqual(before.history);
      expect((await h.post("/api/providers/models", { kind: "openai" })).json()).toEqual({
        models: ["model-a"],
      });
      await h.post("/api/settings", {
        activeProvider: "openai",
        providers: { openai: { model: "new-model" } },
      });
      expect((await h.req("/api/state")).json<StateResponse>().providers[0]?.connectionState).toBe(
        "configured",
      );
    } finally {
      await h.cleanup();
    }
  });
});
