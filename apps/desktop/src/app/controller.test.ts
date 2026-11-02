// The controller against a fake client and a fake socket: state pushes, connection status, undoing a whole AI
// run, and settings saving.

import { type JobInfo, MAX_UPLOAD_BYTES, type WsEvent } from "@dax/protocol";
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
    cancelTask: vi.fn(async () => ({ ok: true, value: { cancelled: true } })),
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

it("uses the engine's actual undo boundary for a queued task instead of the earlier submission state", () => {
  const { store, socket } = setup();
  store.getState().applyState(makeState());
  store.getState().beginUserMessage("queued before other edits");
  socket().onEvent({
    type: "chat",
    runId: "queued-run",
    startStateId: 42,
    event: { type: "status", text: "Thinking..." },
  });
  expect(
    store.getState().chat.find((item) => item.kind === "run" && item.id === "queued-run"),
  ).toMatchObject({ startStateId: 42 });
});

describe("controller", () => {
  it("does not apply an in-flight state refresh after a newer project state arrives", async () => {
    let release: ((value: { ok: true; value: ReturnType<typeof makeState> }) => void) | undefined;
    const response = new Promise<{ ok: true; value: ReturnType<typeof makeState> }>((resolve) => {
      release = resolve;
    });
    const { store, socket } = setup({ getState: vi.fn(() => response) });
    socket().onStatus("open", { failures: 0 });
    const current = makeState({
      projectId: "project-b",
      revision: 0,
      saveError: "Disk unavailable",
    });
    socket().onEvent({ type: "state", state: current });
    release?.({ ok: true, value: makeState({ projectId: "project-a", revision: 10 }) });
    await response;
    await Promise.resolve();
    expect(store.getState().state).toMatchObject({
      projectId: "project-b",
      revision: 0,
      saveError: "Disk unavailable",
    });
  });

  it("does not restore an old save error after a same-revision successful save", async () => {
    let release: ((value: { ok: true; value: ReturnType<typeof makeState> }) => void) | undefined;
    const response = new Promise<{ ok: true; value: ReturnType<typeof makeState> }>((resolve) => {
      release = resolve;
    });
    const { store, socket } = setup({ getState: vi.fn(() => response) });
    socket().onStatus("open", { failures: 0 });
    socket().onEvent({ type: "state", state: makeState({ projectId: "project-a", revision: 2 }) });
    release?.({
      ok: true,
      value: makeState({ projectId: "project-a", revision: 2, saveError: "Old save error" }),
    });
    await response;
    await Promise.resolve();
    expect(store.getState().state?.saveError).toBeUndefined();
  });

  it("prefers the later of two overlapping state refreshes", async () => {
    type Result = { ok: true; value: ReturnType<typeof makeState> };
    let firstReply: ((value: Result) => void) | undefined;
    let secondReply: ((value: Result) => void) | undefined;
    const first = new Promise<Result>((resolve) => {
      firstReply = resolve;
    });
    const second = new Promise<Result>((resolve) => {
      secondReply = resolve;
    });
    const getState = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { controller, store } = setup({ getState });
    const earlier = controller.refreshState();
    const later = controller.refreshState();
    secondReply?.({ ok: true, value: makeState({ projectId: "project-b", revision: 0 }) });
    await later;
    firstReply?.({ ok: true, value: makeState({ projectId: "project-a", revision: 10 }) });
    await earlier;
    expect(store.getState().state?.projectId).toBe("project-b");
  });

  it("does not discard a project refresh when only provider details changed", async () => {
    type Result = { ok: true; value: ReturnType<typeof makeState> };
    let reply: ((value: Result) => void) | undefined;
    const response = new Promise<Result>((resolve) => {
      reply = resolve;
    });
    const { controller, store } = setup({
      getState: vi.fn(() => response),
      getProviders: vi.fn(async () => ({ ok: true, value: [] })),
    });
    store.getState().applyState(makeState({ projectId: "project-a", revision: 0 }));
    const pending = controller.refreshState();
    await controller.refreshProviders();
    reply?.({ ok: true, value: makeState({ projectId: "project-a", revision: 1 }) });
    await pending;
    expect(store.getState().state?.revision).toBe(1);
  });

  it("opens an initially loaded saved empty project directly", () => {
    const store = createAppStore();
    store.getState().applyState(makeState({ projectPath: "saved.dax.json" }));
    expect(store.getState().ui.setupVisible).toBe(false);
  });

  it("shows setup for a new project but not an opened project, and preserves it on failure", async () => {
    const projectNew = vi.fn(async () => ({ ok: true, value: makeState({ projectId: "new" }) }));
    const projectOpen = vi.fn(async () => ({
      ok: true,
      value: makeState({ projectId: "opened" }),
    }));
    const projectCopy = vi.fn(async () => ({ ok: false, error: "Invalid project" }));
    const { controller, store } = setup({ projectNew, projectOpen, projectCopy });
    store.getState().patchUi({ setupVisible: false });
    expect(await controller.project("new", "New project")).toBe(true);
    expect(store.getState().ui.setupVisible).toBe(true);
    expect(await controller.project("open", "project.dax.json")).toBe(true);
    expect(store.getState().ui.setupVisible).toBe(false);
    expect(await controller.project("copy", {})).toBe(false);
    expect(store.getState().ui.setupVisible).toBe(false);
    expect(store.getState().state?.projectId).toBe("opened");
  });

  it("opens a browser project copy directly even when it is empty", async () => {
    const projectCopy = vi.fn(async () => ({ ok: true, value: makeState({ projectId: "copy" }) }));
    const { controller, store } = setup({ projectCopy });
    expect(store.getState().ui.setupVisible).toBe(true);
    expect(await controller.project("copy", {})).toBe(true);
    expect(store.getState().ui.setupVisible).toBe(false);
  });

  it("orders rapid manual edits using refreshed revisions and rejects queued edits after a project switch", async () => {
    let revision = 0;
    let release: (() => void) | undefined;
    const guards: unknown[] = [];
    const { controller, store } = setup({
      getState: vi.fn(async () => ({
        ok: true,
        value: makeState({ projectId: "project-a", revision }),
      })),
      run: vi.fn(async (_name: string, _args: Record<string, unknown>, guard: unknown) => {
        guards.push(guard);
        if (!revision)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        revision++;
        return { ok: true, summary: "Edited" };
      }),
    });
    store.getState().applyState(makeState({ projectId: "project-a", revision: 0 }));
    const first = controller.run("set_volume", { clipId: "clip", volume: 0.5 });
    const second = controller.run("set_volume", { clipId: "clip", volume: 0.6 });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(guards).toHaveLength(1);
    release?.();
    await Promise.all([first, second]);
    expect(guards).toEqual([
      { projectId: "project-a", expectedRevision: 0 },
      { projectId: "project-a", expectedRevision: 1 },
    ]);
    const stale = controller.run("set_volume", { clipId: "clip", volume: 0.7 });
    store.getState().applyState(makeState({ projectId: "project-b", revision: 0 }));
    expect(await stale).toMatchObject({
      ok: false,
      error: expect.stringContaining("project changed"),
    });
    expect(guards).toHaveLength(2);
  });
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

  it.each([
    { status: "done" as const, result: "/tmp/out.mp4", expected: "Exported out.mp4." },
    { status: "error" as const, error: "Disk full", expected: "Disk full" },
  ])("announces a known running job recovered as $status from a snapshot once", (outcome) => {
    const { store, socket } = setup();
    const running: JobInfo = {
      id: "snapshot-job",
      kind: "export",
      label: "Export",
      progress: 0.5,
      status: "running",
    };
    const terminal: JobInfo = {
      ...running,
      status: outcome.status,
      progress: 1,
      ...(outcome.status === "done" ? { result: outcome.result } : { error: outcome.error }),
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [running] }) });
    socket().onEvent({ type: "state", state: makeState({ jobs: [terminal] }) });
    socket().onEvent({ type: "job", job: terminal });
    socket().onEvent({ type: "state", state: makeState({ jobs: [terminal] }) });
    socket().onEvent({ type: "job", job: running });
    expect(store.getState().jobs[running.id]).toEqual(terminal);
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual([outcome.expected]);
  });

  it("announces a first-observed terminal live event once without replaying historical snapshots", () => {
    const { store, socket } = setup();
    const old: JobInfo = {
      id: "old",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/old.mp4",
    };
    const failure: JobInfo = {
      id: "new",
      kind: "proxy",
      label: "Preparing",
      progress: 0.2,
      status: "error",
      error: "Media error",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [old] }) });
    socket().onEvent({ type: "job", job: old });
    expect(store.getState().toasts).toHaveLength(0);
    socket().onEvent({ type: "job", job: failure });
    socket().onEvent({ type: "job", job: failure });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Media error"]);
  });

  it("announces a recovered effects preview without exposing its cache path", () => {
    const { store, socket } = setup();
    const job: JobInfo = {
      id: "review",
      kind: "export",
      label: "Render complete edit preview",
      progress: 0.4,
      status: "running",
    };
    socket().onEvent({ type: "job", job });
    socket().onEvent({
      type: "state",
      state: makeState({
        jobs: [{ ...job, status: "done", progress: 1, result: "/private/cache/uuid.webm" }],
      }),
    });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Effects preview ready."]);
  });

  it("does not repeat a terminal notice when a snapshot follows the live event", () => {
    const { store, socket } = setup();
    const job: JobInfo = {
      id: "event-first",
      kind: "export",
      label: "Export",
      progress: 0,
      status: "running",
    };
    const done: JobInfo = { ...job, status: "done", progress: 1, result: "/tmp/out.mp4" };
    socket().onEvent({ type: "job", job });
    socket().onEvent({ type: "job", job: done });
    socket().onEvent({ type: "state", state: makeState({ jobs: [done] }) });
    socket().onEvent({ type: "job", job: done });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Exported out.mp4."]);
  });

  it("announces a job completed during reconnect when the HTTP refresh observes it", async () => {
    const running: JobInfo = {
      id: "reconnect",
      kind: "export",
      label: "Export",
      progress: 0.6,
      status: "running",
    };
    const done: JobInfo = { ...running, status: "done", progress: 1, result: "/tmp/out.mp4" };
    const { store, socket } = setup({
      getState: vi.fn(async () => ({ ok: true, value: makeState({ jobs: [done] }) })),
    });
    socket().onEvent({ type: "job", job: running });
    socket().onStatus("open", { failures: 0 });
    await vi.waitFor(() => expect(store.getState().jobs.reconnect?.status).toBe("done"));
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Exported out.mp4."]);
  });

  it.each(["done", "error"] as const)(
    "reports a locally started export first seen %s in a later snapshot",
    async (status) => {
      const { store, controller, socket } = setup({
        run: vi.fn(async () => ({ ok: true, summary: "Started", data: { jobId: "local" } })),
      });
      expect(await controller.exportTo("/tmp/out.mp4", false)).toBe(true);
      const job: JobInfo = {
        id: "local",
        kind: "export",
        label: "Export",
        progress: 1,
        status,
        ...(status === "done" ? { result: "/tmp/out.mp4" } : { error: "Disk full" }),
      };
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
        "Starting export…",
        status === "done" ? "Exported out.mp4." : "Disk full",
      ]);
    },
  );

  it.each(["done", "error"] as const)(
    "reports a locally started export first seen %s before its command reply",
    async (status) => {
      const reply: {
        resolve?: (value: { ok: true; summary: string; data: { jobId: string } }) => void;
      } = {};
      const pending = new Promise<{ ok: true; summary: string; data: { jobId: string } }>(
        (resolve) => {
          reply.resolve = resolve;
        },
      );
      const { store, controller, socket } = setup({ run: vi.fn(() => pending) });
      const exporting = controller.exportTo("/tmp/out.mp4", false);
      const job: JobInfo = {
        id: "local",
        kind: "export",
        label: "Export",
        progress: 1,
        status,
        ...(status === "done" ? { result: "/tmp/out.mp4" } : { error: "Disk full" }),
      };
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      if (!reply.resolve) throw new Error("Export reply not initialized");
      reply.resolve({ ok: true, summary: "Started", data: { jobId: "local" } });
      expect(await exporting).toBe(true);
      expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
        "Starting export…",
        status === "done" ? "Exported out.mp4." : "Disk full",
      ]);
    },
  );

  it.each([
    ["transcribe", "Transcript ready."],
    ["speech-setup", "Offline speech ready."],
    ["model-download", "Local model downloaded."],
    ["model-start", "Local model started."],
    ["blender", "Motion template ready."],
  ] as const)("announces a completed %s job once without its internal label", (kind, message) => {
    const { store, socket } = setup();
    const running: JobInfo = {
      id: kind,
      kind,
      label: "/private/path",
      progress: 0,
      status: "running",
    };
    const done: JobInfo = { ...running, status: "done", progress: 1 };
    socket().onEvent({ type: "job", job: running });
    socket().onEvent({ type: "job", job: done });
    socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...done }] }) });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual([message]);
  });

  it("keeps completed background proxy work silent", () => {
    const { store, socket } = setup();
    const job: JobInfo = {
      id: "proxy",
      kind: "proxy",
      label: "Proxy",
      progress: 0,
      status: "running",
    };
    socket().onEvent({ type: "job", job });
    socket().onEvent({ type: "job", job: { ...job, status: "done", progress: 1 } });
    expect(store.getState().toasts).toEqual([]);
  });

  it.each(["speech-install", "transcribe", "motion", "model-install", "model-start"] as const)(
    "reconciles the returned %s job when a failure first arrives in a snapshot",
    async (action) => {
      const jobId = "local-non-export";
      const response = vi.fn(async () => ({ ok: true, value: { jobId } }));
      const { store, controller, socket } = setup({
        speech: response,
        renderMotion: response,
        localModel: response,
      });
      if (action === "speech-install") await controller.speech("install");
      if (action === "transcribe") await controller.speech("transcribe", "asset");
      if (action === "motion")
        await controller.renderMotion({
          template: "title-card",
          text: "Title",
          color: "#ffffff",
          duration: 3,
          width: 640,
          height: 360,
          fps: 24,
        });
      if (action === "model-install") await controller.localModel({ action: "install" });
      if (action === "model-start") await controller.localModel({ action: "start" });
      const kind: JobInfo["kind"] =
        action === "speech-install"
          ? "speech-setup"
          : action === "motion"
            ? "blender"
            : action === "model-install"
              ? "model-download"
              : action === "model-start"
                ? "model-start"
                : "transcribe";
      const job: JobInfo = {
        id: jobId,
        kind,
        label: "Job",
        status: "error",
        progress: 1,
        error: "Job failed",
      };
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...job }] }) });
      expect(response).toHaveBeenCalledTimes(1);
      expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Job failed"]);
    },
  );

  it.each(["speech", "motion", "model"] as const)(
    "reconciles a completed %s snapshot before its endpoint reply without repeating it",
    async (action) => {
      const reply: { resolve?: (value: { ok: true; value: { jobId: string } }) => void } = {};
      const pending = new Promise<{ ok: true; value: { jobId: string } }>((resolve) => {
        reply.resolve = resolve;
      });
      const endpoint = vi.fn(() => pending);
      const { store, controller, socket } = setup({
        speech: endpoint,
        renderMotion: endpoint,
        localModel: endpoint,
      });
      const request =
        action === "speech"
          ? controller.speech("transcribe", "asset")
          : action === "model"
            ? controller.localModel({ action: "start" })
            : controller.renderMotion({
                template: "title-card",
                text: "Title",
                color: "#ffffff",
                duration: 3,
                width: 640,
                height: 360,
                fps: 24,
              });
      const kind: JobInfo["kind"] =
        action === "speech" ? "transcribe" : action === "model" ? "model-start" : "blender";
      const job: JobInfo = {
        id: "local",
        kind,
        label: "/private/path",
        status: "done",
        progress: 1,
      };
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      if (!reply.resolve) throw new Error("Endpoint reply not initialized");
      reply.resolve({ ok: true, value: { jobId: "local" } });
      await request;
      socket().onEvent({ type: "job", job: { ...job } });
      expect(endpoint).toHaveBeenCalledTimes(1);
      const message =
        action === "speech"
          ? "Transcript ready."
          : action === "model"
            ? "Local model started."
            : "Motion template ready.";
      expect(store.getState().toasts.map((toast) => toast.text)).toEqual([message]);
    },
  );

  it.each(["remove", "stop", "cancel", "uninstall"] as const)(
    "does not treat synchronous %s replies as newly started jobs",
    async (action) => {
      const response = vi.fn(async () => ({ ok: true, value: { jobId: "unrelated" } }));
      const { store, controller, socket } = setup({ speech: response, localModel: response });
      if (action === "remove") await controller.speech("remove");
      else await controller.localModel({ action });
      const job: JobInfo = {
        id: "unrelated",
        kind: "transcribe",
        label: "Job",
        status: "error",
        progress: 1,
        error: "Unrelated error",
      };
      socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
      expect(store.getState().toasts).toEqual([]);
    },
  );

  it("does not infer a speech job from an ambiguous failed endpoint", async () => {
    const speech = vi.fn(async () => ({ ok: false, error: "Connection lost" }));
    const { store, controller, socket } = setup({ speech });
    await controller.speech("install");
    const job: JobInfo = {
      id: "unknown",
      kind: "speech-setup",
      label: "Job",
      status: "done",
      progress: 1,
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    expect(speech).toHaveBeenCalledTimes(1);
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Connection lost"]);
  });

  it("does not replay a historical non-export job when an endpoint returns its ID", async () => {
    const { store, controller, socket } = setup({
      speech: vi.fn(async () => ({ ok: true, value: { jobId: "old" } })),
    });
    const job: JobInfo = {
      id: "old",
      kind: "speech-setup",
      label: "Job",
      status: "done",
      progress: 1,
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    await controller.speech("install");
    socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...job }] }) });
    expect(store.getState().toasts).toEqual([]);
  });

  it("announces a motion command's locally identified completion", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Started", data: { jobId: "motion" } })),
    });
    await controller.run("render_motion_template");
    const job: JobInfo = {
      id: "motion",
      kind: "blender",
      label: "/private/path",
      status: "done",
      progress: 1,
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Motion template ready."]);
  });

  it("does not repeat a live terminal notice delivered before the command reply", async () => {
    const reply: {
      resolve?: (value: { ok: true; summary: string; data: { jobId: string } }) => void;
    } = {};
    const pending = new Promise<{ ok: true; summary: string; data: { jobId: string } }>(
      (resolve) => {
        reply.resolve = resolve;
      },
    );
    const { store, controller, socket } = setup({ run: vi.fn(() => pending) });
    const exporting = controller.exportTo("/tmp/out.mp4", false);
    const job: JobInfo = {
      id: "local",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/out.mp4",
    };
    socket().onEvent({ type: "job", job });
    socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...job }] }) });
    if (!reply.resolve) throw new Error("Export reply not initialized");
    reply.resolve({ ok: true, summary: "Started", data: { jobId: "local" } });
    expect(await exporting).toBe(true);
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
      "Starting export…",
      "Exported out.mp4.",
    ]);
  });

  it("reports a locally started preview first seen terminal in a snapshot", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Started", data: { jobId: "preview" } })),
    });
    expect((await controller.run("render_preview")).ok).toBe(true);
    const job: JobInfo = {
      id: "preview",
      kind: "export",
      label: "Render complete edit preview",
      progress: 1,
      status: "done",
      result: "/private/cache/uuid.webm",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Effects preview ready."]);
  });

  it("reports a preview snapshot arriving before its command reply", async () => {
    const reply: {
      resolve?: (value: { ok: true; summary: string; data: { jobId: string } }) => void;
    } = {};
    const pending = new Promise<{ ok: true; summary: string; data: { jobId: string } }>(
      (resolve) => {
        reply.resolve = resolve;
      },
    );
    const run = vi.fn(() => pending);
    const { store, controller, socket } = setup({ run });
    const rendering = controller.run("render_preview");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const job: JobInfo = {
      id: "preview",
      kind: "export",
      label: "Render complete edit preview",
      progress: 1,
      status: "done",
      result: "/private/cache/uuid.webm",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    if (!reply.resolve) throw new Error("Preview reply not initialized");
    reply.resolve({ ok: true, summary: "Started", data: { jobId: "preview" } });
    expect((await rendering).ok).toBe(true);
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Effects preview ready."]);
  });

  it("does not replay a historical job that existed before a local command", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Started", data: { jobId: "old" } })),
    });
    const old: JobInfo = {
      id: "old",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/old.mp4",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [old] }) });
    await controller.exportTo("/tmp/out.mp4", false);
    socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...old }] }) });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Starting export…"]);
  });

  it("does not infer a job from an ambiguous failed command reply", async () => {
    const reply: { resolve?: (value: { ok: false; error: string }) => void } = {};
    const pending = new Promise<{ ok: false; error: string }>((resolve) => {
      reply.resolve = resolve;
    });
    const run = vi.fn(() => pending);
    const { store, controller, socket } = setup({ run });
    const exporting = controller.exportTo("/tmp/out.mp4", false);
    const job: JobInfo = {
      id: "unidentified",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/out.mp4",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [job] }) });
    if (!reply.resolve) throw new Error("Export reply not initialized");
    reply.resolve({ ok: false, error: "Connection lost" });
    expect(await exporting).toBe(false);
    socket().onEvent({ type: "state", state: makeState({ jobs: [{ ...job }] }) });
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
      "Starting export…",
      "Connection lost",
    ]);
  });

  it("keeps local job identification scoped to its ID across project changes", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Started", data: { jobId: "local" } })),
    });
    socket().onEvent({ type: "state", state: makeState({ projectId: "a", revision: 1 }) });
    await controller.exportTo("/tmp/out.mp4", false);
    const other: JobInfo = {
      id: "other",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/other.mp4",
    };
    const local: JobInfo = { ...other, id: "local", result: "/tmp/out.mp4" };
    socket().onEvent({
      type: "state",
      state: makeState({ projectId: "b", revision: 0, jobs: [other] }),
    });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Starting export…"]);
    socket().onEvent({
      type: "state",
      state: makeState({ projectId: "b", revision: 0, jobs: [other, local] }),
    });
    expect(store.getState().state?.projectId).toBe("b");
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
      "Starting export…",
      "Exported out.mp4.",
    ]);
  });

  it("bounds unseen local claims, warns on overflow and reuses freed capacity", async () => {
    let sequence = 0;
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({
        ok: true,
        summary: "Started",
        data: { jobId: `job-${sequence++}` },
      })),
    });
    for (let index = 0; index < 129; index++) await controller.exportTo("/tmp/out.mp4", false);
    expect(store.getState().toasts.at(-1)).toMatchObject({
      tone: "error",
      text: expect.stringContaining("Check Work"),
    });
    const finished: JobInfo = {
      id: "job-0",
      kind: "export",
      label: "Export",
      progress: 1,
      status: "done",
      result: "/tmp/out.mp4",
    };
    socket().onEvent({ type: "state", state: makeState({ jobs: [finished] }) });
    expect(store.getState().toasts.at(-1)?.text).toBe("Exported out.mp4.");
    await controller.exportTo("/tmp/next.mp4", false);
    const next: JobInfo = { ...finished, id: "job-129", result: "/tmp/next.mp4" };
    socket().onEvent({ type: "state", state: makeState({ jobs: [finished, next] }) });
    expect(store.getState().toasts.at(-1)?.text).toBe("Exported next.mp4.");
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
    store.getState().applyState(makeState());
    expect(await controller.sendChat("hello")).toBe("chat-attempted");
    const kinds = store.getState().chat.map((i) => i.kind);
    expect(kinds).toEqual(["user", "notice"]);
  });

  it.each([
    { ok: false, error: "Upload failed" },
    { ok: true, summary: "Uploaded", data: {} },
    { ok: true, summary: "Uploaded", data: { path: "" } },
  ])("does not attempt chat when attachment staging fails: %o", async (uploadReply) => {
    const uploadMedia = vi.fn(async () => uploadReply);
    const chat = vi.fn(async () => ({ ok: true, value: {} }));
    const { controller, store } = setup({ uploadMedia, chat });
    store.getState().applyState(makeState());
    const file = new File(["video"], "sample.mp4", { type: "video/mp4" });
    expect(await controller.sendChat("hello", { mode: "plan", files: [file] })).toBe(
      "attachment-failed",
    );
    expect(uploadMedia).toHaveBeenCalledWith(file, true);
    expect(chat).not.toHaveBeenCalled();
    expect(store.getState().chat.some((item) => item.kind === "notice")).toBe(true);
  });

  it("does not send chat if a later attachment fails after an earlier one staged", async () => {
    const uploadMedia = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, summary: "Uploaded", data: { path: "/staged/one.mp4" } })
      .mockResolvedValueOnce({ ok: false, error: "Second upload failed" });
    const chat = vi.fn(async () => ({ ok: true, value: {} }));
    const { controller, store } = setup({ uploadMedia, chat });
    store.getState().applyState(makeState());
    const files = [
      new File(["one"], "one.mp4", { type: "video/mp4" }),
      new File(["two"], "two.mp4", { type: "video/mp4" }),
    ];
    expect(await controller.sendChat("hello", { files })).toBe("attachment-failed");
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(chat).not.toHaveBeenCalled();
  });

  it.each(["empty", "oversized", "too many"] as const)(
    "preflights all attachments before staging a %s selection",
    async (kind) => {
      const uploadMedia = vi.fn(async () => ({ ok: false, error: "Upload unexpectedly started" }));
      const chat = vi.fn();
      const { controller, store } = setup({ uploadMedia, chat });
      store.getState().applyState(makeState());
      const valid = new File(["video"], "first.mp4");
      const invalid = new File(kind === "empty" ? [] : ["video"], "second.mp4");
      if (kind === "oversized")
        Object.defineProperty(invalid, "size", { value: MAX_UPLOAD_BYTES + 1 });
      const files =
        kind === "too many" ? Array.from({ length: 11 }, () => valid) : [valid, invalid];
      expect(await controller.sendChat("plan", { files, mode: "plan" })).toBe("attachment-failed");
      expect(uploadMedia).not.toHaveBeenCalled();
      expect(chat).not.toHaveBeenCalled();
      expect(store.getState().chat.some((item) => item.kind === "notice")).toBe(true);
    },
  );

  it("does not upload or send when the engine cannot confirm context", async () => {
    const uploadMedia = vi.fn();
    const chat = vi.fn();
    const { controller, store } = setup({ uploadMedia, chat });
    store.getState().applyState(makeState({ providerContextVersion: undefined }));
    const file = new File(["video"], "sample.mp4");
    expect(await controller.sendChat("hello", { files: [file] })).toBe("context-unavailable");
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("uses the original project and provider context across attachment staging", async () => {
    let release:
      | ((value: { ok: true; summary: string; data: { path: string } }) => void)
      | undefined;
    const uploadMedia = vi.fn(
      () =>
        new Promise<{ ok: true; summary: string; data: { path: string } }>((resolve) => {
          release = resolve;
        }),
    );
    const chat = vi.fn(async () => ({ ok: true, value: {} }));
    const { controller, store } = setup({ uploadMedia, chat });
    store.getState().applyState(makeState({ projectId: "first", providerContextVersion: 3 }));
    const sending = controller.sendChat("hello", {
      mode: "plan",
      files: [new File(["video"], "test.mp4")],
    });
    store.getState().applyState(makeState({ projectId: "second", providerContextVersion: 4 }));
    release?.({ ok: true, summary: "Uploaded", data: { path: "/staged/test.mp4" } });
    expect(await sending).toBe("chat-attempted");
    expect(chat).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        mode: "plan",
        expectedProjectId: "first",
        expectedProviderEpoch: 3,
      }),
    );
  });

  it("reports a pre-task conflict without retrying", async () => {
    const chat = vi.fn(async () => ({ ok: false, error: "Project changed", status: 409 }));
    const { controller, store } = setup({ chat });
    store.getState().applyState(makeState());
    expect(await controller.sendChat("hello")).toBe("chat-rejected");
    expect(chat).toHaveBeenCalledTimes(1);
    expect(store.getState().chat.some((item) => item.kind === "notice")).toBe(true);
  });

  it("does not mark the next run stopped when a prior Stop response arrives late", async () => {
    let release: (value: { ok: true; value: { cancelled: boolean } }) => void = () => {};
    const reply = new Promise<{ ok: true; value: { cancelled: boolean } }>((resolve) => {
      release = resolve;
    });
    const cancel = vi.fn(() => reply);
    const { store, controller } = setup({ chatCancel: cancel, cancelTask: cancel });
    store.getState().applyChat("first", { type: "status", text: "Working" });
    const stopping = controller.cancelChat();
    expect(cancel).toHaveBeenCalledWith("first");
    store.getState().applyChat("first", { type: "done", turns: 1 });
    store.getState().applyChat("second", { type: "status", text: "Next task working" });
    release({ ok: true, value: { cancelled: true } });
    await stopping;
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      status: "cancelled",
    });
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "second"),
    ).toMatchObject({
      status: "running",
    });
  });

  it("preserves a completed outcome if the targeted Stop finds the task already finished", async () => {
    let release: (value: { ok: true; value: { cancelled: boolean } }) => void = () => {};
    const reply = new Promise<{ ok: true; value: { cancelled: boolean } }>((resolve) => {
      release = resolve;
    });
    const { store, controller } = setup({ cancelTask: vi.fn(() => reply) });
    store.getState().applyChat("first", { type: "status", text: "Working" });
    const stopping = controller.cancelChat();
    store.getState().applyChat("first", { type: "done", turns: 1 });
    store.getState().applyChat("second", { type: "status", text: "Next task" });
    release({ ok: true, value: { cancelled: false } });
    await stopping;
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      status: "done",
      cancelling: false,
    });
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "second"),
    ).toMatchObject({
      status: "running",
    });
    expect(store.getState().toasts.some((item) => /already finished/i.test(item.text))).toBe(true);
  });

  it("preserves a terminal error when the Stop request fails", async () => {
    let release: (value: { ok: false; error: string }) => void = () => {};
    const reply = new Promise<{ ok: false; error: string }>((resolve) => {
      release = resolve;
    });
    const { store, controller } = setup({ cancelTask: vi.fn(() => reply) });
    store.getState().applyChat("first", { type: "status", text: "Working" });
    const stopping = controller.cancelChat();
    store.getState().applyChat("first", { type: "error", message: "Synthetic failure" });
    release({ ok: false, error: "Stop unavailable" });
    await stopping;
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      status: "error",
      error: "Synthetic failure",
      cancelling: false,
    });
  });

  it("keeps a confirmed Stop tied to a task before its first transcript event", async () => {
    const { store, controller, client } = setup();
    store.getState().applyState(
      makeState({
        tasks: [
          {
            id: "first",
            title: "First",
            kind: "chat",
            mode: "edit",
            status: "running",
            createdAt: 1,
          },
        ],
      }),
    );
    await controller.cancelChat();
    expect(client.cancelTask).toHaveBeenCalledWith("first");
    store.getState().applyChat("first", { type: "status", text: "Late event" });
    store.getState().applyChat("first", { type: "done", turns: 1 });
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      status: "cancelled",
    });
  });

  it("records Stop intent before the first event while the cancellation is pending", async () => {
    let release: (value: { ok: true; value: { cancelled: boolean } }) => void = () => {};
    const reply = new Promise<{ ok: true; value: { cancelled: boolean } }>((resolve) => {
      release = resolve;
    });
    const { store, controller } = setup({ cancelTask: vi.fn(() => reply) });
    store.getState().applyState(
      makeState({
        tasks: [
          {
            id: "first",
            title: "First",
            kind: "chat",
            mode: "edit",
            status: "running",
            createdAt: 1,
          },
        ],
      }),
    );
    const stopping = controller.cancelChat();
    store.getState().applyChat("first", { type: "status", text: "Late start" });
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      cancelling: true,
    });
    store.getState().applyChat("first", { type: "done", turns: 1 });
    release({ ok: true, value: { cancelled: true } });
    await stopping;
    expect(
      store.getState().chat.find((item) => item.kind === "run" && item.id === "first"),
    ).toMatchObject({
      status: "cancelled",
    });
  });

  it("does not issue an unqualified Stop when no active task can be identified", async () => {
    const { store, controller, client } = setup();
    await controller.cancelChat();
    expect(client.cancelTask).not.toHaveBeenCalled();
    expect(client.chatCancel).not.toHaveBeenCalled();
    expect(store.getState().toasts.some((item) => /still loading/i.test(item.text))).toBe(true);
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
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Starting export…"]);
    socket().onEvent({ type: "job", job: { ...job, progress: 0.8 } });
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["Starting export…"]);
    socket().onEvent({
      type: "job",
      job: { ...job, progress: 1, status: "done", result: "/tmp/out.mp4" },
    });
    expect(store.getState().toasts.map((t) => t.text)).toEqual([
      "Starting export…",
      "Exported out.mp4.",
    ]);
  });

  it("reports an immediately rejected export without waiting for a job", async () => {
    const { store, controller } = setup({
      run: vi.fn(async () => ({ ok: false, error: "Choose another filename." })),
    });
    expect(await controller.exportTo("/tmp/existing.mp4", false)).toBe(false);
    expect(store.getState().toasts.map(({ tone, text }) => ({ tone, text }))).toEqual([
      { tone: "info", text: "Starting export…" },
      { tone: "error", text: "Choose another filename." },
    ]);
  });

  it("announces a review without displaying its internal cache filename", () => {
    const { store, socket } = setup();
    const job = {
      id: "review",
      kind: "export" as const,
      label: "Render complete edit preview",
      progress: 0.5,
      status: "running" as const,
    };
    socket().onEvent({ type: "job", job });
    socket().onEvent({
      type: "job",
      job: { ...job, status: "done", progress: 1, result: "/private/cache/uuid.webm" },
    });
    expect(store.getState().toasts.map((toast) => toast.text)).toEqual(["Effects preview ready."]);
  });

  it("toasts the command reply of an export that never became a job, and a failed export job", async () => {
    const { store, controller, socket } = setup({
      run: vi.fn(async () => ({ ok: true, summary: "Exported to /tmp/out.mp4." })),
    });
    await controller.exportTo("/tmp/out.mp4", true);
    expect(store.getState().toasts.map((t) => t.text)).toEqual([
      "Starting export…",
      "Exported to /tmp/out.mp4.",
    ]);
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

  it("saves settings before binding keys, once, and never keeps the keys", async () => {
    const { client, controller, store } = setup();
    const ok = await controller.saveSettings({
      settings: { activeProvider: "anthropic", providers: { anthropic: { model: "m" } } },
      apiKeys: { anthropic: "sk-abc", "openai-compatible": "" },
    });
    expect(ok).toBe(true);
    expect(client.setApiKey).toHaveBeenCalledTimes(1);
    expect(client.setApiKey).toHaveBeenCalledWith("anthropic", "sk-abc");
    expect(client.putSettings).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.putSettings).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(client.setApiKey).mock.invocationCallOrder[0] ?? 0,
    );
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
    expect(client.putSettings).toHaveBeenCalledWith({ activeProvider: "anthropic", providers: {} });
    expect(store.getState().toasts[0]?.text).toContain("disk full");
  });
});
