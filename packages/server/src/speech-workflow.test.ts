// Speech setup and cancellation stay observable, serialized and offline under injected test seams.
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { startHarness } from "./test/harness.js";

describe("speech workflow jobs", () => {
  it("tracks setup progress, blocks project switching and cancels without replay", async () => {
    let started = false;
    const h = await startHarness({
      speech: {
        async status() {
          return {
            ready: false,
            runtimeInstalled: false,
            modelInstalled: false,
            modelId: "test",
            sizeBytes: 10,
            detail: "Not installed",
          };
        },
        async install(task) {
          started = true;
          task.onProgress(0.5);
          await new Promise<void>((resolve) =>
            task.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
        async remove() {},
      },
    });
    try {
      expect((await h.req("/api/speech")).json()).toMatchObject({ ready: false });
      const response = await h.post("/api/speech/install", {});
      expect(response.status).toBe(202);
      const { jobId } = response.json<{ jobId: string }>();
      await vi.waitFor(() => expect(started).toBe(true));
      expect((await h.post("/api/project/new", { name: "Wrong time" })).status).toBe(409);
      const running = (await h.req("/api/state")).json<StateResponse>();
      expect(running.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: jobId,
            origin: "transcription",
            status: "running",
            progress: 0.5,
          }),
        ]),
      );
      expect((await h.post(`/api/jobs/${jobId}/cancel`, {})).json()).toEqual({ cancelled: true });
      await vi.waitFor(async () =>
        expect(
          (await h.req("/api/state")).json<StateResponse>().tasks?.find((task) => task.id === jobId)
            ?.status,
        ).toBe("cancelled"),
      );
    } finally {
      await h.cleanup();
    }
  });
  it("clearly reports unsupported setup and refuses missing transcription assets", async () => {
    const h = await startHarness();
    try {
      expect((await h.req("/api/speech")).status).toBe(501);
      expect((await h.post("/api/speech/transcribe", { assetId: "missing" })).status).toBe(404);
    } finally {
      await h.cleanup();
    }
  });
});
