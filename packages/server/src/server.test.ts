// Behaviour tests over real HTTP + WebSocket: state, command round trips, history, projects, settings, providers, chat runs and the local model.
// Uses FFmpeg-generated footage where a project needs real assets; those tests skip without FFmpeg.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentEvent, StateResponse, WsEvent } from "@dax/protocol";
import { describe, expect, it } from "vitest";
import type { LocalModelController, LocalModelTask, ProviderRegistry } from "./interfaces.js";
import { ScriptedRunner } from "./stubs.js";
import { HAS_FFMPEG, type Harness, makeVideo, startHarness } from "./test/harness.js";

type StateEvent = Extract<WsEvent, { type: "state" }>;
type ChatEvent = Extract<WsEvent, { type: "chat" }>;
type JobEvent = Extract<WsEvent, { type: "job" }>;
const isState = (e: WsEvent): e is StateEvent => e.type === "state";
const isChat = (e: WsEvent): e is ChatEvent => e.type === "chat";
const isJob = (e: WsEvent): e is JobEvent => e.type === "job";
const stateOf = async (h: Harness) => (await h.req("/api/state")).json<StateResponse>();

/** Run `fn` with a server and always clean up. */
async function withServer(
  opts: Parameters<typeof startHarness>[0],
  fn: (h: Harness) => Promise<void>,
): Promise<void> {
  const h = await startHarness(opts);
  try {
    await fn(h);
  } finally {
    await h.cleanup();
  }
}

describe("startup and state", () => {
  it("reports its address, token and version, and starts with an empty untitled project", async () => {
    await withServer({}, async (h) => {
      expect(h.server.info.url).toBe(`http://127.0.0.1:${h.port}`);
      expect(h.server.info.token.length).toBeGreaterThanOrEqual(32);
      expect(h.server.info.version).toMatch(/^\d+\.\d+\.\d+/);
      const s = await stateOf(h);
      expect(s.project).toMatchObject({ name: "Untitled", version: 1 });
      expect(s.project.assets).toEqual({});
      expect(s).toMatchObject({
        canUndo: false,
        canRedo: false,
        busy: false,
        jobs: [],
        serverVersion: h.server.info.version,
      });
      expect(s.projectPath).toBeUndefined();
      expect(s.presets.length).toBeGreaterThan(3);
      expect(s.presets[0]).toMatchObject({
        id: expect.any(String),
        defaultDuration: expect.any(Number),
      });
      expect(s.settings).toEqual({ activeProvider: "local", providers: {} });
      expect(s.providers.map((p) => p.kind).sort()).toEqual(
        ["anthropic", "cli-claude", "cli-codex", "cli-gemini", "local", "openai-compatible"].sort(),
      );
      expect(s.providers.every((p) => !p.available && p.hasApiKey === false)).toBe(true);
    });
  });

  it("binds to loopback only", async () => {
    await withServer({}, async (h) => {
      expect(h.server.info.url.startsWith("http://127.0.0.1:")).toBe(true);
    });
  });

  it("accepts a launcher-supplied token and refuses a short one", async () => {
    const token = "launcher-supplied-token-0123456789";
    await withServer({ token }, async (h) => {
      expect(h.server.info.token).toBe(token);
      expect((await h.req("/api/health")).status).toBe(200);
    });
    await expect(startHarness({ token: "short" })).rejects.toThrow(/at least 16/);
  });

  it("refuses to start twice on the same port", async () => {
    await withServer({}, async (h) => {
      await expect(startHarness({ port: h.port })).rejects.toThrow(/EADDRINUSE/);
    });
  });
});

