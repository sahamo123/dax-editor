// The controller against a fake client and a fake socket: state pushes, connection status, undoing a whole AI
// run, and settings saving.

import type { WsEvent } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import type { DaxClient } from "../api";
import type { LiveSocketOptions } from "../api/socket";
import { type Controller, createController } from "./controller";
import { createAppStore } from "./store";
import { historyItem, makeState } from "./test-utils";

function setup(clientOver: Record<string, unknown> = {}) {
  const store = createAppStore();
  const base = {
    baseUrl: "http://x",
    token: "t",
    run: vi.fn(async () => ({ ok: true, summary: "ok" })),
    getState: vi.fn(async () => ({ ok: true, value: makeState() })),
    chat: vi.fn(async () => ({ ok: true, value: {} })),
    chatCancel: vi.fn(async () => ({ ok: true, value: {} })),
    setApiKey: vi.fn(async () => ({ ok: true, value: {} })),
    putSettings: vi.fn(async () => ({ ok: true, value: {} })),
    importMedia: vi.fn(async () => ({ ok: true, summary: "Imported" })),
    getLocalModel: vi.fn(async () => ({
      ok: true,
      value: { installed: true, running: false, detail: "Downloaded" },
    })),
    localModel: vi.fn(async () => ({ ok: true, value: {} })),
  };
  const client = { ...base, ...clientOver } as typeof base;
  let opts: LiveSocketOptions | null = null;
  const controller: Controller = createController({
    client: client as unknown as DaxClient,
    store,
    openSocket: (o) => {
      opts = o;
      return { close: vi.fn(), retryNow: vi.fn() };
    },
  });
  controller.start();
  const socket = () => {
    if (!opts) throw new Error("socket not opened");
    return opts;
  };
  return { store, client, controller, socket };
}

