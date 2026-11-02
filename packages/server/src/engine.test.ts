// Engine-level ordering tests that need no HTTP: a manual edit must never run inside an AI run.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderStatus } from "@dax/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Engine } from "./engine.js";
import type { LocalModelController, ProviderRegistry } from "./interfaces.js";
import { createLogger } from "./logger.js";
import { NullLocalModelController, NullProviderRegistry, ScriptedRunner } from "./stubs.js";

const dirs: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** A started engine on a fresh data folder, with an AI runner that answers at once. */
async function makeEngine(
  localModel: LocalModelController = new NullLocalModelController(),
  providers: ProviderRegistry = new NullProviderRegistry(),
  runner: ScriptedRunner = new ScriptedRunner(),
): Promise<Engine> {
  const dir = await mkdtemp(join(tmpdir(), "dax-engine-"));
  dirs.push(dir);
  const engine = new Engine({
    dataDir: dir,
    allowedRoots: [dir],
    runner,
    providers,
    localModel,
    log: createLogger(() => undefined),
    emit: () => undefined,
    hasListeners: () => false,
  });
  await engine.init();
  return engine;
}

describe("Engine ordering of manual edits and AI runs", () => {
  it.each(["start", "stop", "uninstall"] as const)(
    "rejects local chat during %s and recovers afterward",
    async (operation) => {
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const model: LocalModelController = {
        status: async () => ({ installed: true, running: true, detail: "fake" }),
        install: async () => {},
        start: async () => (operation === "start" ? gate : undefined),
        stop: async () => (operation === "stop" ? gate : undefined),
        uninstall: async () => (operation === "uninstall" ? gate : undefined),
      };
      const engine = await makeEngine(model);
      let pending: Promise<void> | undefined;
      try {
        await engine.updateSettings({ activeProvider: "local", providers: {} });
        const before = await engine.buildState();
        const jobId = operation === "start" ? engine.startLocalModel() : undefined;
        if (operation === "stop") pending = engine.stopLocalModel();
        if (operation === "uninstall") pending = engine.uninstallLocalModel();
        const during = await engine.buildState();
        expect(during.providerContextVersion).not.toBe(before.providerContextVersion);
        expect(() => engine.startChat("during transition")).toThrow(/local.*changing/i);
        expect(
          (await engine.buildState()).tasks?.some((task) => task.title === "during transition"),
        ).toBe(false);
        release();
        if (jobId)
          await vi.waitFor(() =>
            expect(engine.jobs.list().find((job) => job.id === jobId)?.status).toBe("done"),
          );
        await pending;
        await vi.waitFor(async () =>
          expect((await engine.buildState()).providerContextVersion).not.toBe(
            during.providerContextVersion,
          ),
        );
        expect(() =>
          engine.startChat("stale", {
            expectedProjectId: before.projectId,
            expectedProviderEpoch: before.providerContextVersion,
          }),
        ).toThrow(/configuration changed/i);
      } finally {
        release();
        await pending;
        await engine.shutdown();
      }
    },
  );

  it("protects active and queued local chats from explicit model changes", async () => {
    const runner = new ScriptedRunner([{ type: "until_aborted" }]);
    const engine = await makeEngine(undefined, undefined, runner);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {} });
      engine.startChat("active");
      engine.startChat("queued", { queue: true });
      expect(() => engine.installLocalModel()).toThrow(/local assistant tasks/i);
      expect(() => engine.startLocalModel()).toThrow(/local assistant tasks/i);
      await expect(engine.stopLocalModel()).rejects.toThrow(/local assistant tasks/i);
    } finally {
      await engine.shutdown();
    }
  });

  it("protects a queued local chat even after switching to a hosted provider", async () => {
    const runner = new ScriptedRunner([{ type: "until_aborted" }]);
    const engine = await makeEngine(undefined, undefined, runner);
    try {
      await engine.updateSettings({ activeProvider: "openrouter", providers: {} });
      engine.startChat("hosted active");
      await engine.updateSettings({ activeProvider: "local", providers: {} });
      const queued = engine.startChat("local queued", { queue: true });
      await engine.updateSettings({ activeProvider: "openrouter", providers: {} });
      expect(() => engine.startLocalModel()).toThrow(/local assistant tasks/i);
      expect(engine.cancelTask(queued)).toBe(true);
      expect(() => engine.startLocalModel()).not.toThrow();
    } finally {
      await engine.shutdown();
    }
  });

  it("clears the model transition after an explicit stop fails", async () => {
    const model = new NullLocalModelController();
    vi.spyOn(model, "stop").mockRejectedValueOnce(new Error("synthetic stop failure"));
    const engine = await makeEngine(model);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {} });
      const before = await engine.buildState();
      await expect(engine.stopLocalModel()).rejects.toThrow("synthetic stop failure");
      const after = await engine.buildState();
      expect(after.providerContextVersion).not.toBe(before.providerContextVersion);
      expect(() => engine.startChat("after failure")).not.toThrow();
    } finally {
      await engine.shutdown();
    }
  });

  it("clears the model transition after cancelling an installation", async () => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const model: LocalModelController = {
      status: async () => ({ installed: false, running: false, detail: "fake" }),
      install: async (_id, task) =>
        new Promise<void>((_resolve, reject) => {
          entered();
          task.signal.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          });
        }),
      start: async () => {},
      stop: async () => {},
    };
    const engine = await makeEngine(model);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {} });
      const id = engine.installLocalModel();
      await started;
      expect(engine.cancelLocalTask()).toBe(true);
      await vi.waitFor(() =>
        expect(engine.jobs.list().find((job) => job.id === id)?.status).toBe("error"),
      );
      await Promise.resolve();
      expect(() => engine.startChat("after cancel")).not.toThrow();
    } finally {
      await engine.shutdown();
    }
  });

  it("blocks local chat during asynchronous idle unload and accepts it afterward", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = new NullLocalModelController();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(model, "stop").mockImplementationOnce(async () => gate);
    const engine = await makeEngine(model);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {}, localIdleMinutes: 1 });
      const before = await engine.buildState();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(() => engine.startChat("while unloading")).toThrow(/local.*changing/i);
      release();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect((await engine.buildState()).providerContextVersion).not.toBe(
        before.providerContextVersion,
      );
      expect(() => engine.startChat("after unload")).not.toThrow();
    } finally {
      release();
      await engine.shutdown();
    }
  });

  it("allows a fresh hosted chat while a local installation is pending", async () => {
    const model = new NullLocalModelController();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(model, "install").mockImplementation(async () => gate);
    const engine = await makeEngine(model);
    try {
      engine.installLocalModel("example");
      await engine.updateSettings({ activeProvider: "openrouter", providers: {} });
      const current = await engine.buildState();
      expect(() =>
        engine.startChat("hosted", {
          expectedProjectId: current.projectId,
          expectedProviderEpoch: current.providerContextVersion,
        }),
      ).not.toThrow();
    } finally {
      release();
      await engine.shutdown();
    }
  });

  it("rejects local chat while a model installation is changing its context", async () => {
    const model = new NullLocalModelController();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(model, "install").mockImplementation(async () => gate);
    const engine = await makeEngine(model);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {} });
      const before = await engine.buildState();
      engine.installLocalModel("different-model");
      expect(() =>
        engine.startChat("during installation", {
          expectedProjectId: before.projectId,
          expectedProviderEpoch: before.providerContextVersion,
        }),
      ).toThrow(/assistant.*changing|local.*(changing|progress)/i);
      expect(
        (await engine.buildState()).tasks?.some((t) => t.title === "during installation"),
      ).toBe(false);
    } finally {
      release();
      await engine.shutdown();
    }
  });
  it("rejects chat while provider settings are being saved", async () => {
    const engine = await makeEngine();
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = engine.settings.set.bind(engine.settings);
    vi.spyOn(engine.settings, "set").mockImplementation(async (settings, connections) => {
      entered?.();
      await gate;
      return original(settings, connections);
    });
    const saving = engine.updateSettings(engine.settings.get());
    try {
      await started;
      expect(() => engine.startChat("during save")).toThrow(/assistant.*changing/i);
    } finally {
      release?.();
      await saving;
      await engine.shutdown();
    }
  });
  it("rejects chat while a project replacement is already in progress", async () => {
    const engine = await makeEngine();
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const switching = engine.withIdleProject(async () => {
      entered?.();
      await gate;
      await engine.projects.createNew({ name: "Second" });
    });
    try {
      await started;
      expect(() => engine.startChat("during switch")).toThrow(
        /project.*(changing|switch|progress)/i,
      );
    } finally {
      release?.();
      await switching;
      await engine.shutdown();
    }
  });
  it("captures current edits and completed jobs after a slow provider check", async () => {
    let finish: (value: ProviderStatus[]) => void = () => {
      throw new Error("Provider resolver missing");
    };
    const pending = new Promise<ProviderStatus[]>((resolve) => {
      finish = resolve;
    });
    const engine = await makeEngine(undefined, { list: () => pending });
    try {
      const job = engine.jobs.create("export", "Review");
      const snapshot = engine.buildState();
      await engine.runCommand("set_format", { width: 640, height: 360 });
      job.done();
      finish([]);
      const state = await snapshot;
      expect(state.jobs.find((item) => item.id === job.id)?.status).toBe("done");
      expect(state.project.timeline.width).toBe(640);
    } finally {
      finish([]);
      await engine.shutdown();
    }
  });
  it("unloads inference after the configured idle interval and clears its timer on shutdown", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = new NullLocalModelController();
    const stop = vi.spyOn(model, "stop");
    const engine = await makeEngine(model);
    try {
      await engine.updateSettings({ activeProvider: "local", providers: {}, localIdleMinutes: 1 });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(stop).toHaveBeenCalledTimes(1);
      await engine.shutdown();
      const calls = stop.mock.calls.length;
      await vi.advanceTimersByTimeAsync(600_000);
      expect(stop).toHaveBeenCalledTimes(calls);
    } finally {
      await engine.shutdown();
    }
  });
  it("refuses a manual edit that was requested before an AI run started but ran after it", async () => {
    const engine = await makeEngine();
    const widthBefore = engine.projects.session.project.timeline.width;

    // The edit is accepted first; the AI run starts before the edit gets its turn in the queue.
    const edit = engine.runCommand("set_format", { preset: "square-1080" });
    engine.startChat("make it square");
    const r = await edit;

    // Before the fix the edit checked for a run only when it was requested, so it applied during the run.
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining("AI edit is in progress") });
    expect(engine.projects.session.project.timeline.width).toBe(widthBefore);
    await engine.shutdown();
  });

  it("lets an edit that was queued before the run finish before the run starts", async () => {
    const engine = await makeEngine();
    const first = engine.runCommand("set_format", { preset: "square-1080" });
    const done = await first;
    expect(done.ok).toBe(true);
    engine.startChat("hello");
    await new Promise((r) => setTimeout(r, 50));
    expect(engine.busy).toBe(false);
    await engine.shutdown();
  });
});
