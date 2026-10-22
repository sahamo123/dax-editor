// Engine-owned chat ordering, mode capture, cancellation and durable task status over the real API.
import { readFile } from "node:fs/promises";
import type { StateResponse } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { startHarness } from "./test/harness.js";

describe("chat task queue", () => {
  it("captures the provider at submission even if settings change before dispatch", async () => {
    const providers: string[] = [];
    let release: (() => void) | undefined;
    const h = await startHarness({
      agentRunner: (env) => ({
        async run(message) {
          providers.push(env.settings.activeProvider);
          if (message === "first")
            await new Promise<void>((resolve) => {
              release = resolve;
            });
        },
      }),
    });
    try {
      await h.post("/api/chat", { message: "first" });
      await vi.waitFor(() => expect(providers).toHaveLength(1));
      await h.post("/api/chat", { message: "second", queue: true });
      await h.post("/api/settings", { activeProvider: "openrouter", providers: {} });
      release?.();
      await vi.waitFor(() => expect(providers).toHaveLength(2));
      expect(providers).toEqual(["local", "local"]);
    } finally {
      release?.();
      await h.cleanup();
    }
  });

  it("preserves manual work and refuses a stale AI edit at its next tool boundary", async () => {
    let release: (() => void) | undefined;
    let attempted = false;
    const h = await startHarness({
      agentRunner: {
        supportsManualEdits: true,
        async run(_message, ctx) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          const result = await ctx.executeCommand?.(
            { session: ctx.session, source: "ai" },
            "set_format",
            { width: 720, height: 1280 },
          );
          attempted = true;
          expect(result?.ok).toBe(false);
        },
      },
    });
    try {
      await h.post("/api/chat", { message: "portrait" });
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      const before = (await h.req("/api/state")).json<StateResponse>();
      expect((await h.command("set_format", { width: 1080, height: 1080 })).ok).toBe(true);
      release?.();
      await vi.waitFor(() => expect(attempted).toBe(true));
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.project.timeline.width).toBe(1080);
      expect(state.project.timeline.height).toBe(1080);
      expect(state.revision).toBeGreaterThan(before.revision ?? -1);
      expect(state.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            origin: "manual",
            status: "completed",
            startStateId: 0,
            endStateId: 1,
          }),
          expect.objectContaining({
            origin: "ai",
            status: "failed",
            error: expect.stringContaining("Manual work changed"),
          }),
        ]),
      );
    } finally {
      release?.();
      await h.cleanup();
    }
  });

  it("rejects stale manual commands even after undo returns to an earlier history state", async () => {
    const h = await startHarness();
    try {
      const first = (await h.req("/api/state")).json<StateResponse>();
      await h.command("set_format", { width: 1080, height: 1080 });
      await h.command("undo");
      const stale = await h.post("/api/command", {
        name: "set_format",
        args: { width: 720, height: 1280 },
        expectedRevision: first.revision,
        projectId: first.projectId,
      });
      expect(stale.json()).toMatchObject({
        ok: false,
        error: expect.stringContaining("project changed"),
      });
      const current = (await h.req("/api/state")).json<StateResponse>();
      expect(current.revision).toBe(2);
    } finally {
      await h.cleanup();
    }
  });
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
  it("steers within the active run without cancelling it and retains older queued work", async () => {
    const started: string[] = [];
    const guidance: string[] = [];
    let proceed: (() => void) | undefined;
    let aborted = false;
    const h = await startHarness({
      agentRunner: {
        async run(message, ctx) {
          started.push(message);
          if (message === "first")
            await new Promise<void>((resolve) => {
              proceed = resolve;
            });
          aborted ||= ctx.signal.aborted;
          guidance.push(...(ctx.takeSteering?.() ?? []));
          ctx.onEvent({ type: "done", turns: 1 });
        },
      },
    });
    try {
      await h.post("/api/chat", { message: "first" });
      await vi.waitFor(() => expect(started).toEqual(["first"]));
      await h.post("/api/chat", { message: "later", queue: true });
      await h.post("/api/chat", { message: "steering", steer: true, mode: "edit" });
      expect(started).toEqual(["first"]);
      proceed?.();
      await vi.waitFor(() => expect(started).toEqual(["first", "later"]));
      expect(guidance).toEqual(["steering"]);
      expect(aborted).toBe(false);
      const state = (await h.req("/api/state")).json<StateResponse>();
      expect(state.tasks?.find((task) => task.title === "first")?.status).toBe("completed");
      expect(state.tasks?.find((task) => task.title === "steering")?.status).toBe("completed");
    } finally {
      proceed?.();
      await h.cleanup();
    }
  });
});