describe("controller", () => {
  it("goes online on open, loads state, and shows an offline banner state when the socket closes", async () => {
    const { store, client, socket } = setup();
    expect(store.getState().connection.status).toBe("connecting");
    socket().onStatus("open", { failures: 0 });
    expect(store.getState().connection).toMatchObject({ status: "online", everOnline: true });
    await vi.waitFor(() => expect(store.getState().state).not.toBeNull());
    expect(client.getState).toHaveBeenCalled();

    socket().onStatus("closed", { failures: 1, retryAt: 12345 });
    expect(store.getState().connection).toMatchObject({ status: "offline", retryAt: 12345 });
    // While the next attempt is in flight we stay in the offline presentation instead of flickering.
    socket().onStatus("connecting", { failures: 1 });
    expect(store.getState().connection.status).toBe("offline");
  });

  it("applies pushed state, jobs and chat events", () => {
    const { store, socket } = setup();
    const push = (e: WsEvent) => socket().onEvent(e);
    push({ type: "state", state: makeState({ busy: true }) });
    expect(store.getState().state?.busy).toBe(true);
    push({
      type: "job",
      job: { id: "j", kind: "export", label: "Export", progress: 0.5, status: "running" },
    });
    expect(store.getState().jobs.j?.progress).toBe(0.5);
    push({ type: "chat", runId: "r", event: { type: "text", text: "hello" } });
    expect(store.getState().chat).toHaveLength(1);
  });

  it("announces a failed background job once", () => {
    const { store, socket } = setup();
    socket().onEvent({
      type: "job",
      job: { id: "j", kind: "proxy", label: "Preparing", progress: 0, status: "running" },
    });
    socket().onEvent({
      type: "job",
      job: {
        id: "j",
        kind: "proxy",
        label: "Preparing",
        progress: 0,
        status: "error",
        error: "ffmpeg died",
      },
    });
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["ffmpeg died"]);
  });

  it("raises a toast when a manual command fails, but returns the failure to the caller", async () => {
    const { store, controller } = setup({
      run: vi.fn(async () => ({ ok: false, error: "No clip can be split" })),
    });
    const r = await controller.run("split", { at: 99 });
    expect(r).toEqual({ ok: false, error: "No clip can be split" });
    expect(store.getState().toasts[0]?.text).toBe("No clip can be split");
    store.getState().dismissToast(store.getState().toasts[0]?.id ?? -1);
    await controller.runQuiet("split", { at: 99 });
    expect(store.getState().toasts).toHaveLength(0);
  });

  it("undoes a multi-step AI run with one undo per step, and redoes it", async () => {
    const { store, client, controller } = setup();
    store.getState().applyState(
      makeState({
        history: [
          historyItem({ id: 0, source: "system" }),
          historyItem({ id: 1, source: "ai" }),
          historyItem({ id: 2, source: "ai", current: true }),
        ],
      }),
    );
    store.getState().applyChat("r", { type: "done", turns: 1 }); // start id is the pending/current one
    // Pretend the run began at state 0.
    store.setState({
      chat: store.getState().chat.map((i) => (i.kind === "run" ? { ...i, startStateId: 0 } : i)),
    });

    await controller.undoRun("r");
    expect(client.run.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "undo",
      "undo",
    ]);
    const item = store.getState().chat[0];
    expect(item?.kind === "run" && item.undoneSteps).toBe(2);

    client.run.mockClear();
    await controller.redoRun("r");
    expect(client.run.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "redo",
      "redo",
    ]);
  });

  it("will not undo an AI run once manual work followed it", async () => {
    const { store, client, controller } = setup();
    store.getState().applyState(
      makeState({
        history: [
          historyItem({ id: 0, source: "system" }),
          historyItem({ id: 1, source: "ai" }),
          historyItem({ id: 2, source: "manual", current: true }),
        ],
      }),
    );
    store.getState().applyChat("r", { type: "done", turns: 1 });
    store.setState({
      chat: store.getState().chat.map((i) => (i.kind === "run" ? { ...i, startStateId: 0 } : i)),
    });
    await controller.undoRun("r");
    expect(client.run).not.toHaveBeenCalled();
  });

  it("puts a chat failure in the transcript", async () => {
    const { store, controller } = setup({
      chat: vi.fn(async () => ({ ok: false, error: "No assistant is set up" })),
    });
    await controller.sendChat("hello");
    const kinds = store.getState().chat.map((i) => i.kind);
    expect(kinds).toEqual(["user", "notice"]);
  });

  it("flags a run as stopping before the cancel request returns", async () => {
    const { store, controller } = setup();
    store.getState().applyChat("r", { type: "status", text: "Working" });
    const pending = controller.cancelChat();
    expect(store.getState().chat[0]).toMatchObject({ cancelling: true });
    await pending;
    expect(store.getState().chat[0]).toMatchObject({ status: "cancelled" });
  });

  it("announces a finished export from its job events, not from the command reply", async () => {
    const { store, client, controller, socket } = setup({
      run: vi.fn(async () => ({
        ok: true,
        summary: "Export of out.mp4 started.",
        data: { jobId: "j1" },
      })),
    });
    const job = {
      id: "j1",
      kind: "export" as const,
      label: "Export out.mp4",
      progress: 0.5,
      status: "running" as const,
    };
    socket().onEvent({ type: "job", job });
    expect(await controller.exportTo("/tmp/out.mp4", false)).toBe(true);
    expect(client.run).toHaveBeenCalledWith("export_video", {
      path: "/tmp/out.mp4",
      overwrite: false,
    });
    // "started" is not news once the job events are doing the talking.
    expect(store.getState().toasts).toHaveLength(0);
    socket().onEvent({
      type: "job",
      job: { ...job, progress: 1, status: "done", result: "/tmp/out.mp4" },
    });
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Exported out.mp4."]);
  });

  it("toasts the command reply of an export that never became a job, and a failed export job", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Exported to /tmp/out.mp4." })),
    });
    await controller.exportTo("/tmp/out.mp4", true);
    expect(store.getState().toasts[0]?.text).toBe("Exported to /tmp/out.mp4.");
    const job = {
      id: "j2",
      kind: "export" as const,
      label: "Export",
      progress: 0.2,
      status: "running" as const,
    };
    socket().onEvent({ type: "job", job });
    socket().onEvent({ type: "job", job: { ...job, status: "error", error: "Disk full" } });
    expect(store.getState().toasts.at(-1)).toMatchObject({ tone: "error", text: "Disk full" });
  });

  it("names the reason when only some of the imported files worked", async () => {
    const { store, controller } = setup({
      importMedia: vi.fn(async () => ({
        ok: true,
        summary: "Imported 1 file(s). 1 failed.",
        data: { assetIds: ["a1"], failed: [{ path: "/b.mp4", error: "Not a video file" }] },
      })),
    });
    expect(await controller.importPaths(["/a.mp4", "/b.mp4"])).toBe(true);
    expect(store.getState().toasts[0]).toMatchObject({ tone: "error" });
    expect(store.getState().toasts[0]?.text).toContain("Not a video file");
  });

  it("re-reads the local model status after every action, because the replies do not carry it", async () => {
    const { store, client, controller } = setup();
    await controller.localModel({ action: "stop" });
    expect(client.localModel).toHaveBeenCalledWith({ action: "stop" });
    expect(client.getLocalModel).toHaveBeenCalledTimes(1);
    expect(store.getState().localModel).toMatchObject({ installed: true, detail: "Downloaded" });
    await controller.loadLocalModel();
    expect(client.getLocalModel).toHaveBeenCalledTimes(2);
  });

  it("keeps the old status and says why when a local model action is refused", async () => {
    const { store, client, controller } = setup({
      localModel: vi.fn(async () => ({
        ok: false,
        error: "A local model task is already running.",
      })),
    });
    await controller.localModel({ action: "install" });
    expect(client.getLocalModel).not.toHaveBeenCalled();
    expect(store.getState().toasts[0]?.text).toContain("already running");
  });

  it("saves API keys first, once, and never keeps them", async () => {
    const { client, controller, store } = setup();
    const ok = await controller.saveSettings({
      settings: { activeProvider: "anthropic", providers: { anthropic: { model: "m" } } },
      apiKeys: { anthropic: "sk-abc", "openai-compatible": "" },
    });
    expect(ok).toBe(true);
    expect(client.setApiKey).toHaveBeenCalledTimes(1);
    expect(client.setApiKey).toHaveBeenCalledWith("anthropic", "sk-abc");
    expect(client.putSettings).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(store.getState())).not.toContain("sk-abc");
  });

  it("stops saving and says why if the key cannot be stored", async () => {
    const { client, controller, store } = setup({
      setApiKey: vi.fn(async () => ({ ok: false, error: "disk full" })),
    });
    const ok = await controller.saveSettings({
      settings: { activeProvider: "anthropic", providers: {} },
      apiKeys: { anthropic: "k" },
    });
    expect(ok).toBe(false);
    expect(client.putSettings).not.toHaveBeenCalled();
    expect(store.getState().toasts[0]?.text).toContain("disk full");
  });
});
