// Engine-owned chat ordering, mode capture, cancellation and durable task status over the real API.
import { readFile } from "node:fs/promises";
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { startHarness } from "./test/harness.js";

describe("chat task queue", () => {
  it("marks queued work interrupted on engine restart without executing it", async () => {
    const first = await startHarness({
      agentRunner: {
        async run(_message, ctx) {
          await new Promise<void>((resolve) =>
            ctx.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
      },
    });
    try {
      await first.post("/api/chat", { message: "running" });
      await first.post("/api/chat", { message: "queued", queue: true });
      await first.server.close();
      const called = vi.fn();
      const second = await startHarness({
        dataDir: first.dataDir,
        agentRunner: {
          async run() {
            called();
          },
        },
      });
      try {
        const state = (await second.req("/api/state")).json<StateResponse>();
        expect(state.tasks?.find((task) => task.title === "queued")?.status).toBe("interrupted");
        expect(state.busy).toBe(false);
        expect(called).not.toHaveBeenCalled();
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });
  it("queues FIFO, captures modes, cancels queued work and persists results", async () => {
    const started: string[] = [];
    const modes: Array<string | undefined> = [];
    let release: (() => void) | undefined;
    const h = await startHarness({
      agentRunner: (env) => ({
        async run(message, ctx) {
          modes.push(env.mode);
          started.push(message);
          if (message === "first")
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          ctx.onEvent({ type: "done", turns: 1 });
        },
      }),
    });
    try {
      await h.post("/api/chat", { message: "first" });
      await vi.waitFor(() => expect(started).toEqual(["first"]));
      const second = (
        await h.post("/api/chat", { message: "second", mode: "plan", queue: true })
      ).json<{ runId: string }>();
      await h.post("/api/chat", { message: "third", queue: true });
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect(before.tasks?.filter((task) => task.status === "queued")).toHaveLength(2);
      await h.post(`/api/tasks/${second.runId}/cancel`, {});
      release?.();
      await vi.waitFor(async () =>
        expect((await h.req("/api/state")).json<StateResponse>().busy).toBe(false),
      );
      expect(started).toEqual(["first", "third"]);
      expect(modes).toEqual(["edit", "edit"]);
      await h.server.close();
      expect(JSON.parse(await readFile(`${h.dataDir}/tasks.json`, "utf8"))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "second", mode: "plan", status: "cancelled" }),
        ]),
      );
    } finally {
      release?.();
      await h.cleanup();
    }
  });
  it("steers next after cancellation and retains an older queued request", async () => {
    const started: string[] = [];
    const h = await startHarness({
      agentRunner: {
        async run(message, ctx) {
          started.push(message);
          if (message === "first")
            await new Promise<void>((resolve) =>
              ctx.signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          ctx.onEvent({ type: "done", turns: 1 });
        },
      },
    });
    try {
      await h.post("/api/chat", { message: "first" });
      await vi.waitFor(() => expect(started).toEqual(["first"]));
      await h.post("/api/chat", { message: "later", queue: true });
      await h.post("/api/chat", { message: "steering", steer: true, mode: "plan" });
      await vi.waitFor(() => expect(started).toEqual(["first", "steering", "later"]));
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.tasks?.find((task) => task.title === "first")?.status).toBe("cancelled");
    } finally {
      await h.cleanup();
    }
  });
});
