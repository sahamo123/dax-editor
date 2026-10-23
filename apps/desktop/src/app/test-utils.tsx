// Helpers for component tests: a plausible server state, a store, a fake controller and a render function that
// wires them together. Used only by *.test.tsx files.

import type { HistoryItem, Project } from "@dax/core";
import type { ProviderStatus, StateResponse } from "@dax/protocol";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AppProvider } from "./context";
import type { Controller } from "./controller";
import { type AppStore, createAppStore } from "./store";

/** A project with one 10 second clip and no overlays. */
function sampleProject(): Project {
  return {
    version: 1,
    name: "Test project",
    assets: {
      a1: {
        id: "a1",
        path: "/videos/interview.mp4",
        kind: "video",
        duration: 10,
        width: 1920,
        height: 1080,
        hasAudio: true,
      },
    },
    timeline: {
      width: 1920,
      height: 1080,
      fps: 30,
      fit: "contain",
      tracks: [
        {
          id: "main",
          kind: "video",
          clips: [
            { id: "c1", assetId: "a1", start: 0, in: 0, out: 10, volume: 1, fadeIn: 0, fadeOut: 0 },
          ],
        },
      ],
      overlays: [],
    },
  };
}

/** An empty project (nothing imported). */
export function emptyProjectState(): Project {
  return {
    version: 1,
    name: "Untitled",
    assets: {},
    timeline: { width: 1920, height: 1080, fps: 30, fit: "contain", tracks: [], overlays: [] },
  };
}

/** A history item with sensible defaults. */
export function historyItem(over: Partial<HistoryItem> & { id: number }): HistoryItem {
  return {
    parent: over.id === 0 ? null : over.id - 1,
    label: "Edit",
    source: "manual",
    at: "2026-01-01T10:00:00.000Z",
    current: false,
    duration: 10,
    clips: 1,
    overlays: 0,
    ...over,
  };
}

/** Providers: only the local model is ready unless `ready` says otherwise. */
export function providers(ready: string[] = []): ProviderStatus[] {
  return (
    ["local", "openai-compatible", "anthropic", "cli-claude", "cli-codex", "cli-gemini"] as const
  ).map((kind) => ({
    kind,
    available: ready.includes(kind),
    detail: ready.includes(kind) ? "Ready" : "Not set up",
  }));
}

/** A full server state. */
export function makeState(over: Partial<StateResponse> = {}): StateResponse {
  return {
    project: sampleProject(),
    history: [historyItem({ id: 0, label: "Start", source: "system", current: true })],
    canUndo: false,
    canRedo: false,
    presets: [],
    jobs: [],
    settings: { activeProvider: "local", providers: {} },
    providers: providers(),
    busy: false,
    serverVersion: "test",
    ...over,
  };
}

/** A controller whose every action is a spy that resolves to a successful result. */
export function fakeController(): { [K in keyof Controller]: ReturnType<typeof vi.fn> } {
  const ok = async () => ({ ok: true, summary: "ok" });
  return {
    start: vi.fn(),
    stop: vi.fn(),
    retryNow: vi.fn(),
    refreshState: vi.fn(async () => {}),
    project: vi.fn(async () => true),
    recentProjects: vi.fn(async () => []),
    relinkMedia: vi.fn(async () => {}),
    speechStatus: vi.fn(async () => null),
    speech: vi.fn(async () => {}),
    blenderStatus: vi.fn(async () => null),
    renderMotion: vi.fn(async () => {}),
    stageLogo: vi.fn(async () => undefined),
    run: vi.fn(ok),
    runQuiet: vi.fn(ok),
    undo: vi.fn(async () => {}),
    redo: vi.fn(async () => {}),
    importPaths: vi.fn(async () => true),
    uploadFiles: vi.fn(async () => true),
    exportTo: vi.fn(async () => true),
    sendChat: vi.fn(async () => {}),
    cancelTask: vi.fn(async () => {}),
    cancelChat: vi.fn(async () => {}),
    undoRun: vi.fn(async () => {}),
    redoRun: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => true),
    connection: vi.fn(async () => null),
    refreshProviders: vi.fn(async () => {}),
    testProvider: vi.fn(async () => {}),
    providerModels: vi.fn(async () => []),
    loadLocalModel: vi.fn(async () => {}),
    localModel: vi.fn(async () => {}),
  };
}

/** Render `ui` with a store (optionally pre-filled) and a fake controller. */
export function renderApp(
  ui: ReactElement,
  setup?: (s: AppStore) => void,
): { store: ReturnType<typeof createAppStore>; controller: ReturnType<typeof fakeController> } {
  const store = createAppStore();
  store.getState().setServer({ url: "http://127.0.0.1:9", token: "t" });
  store.getState().setConnection({ status: "online", everOnline: true });
  store.getState().applyState(makeState());
  setup?.(store.getState());
  const controller = fakeController();
  render(
    <AppProvider store={store} controller={controller as unknown as Controller}>
      {ui}
    </AppProvider>,
  );
  return { store, controller };
}
