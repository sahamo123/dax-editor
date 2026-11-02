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
          await new Promise<void>((_resolve, reject) =>
            task.signal.addEventListener(
              "abort",
              () => {
                const error = new Error("Cancelled");
                error.name = "AbortError";
                reject(error);
              },
              { once: true },
            ),
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
      const cancelled = (await h.req("/api/state"))
        .json<StateResponse>()
        .jobs.find((job) => job.id === jobId);
      expect(cancelled).toMatchObject({ status: "error", error: "Cancelled", cancelled: true });
      const task = (await h.req("/api/state"))
        .json<StateResponse>()
        .tasks?.find((item) => item.id === jobId);
      expect(task).not.toHaveProperty("error");
    } finally {
      await h.cleanup();
    }
  });

  it("keeps the job running until cancellation cleanup has settled", async () => {
    const gate: { release?: () => void } = {};
    const cleanup = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    let aborted = false;
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
          task.onProgress(0.5);
          await new Promise<void>((resolve) =>
            task.signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                resolve();
              },
              { once: true },
            ),
          );
          await cleanup;
          const error = new Error("Cancelled");
          error.name = "AbortError";
          throw error;
        },
        async remove() {},
      },
    });
    try {
      const { jobId } = (await h.post("/api/speech/install", {})).json<{ jobId: string }>();
      await vi.waitFor(async () =>
        expect(
          (await h.req("/api/state")).json<StateResponse>().jobs.find((job) => job.id === jobId)
            ?.progress,
        ).toBe(0.5),
      );
      expect((await h.post(`/api/jobs/${jobId}/cancel`, {})).json()).toEqual({ cancelled: true });
      await vi.waitFor(() => expect(aborted).toBe(true));
      const waiting = (await h.req("/api/state"))
        .json<StateResponse>()
        .jobs.find((job) => job.id === jobId);
      expect(waiting?.status).toBe("running");
      expect(waiting).not.toHaveProperty("cancelled");
      gate.release?.();
      await vi.waitFor(async () =>
        expect(
          (await h.req("/api/state")).json<StateResponse>().jobs.find((job) => job.id === jobId),
        ).toMatchObject({ status: "error", cancelled: true }),
      );
    } finally {
      gate.release?.();
      await h.cleanup();
    }
  });

  it.each(["success", "failure"] as const)(
    "preserves a real %s after cancellation was requested",
    async (outcome) => {
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
            task.onProgress(0.5);
            await new Promise<void>((resolve) =>
              task.signal.addEventListener("abort", () => resolve(), { once: true }),
            );
            if (outcome === "failure") throw new Error("Cancelled");
          },
          async remove() {},
        },
      });
      try {
        const response = await h.post("/api/speech/install", {});
        const { jobId } = response.json<{ jobId: string }>();
        await vi.waitFor(async () =>
          expect(
            (await h.req("/api/state")).json<StateResponse>().jobs.find((job) => job.id === jobId)
              ?.progress,
          ).toBe(0.5),
        );
        expect((await h.post(`/api/jobs/${jobId}/cancel`, {})).json()).toEqual({ cancelled: true });
        await vi.waitFor(async () =>
          expect(
            (await h.req("/api/state")).json<StateResponse>().jobs.find((job) => job.id === jobId)
              ?.status,
          ).not.toBe("running"),
        );
        const state = (await h.req("/api/state")).json<StateResponse>();
        const job = state.jobs.find((item) => item.id === jobId);
        const task = state.tasks?.find((item) => item.id === jobId);
        expect(job?.status).toBe(outcome === "success" ? "done" : "error");
        expect(job).not.toHaveProperty("cancelled");
        expect(task?.status).toBe(outcome === "success" ? "completed" : "failed");
      } finally {
        await h.cleanup();
      }
    },
  );
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