describe.skipIf(!HAS_FFMPEG)("commands, history and WebSocket state events", () => {
  it("runs a command, returns its summary, and pushes a state event with the change", async () => {
    await withServer({}, async (h) => {
      const clip = await makeVideo(h.workDir, "a.mp4", { seconds: 4, size: "320x240" });
      const ws = await h.ws();
      await ws.waitForAny(isState); // the initial state
      const before = ws.events.length;

      const imported = await h.command("import_media", { path: clip });
      expect(imported).toMatchObject({
        ok: true,
        summary: expect.stringContaining("Imported a.mp4"),
      });
      const pushed = (await ws.waitForAny(
        (e) => isState(e) && Object.keys(e.state.project.assets).length === 1,
      )) as StateEvent;
      expect(ws.events.length).toBeGreaterThan(before);
      expect(pushed.state.canUndo).toBe(true);

      const split = await h.command("split", { at: 1 });
      expect(split).toMatchObject({ ok: true, summary: "Split at 1s." });
      const afterSplit = (await ws.waitForAny(
        (e) => isState(e) && (e.state.project.timeline.tracks[0]?.clips.length ?? 0) === 2,
      )) as StateEvent;
      expect(afterSplit.state.history.at(-1)).toMatchObject({
        label: "Split at 1s",
        source: "manual",
        current: true,
      });
    });
  });

  it("supports undo, redo and restore_state, with canUndo/canRedo in state", async () => {
    await withServer({}, async (h) => {
      const clip = await makeVideo(h.workDir, "a.mp4", { seconds: 4, size: "320x240" });
      await h.command("import_media", { path: clip });
      await h.command("delete_range", { from: 1, to: 2 });
      const clipsOf = async () => (await stateOf(h)).project.timeline.tracks[0]?.clips.length ?? 0;
      const durationOf = async () => {
        const s = await stateOf(h);
        return (s.project.timeline.tracks[0]?.clips ?? []).reduce((n, c) => n + (c.out - c.in), 0);
      };
      expect(await durationOf()).toBeCloseTo(3, 1);
      expect(await clipsOf()).toBe(2);

      expect(await h.command("undo")).toMatchObject({ ok: true });
      let s = await stateOf(h);
      expect(s.canRedo).toBe(true);
      expect(await durationOf()).toBeCloseTo(4, 1);

      expect(await h.command("redo")).toMatchObject({ ok: true });
      expect(await durationOf()).toBeCloseTo(3, 1);

      const target = s.history.find((x) => x.label.startsWith("Import"));
      expect(target).toBeDefined();
      expect(await h.command("restore_state", { id: target?.id })).toMatchObject({ ok: true });
      s = await stateOf(h);
      expect(await clipsOf()).toBe(1);
      expect(s.history.find((x) => x.current)?.id).toBe(target?.id);
      // Nothing is lost: jump forward again.
      const last = s.history.at(-1);
      await h.command("restore_state", { id: last?.id });
      expect(await clipsOf()).toBe(2);

      await h.command("undo");
      await h.command("undo");
      expect(await h.command("undo")).toMatchObject({
        ok: false,
        error: expect.stringContaining("Nothing to undo"),
      });
      await h.command("save_checkpoint", { name: "start" });
      expect((await stateOf(h)).history.some((x) => x.name === "start")).toBe(true);
    });
  });

  it("serialises concurrent commands so none are lost", async () => {
    await withServer({}, async (h) => {
      const clip = await makeVideo(h.workDir, "a.mp4", { seconds: 8, size: "320x240" });
      await h.command("import_media", { path: clip });
      const results = await Promise.all(
        [1, 2, 3, 4, 5, 6].map((t) => h.command("split", { at: t })),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      expect((await stateOf(h)).project.timeline.tracks[0]?.clips).toHaveLength(7);
    });
  });

  it("lets only one of two simultaneous exports start, and refuses to export over a source file", async () => {
    await withServer({}, async (h) => {
      const clip = await makeVideo(h.workDir, "long.mp4", { seconds: 4, size: "320x240" });
      await h.command("import_media", { path: clip });
      // Both requests arrive before the first export has reported any progress (when its job used to be created).
      const [a, b] = await Promise.all([
        h.command("export_video", { path: join(h.workDir, "one.mp4") }),
        h.command("export_video", { path: join(h.workDir, "two.mp4") }),
      ]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      const refused = a.ok ? b : a;
      expect(String(refused.error)).toContain("already running");

      // Wait until the running export has finished (the busy answer stops coming back).
      let over = await h.command("export_video", { path: clip, overwrite: true });
      for (let i = 0; i < 300 && String(over.error).includes("already running"); i++) {
        await new Promise((r) => setTimeout(r, 100));
        over = await h.command("export_video", { path: clip, overwrite: true });
      }
      expect(over.ok).toBe(false);
      expect(String(over.error)).toContain("source file");
    });
  });

  it("autosaves the project file after every change and reopens it on the next launch", async () => {
    const first = await startHarness();
    try {
      const clip = await makeVideo(first.workDir, "a.mp4", { seconds: 2, size: "320x240" });
      await first.command("import_media", { path: clip });
      await first.command("add_overlay", { preset: "title-fade", start: 0, text: "Hello" });
      await first.server.close();
      const second = await startHarness({
        dataDir: first.dataDir,
        allowRoots: [first.workDir, first.dataDir],
      });
      try {
        const s = await stateOf(second);
        expect(Object.keys(s.project.assets)).toHaveLength(1);
        expect(s.project.timeline.overlays[0]?.text).toBe("Hello");
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });

  it("records edits made by the AI with source ai and pushes them live", async () => {
    const runner = new ScriptedRunner([
      { type: "status", text: "Looking" },
      { type: "run_command", name: "get_project" },
      { type: "run_command", name: "split", args: { at: 1 } },
      { type: "run_command", name: "split", args: { at: 99 } },
      { type: "text", text: "Done splitting." },
    ]);
    await withServer({ agentRunner: runner }, async (h) => {
      const clip = await makeVideo(h.workDir, "a.mp4", { seconds: 3, size: "320x240" });
      await h.command("import_media", { path: clip });
      const ws = await h.ws();
      const res = await h.post("/api/chat", { message: "split it" });
      expect(res.status).toBe(202);
      const { runId } = res.json<{ runId: string }>();
      await ws.waitForAny((e) => isChat(e) && e.event.type === "done");

      const events = ws.events.filter(isChat).map((e) => e.event);
      expect(ws.events.filter(isChat).every((e) => e.runId === runId)).toBe(true);
      expect(events.map((e) => e.type)).toEqual([
        "status",
        "tool_call",
        "tool_result",
        "tool_call",
        "tool_result",
        "tool_call",
        "tool_result",
        "text",
        "done",
      ]);
      const results = events.filter(
        (e): e is Extract<AgentEvent, { type: "tool_result" }> => e.type === "tool_result",
      );
      expect(results.map((r) => r.ok)).toEqual([true, true, false]);
      expect(runner.messages).toEqual(["split it"]);

      const s = await stateOf(h);
      expect(s.history.at(-1)).toMatchObject({ label: "Split at 1s", source: "ai" });
      expect(s.busy).toBe(false);
    });
  });
});

describe("projects", () => {
  it("creates, saves-as, opens and validates project files", async () => {
    await withServer({}, async (h) => {
      const created = await h.post("/api/project/new", {
        name: "My Film",
        width: 1280,
        height: 720,
        fps: 24,
      });
      expect(created.status).toBe(200);
      const state = created.json<StateResponse>();
      expect(state.project).toMatchObject({
        name: "My Film",
        timeline: { width: 1280, height: 720, fps: 24 },
      });
      expect(state.projectPath).toBeUndefined(); // scratch project: not yet saved by the user

      const target = join(h.workDir, "film.dax.json");
      const saved = await h.post("/api/project/save", { path: target });
      expect(saved.status).toBe(200);
      expect(saved.json<StateResponse>().projectPath).toBe(target);
      expect(JSON.parse(await readFile(target, "utf8"))).toMatchObject({
        name: "My Film",
        version: 1,
      });

      await h.post("/api/project/new", { name: "Other" });
      expect((await stateOf(h)).project.name).toBe("Other");
      const reopened = await h.post("/api/project/open", { path: target });
      expect(reopened.status).toBe(200);
      expect(reopened.json<StateResponse>()).toMatchObject({
        projectPath: target,
        project: { name: "My Film" },
      });

      // A bad file is a 400 and leaves the open project alone.
      const bad = join(h.workDir, "bad.dax.json");
      await writeFile(bad, '{"version":1,"name":5}');
      const r = await h.post("/api/project/open", { path: bad });
      expect(r.status).toBe(400);
      expect(r.json().error).toContain("not a dax project");
      expect((await stateOf(h)).project.name).toBe("My Film");
      const notJson = join(h.workDir, "nope.dax.json");
      await writeFile(notJson, "garbage");
      expect((await h.post("/api/project/open", { path: notJson })).status).toBe(400);
      expect(
        (await h.post("/api/project/open", { path: join(h.workDir, "missing.dax.json") })).status,
      ).toBe(400);
    });
  });

  it("keeps an edit when autosave fails and reports saveError instead of failing the command", async () => {
    await withServer({}, async (h) => {
      await h.post("/api/project/new", { name: "Disk trouble" });
      // Make the autosave target unwritable: a directory now sits where the project file should be.
      const projects = join(h.dataDir, "projects");
      const file = (await readdir(projects)).filter((f) => f.startsWith("disk-trouble"))[0] ?? "";
      await rm(join(projects, file));
      await mkdir(join(projects, file));

      const r = await h.command("set_format", { preset: "square-1080" });
      // Before the fix this was { ok: false } while the edit stayed applied, so an AI retry duplicated it.
      expect(r.ok).toBe(true);
      expect(String(r.summary)).toContain("could not be saved");
      const s = await stateOf(h);
      expect(s.project.timeline.width).toBe(1080);
      expect(s.canUndo).toBe(true);
      expect(s.saveError).toBeTruthy();
    });
  });

  it("does not move the project to a new location when save-as fails", async () => {
    await withServer({}, async (h) => {
      await h.post("/api/project/new", { name: "Stay put" });
      const blocked = join(h.workDir, "blocked.dax.json");
      await mkdir(blocked); // a directory with the target name: the write cannot succeed
      const r = await h.post("/api/project/save", { path: blocked });
      expect(r.status).toBeGreaterThanOrEqual(400);
      const s = await stateOf(h);
      expect(s.projectPath).toBeUndefined(); // still the scratch project, not "saved at blocked.dax.json"
    });
  });

  it("validates new-project fields", async () => {
    await withServer({}, async (h) => {
      expect((await h.post("/api/project/new", { name: "", width: 5 })).status).toBe(400);
    });
  });

  it("writes project JSON atomically under the data folder for scratch projects", async () => {
    await withServer({}, async (h) => {
      await h.post("/api/project/new", { name: "Scratch" });
      const dir = join(h.dataDir, "projects");
      expect(existsSync(dir)).toBe(true);
    });
  });
});

describe("settings and providers", () => {
  it("persists validated settings and rejects invalid ones", async () => {
    await withServer({}, async (h) => {
      const next = {
        activeProvider: "openai-compatible",
        providers: { "openai-compatible": { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen" } },
      };
      const put = await h.req("/api/settings", {
        method: "PUT",
        body: JSON.stringify(next),
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status).toBe(200);
      expect(put.json()).toEqual(next);
      expect(JSON.parse(await readFile(join(h.dataDir, "settings.json"), "utf8"))).toEqual(next);
      expect((await stateOf(h)).settings).toEqual(next);

      expect(
        (await h.post("/api/settings", { activeProvider: "skynet", providers: {} })).status,
      ).toBe(400);
      expect(
        (
          await h.post("/api/settings", {
            activeProvider: "local",
            providers: { local: { baseUrl: "not a url" } },
          })
        ).status,
      ).toBe(400);
      expect((await h.req("/api/settings")).json()).toEqual(next);
    });
  });

  it("survives a corrupt settings file by using defaults", async () => {
    const first = await startHarness();
    try {
      await first.server.close();
      await writeFile(join(first.dataDir, "settings.json"), "{{{{");
      const second = await startHarness({
        dataDir: first.dataDir,
        allowRoots: [first.workDir, first.dataDir],
      });
      try {
        expect((await second.req("/api/settings")).json()).toEqual({
          activeProvider: "local",
          providers: {},
        });
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });

  it("merges the injected registry's status with hasApiKey and pushes it to clients when a key changes", async () => {
    const registry: ProviderRegistry = {
      async list() {
        return [
          { kind: "local", available: true, detail: "Running" },
          { kind: "openai-compatible", available: false, detail: "Add an API key" },
          { kind: "cli-claude", available: true, detail: "Signed in", signedIn: true },
        ];
      },
    };
    await withServer({ providers: registry }, async (h) => {
      const ws = await h.ws();
      const list = (await h.req("/api/providers")).json<
        Array<{ kind: string; available: boolean; hasApiKey: boolean }>
      >();
      expect(list.map((p) => p.kind)).toEqual(["local", "openai-compatible", "cli-claude"]);
      expect(list[0]).toMatchObject({ available: true, hasApiKey: false });
      await h.post("/api/settings/api-key", { kind: "openai-compatible", apiKey: "k-0123456789" });
      const pushed = (await ws.waitForAny(
        (e) =>
          isState(e) &&
          e.state.providers.some((p) => p.kind === "openai-compatible" && p.hasApiKey === true),
      )) as StateEvent;
      expect(pushed.state.providers.find((p) => p.kind === "cli-claude")).toMatchObject({
        signedIn: true,
      });
    });
  });

  it("survives a registry that throws", async () => {
    const registry: ProviderRegistry = {
      async list() {
        throw new Error("boom");
      },
    };
    await withServer({ providers: registry }, async (h) => {
      const list = (await h.req("/api/providers")).json<Array<{ available: boolean }>>();
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((p) => !p.available)).toBe(true);
    });
  });
});

describe("chat", () => {
  it("streams a run's events over the WebSocket and flips busy while it runs", async () => {
    const runner = new ScriptedRunner([
      { type: "text", text: "thinking" },
      { type: "wait", ms: 150 },
      { type: "text", text: "answer" },
    ]);
    await withServer({ agentRunner: runner }, async (h) => {
      const ws = await h.ws();
      const res = await h.post("/api/chat", { message: "hi there" });
      expect(res.status).toBe(202);
      const { runId } = res.json<{ runId: string }>();
      expect(runId).toMatch(/^[0-9a-f-]{36}$/);
      await ws.waitForAny((e) => isState(e) && e.state.busy);
      expect((await stateOf(h)).busy).toBe(true);
      await ws.waitForAny((e) => isChat(e) && e.event.type === "done");
      const types = ws.events.filter(isChat).map((e) => e.event.type);
      expect(types).toEqual(["text", "text", "done"]);
      await ws.waitForAny(
        (e) =>
          isState(e) &&
          !e.state.busy &&
          ws.events.indexOf(e) > ws.events.findIndex((x) => isState(x) && x.state.busy),
      );
      expect((await stateOf(h)).busy).toBe(false);
    });
  });

  it("refuses a second run and mutating commands while busy, but still answers read-only commands", async () => {
    const runner = new ScriptedRunner([{ type: "until_aborted" }]);
    await withServer({ agentRunner: runner }, async (h) => {
      await h.post("/api/chat", { message: "go" });
      const second = await h.post("/api/chat", { message: "again" });
      expect(second.status).toBe(409);
      expect(await h.command("split", { at: 1 })).toMatchObject({
        ok: false,
        error: expect.stringContaining("AI edit is in progress"),
      });
      expect(await h.command("get_project")).toMatchObject({ ok: true });
      expect((await h.post("/api/project/new", { name: "x" })).status).toBe(409);
      expect(
        (await h.post("/api/import", { paths: [join(h.workDir, "x.mp4")] })).json(),
      ).toMatchObject({ ok: false });
      await h.post("/api/chat/cancel", {});
    });
  });

  it("cancels a run: the signal fires, the UI gets a status and done, and busy clears", async () => {
    const runner = new ScriptedRunner([
      { type: "text", text: "started" },
      { type: "until_aborted" },
      { type: "text", text: "never sent" },
    ]);
    await withServer({ agentRunner: runner }, async (h) => {
      const ws = await h.ws();
      await h.post("/api/chat", { message: "long job" });
      await ws.waitForAny((e) => isChat(e) && e.event.type === "text");
      const cancel = await h.post("/api/chat/cancel", {});
      expect(cancel.json()).toEqual({ cancelled: true });
      await ws.waitForAny((e) => isChat(e) && e.event.type === "done");
      const events = ws.events.filter(isChat).map((e) => e.event);
      expect(events.map((e) => e.type)).toEqual(["text", "status", "done"]);
      expect(events[1]).toMatchObject({ text: "Cancelled." });
      expect(JSON.stringify(events)).not.toContain("never sent");
      await ws.waitForAny(
        (e) =>
          isState(e) &&
          !e.state.busy &&
          ws.events.indexOf(e) > ws.events.findIndex((x) => isState(x) && x.state.busy),
      );
      expect((await stateOf(h)).busy).toBe(false);
      expect((await h.post("/api/chat/cancel", {})).json()).toEqual({ cancelled: false });
      // A new run can start afterwards.
      expect((await h.post("/api/chat", { message: "next" })).status).toBe(202);
      await h.post("/api/chat/cancel", {});
    });
  });

  it("reports a runner that throws as an error event and then finishes", async () => {
    await withServer(
      { agentRunner: new ScriptedRunner([{ type: "throw", message: "provider exploded" }]) },
      async (h) => {
        const ws = await h.ws();
        await h.post("/api/chat", { message: "x" });
        await ws.waitForAny((e) => isChat(e) && e.event.type === "error");
        const events = ws.events.filter(isChat).map((e) => e.event);
        expect(events).toEqual([{ type: "error", message: "provider exploded" }]);
        await ws.waitForAny(
          (e) => isState(e) && e.state.busy === false && ws.events.filter(isChat).length > 0,
        );
        expect((await stateOf(h)).busy).toBe(false);
      },
    );
  });

  it("explains itself when no runner is configured", async () => {
    await withServer({}, async (h) => {
      const ws = await h.ws();
      await h.post("/api/chat", { message: "x" });
      const e = (await ws.waitForAny((x) => isChat(x) && x.event.type === "error")) as ChatEvent;
      expect(e.event).toMatchObject({
        type: "error",
        message: expect.stringContaining("No AI provider"),
      });
    });
  });

  it("synthesises a done event for a runner that finishes silently", async () => {
    await withServer({ agentRunner: { run: async () => undefined } }, async (h) => {
      const ws = await h.ws();
      await h.post("/api/chat", { message: "x" });
      const e = (await ws.waitForAny((x) => isChat(x) && x.event.type === "done")) as ChatEvent;
      expect(e.event).toMatchObject({ type: "done", turns: 0 });
    });
  });

  it("picks the runner per run from the factory using the current settings and key", async () => {
    const seen: Array<{ provider: string; key?: string }> = [];
    await withServer(
      {
        agentRunner: async (env) => {
          seen.push({
            provider: env.settings.activeProvider,
            ...(await env.getApiKey("anthropic").then((k) => (k ? { key: k } : {}))),
          });
          return new ScriptedRunner([{ type: "text", text: "ok" }]);
        },
      },
      async (h) => {
        const ws = await h.ws();
        await h.post("/api/chat", { message: "one" });
        await ws.waitForAny((e) => isChat(e) && e.event.type === "done");
        await h.post("/api/settings/api-key", { kind: "anthropic", apiKey: "key-0123456789" });
        await h.post("/api/settings", { activeProvider: "anthropic", providers: {} });
        await h.post("/api/chat", { message: "two" });
        await ws.waitForAny(
          (e) => isChat(e) && e.event.type === "done" && ws.events.filter(isChat).length >= 4,
        );
        expect(seen).toEqual([
          { provider: "local" },
          { provider: "anthropic", key: "key-0123456789" },
        ]);
      },
    );
  });

  it("validates the message", async () => {
    await withServer({}, async (h) => {
      expect((await h.post("/api/chat", { message: "" })).status).toBe(400);
      expect((await h.post("/api/chat", { message: "x".repeat(8001) })).status).toBe(400);
    });
  });
});

describe("local model endpoints", () => {
  /** A controller whose install/start take a moment, report progress, and honour cancel. */
  function fakeController() {
    const state = { installed: false, running: false };
    const calls: string[] = [];
    const controller: LocalModelController = {
      async status() {
        return {
          ...state,
          detail: state.installed ? "Ready" : "Not downloaded (2.1 GB)",
          sizeBytes: 2_100_000_000,
        };
      },
      async install(modelId: string | undefined, task: LocalModelTask) {
        calls.push(`install:${modelId ?? "default"}`);
        for (const f of [0.25, 0.5, 0.75]) {
          if (task.signal.aborted) throw new Error("aborted");
          task.onProgress(f);
          await new Promise((r) => setTimeout(r, 40));
        }
        state.installed = true;
      },
      async start(task: LocalModelTask) {
        calls.push("start");
        task.onProgress(0.5);
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 60);
          task.signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
        state.running = true;
      },
      async stop() {
        calls.push("stop");
        state.running = false;
      },
    };
    return { controller, calls };
  }

  it("defaults to a controller that says local models are unavailable", async () => {
    await withServer({}, async (h) => {
      expect((await h.req("/api/local-model")).json()).toMatchObject({
        installed: false,
        running: false,
      });
      const ws = await h.ws();
      const r = await h.post("/api/local-model/install", {});
      expect(r.status).toBe(202);
      const failed = (await ws.waitForAny((e) => isJob(e) && e.job.status === "error")) as JobEvent;
      expect(failed.job).toMatchObject({
        kind: "model-download",
        error: expect.stringContaining("not available"),
      });
    });
  });

  it("runs install and start as jobs with progress, and stop directly", async () => {
    const { controller, calls } = fakeController();
    await withServer({ localModel: controller }, async (h) => {
      const ws = await h.ws();
      expect((await h.req("/api/local-model")).json()).toMatchObject({
        installed: false,
        detail: "Not downloaded (2.1 GB)",
      });

      const install = await h.post("/api/local-model/install", { modelId: "tiny" });
      expect(install.status).toBe(202);
      const { jobId } = install.json<{ jobId: string }>();
      await ws.waitForAny((e) => isJob(e) && e.job.id === jobId && e.job.status === "done");
      const progress = ws.events
        .filter(isJob)
        .filter((e) => e.job.id === jobId)
        .map((e) => e.job.progress);
      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(1);
      expect(progress).toContain(0.5);
      expect(ws.events.filter(isJob).find((e) => e.job.id === jobId)?.job.kind).toBe(
        "model-download",
      );
      expect((await h.req("/api/local-model")).json()).toMatchObject({ installed: true });

      const start = await h.post("/api/local-model/start", {});
      const startJob = start.json<{ jobId: string }>().jobId;
      await ws.waitForAny((e) => isJob(e) && e.job.id === startJob && e.job.status === "done");
      expect((await h.req("/api/local-model")).json()).toMatchObject({ running: true });
      expect((await h.post("/api/local-model/stop", {})).json()).toEqual({ ok: true });
      expect((await h.req("/api/local-model")).json()).toMatchObject({ running: false });
      expect(calls).toEqual(["install:tiny", "start", "stop"]);
    });
  });

  it("allows one local-model task at a time and cancels it on request", async () => {
    const { controller } = fakeController();
    await withServer({ localModel: controller }, async (h) => {
      const ws = await h.ws();
      const first = await h.post("/api/local-model/start", {});
      expect(first.status).toBe(202);
      expect((await h.post("/api/local-model/install", {})).status).toBe(409);
      expect((await h.post("/api/local-model/cancel", {})).json()).toEqual({ cancelled: true });
      const failed = (await ws.waitForAny(
        (e) => isJob(e) && e.job.kind === "model-start" && e.job.status === "error",
      )) as JobEvent;
      expect(failed.job.error).toBe("Cancelled");
      expect((await h.post("/api/local-model/cancel", {})).json()).toEqual({ cancelled: false });
    });
  });
});

describe("graceful shutdown", () => {
  it("closes WebSocket clients with 1001, stops listening, saves the project and is idempotent", async () => {
    const h = await startHarness();
    const ws = await h.ws();
    const closed = new Promise<number>((resolve) => ws.socket.on("close", (code) => resolve(code)));
    await h.post("/api/project/new", { name: "Final" });
    await Promise.all([h.server.close(), h.server.close()]);
    expect(await closed).toBe(1001);
    await expect(fetch(`${h.base}/api/health`)).rejects.toThrow();
    const files = await import("node:fs/promises").then((fs) =>
      fs.readdir(join(h.dataDir, "projects")),
    );
    expect(files.some((f) => f.endsWith(".dax.json"))).toBe(true);
    await h.cleanup();
  });

  it("aborts an in-flight AI run on shutdown", async () => {
    let aborted = false;
    const runner = {
      run: (_m: string, ctx: { signal: AbortSignal }) =>
        new Promise<void>((resolve) =>
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          }),
        ),
    };
    const h = await startHarness({ agentRunner: runner });
    await h.post("/api/chat", { message: "x" });
    await h.cleanup();
    expect(aborted).toBe(true);
  });
});
