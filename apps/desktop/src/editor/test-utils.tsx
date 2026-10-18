// Test helpers: a small project fixture, a fake EditorApi that records run() calls, and a render wrapper.

import type { Clip, Overlay, Project } from "@dax/core";
import type { CommandResponse, PresetInfo, StateResponse } from "@dax/protocol";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { EditorProvider } from "./context";
import "./test-polyfills";
import type { EditorApi } from "./types";

/** A clip fixture; `start` is filled in by {@link makeProject}. */
export function clip(
  id: string,
  assetId: string,
  inPoint: number,
  out: number,
  extra: Partial<Clip> = {},
): Clip {
  return { id, assetId, start: 0, in: inPoint, out, volume: 1, fadeIn: 0, fadeOut: 0, ...extra };
}

/** A text overlay fixture. */
export function overlay(
  id: string,
  start: number,
  duration: number,
  extra: Partial<Overlay> = {},
): Overlay {
  return {
    id,
    kind: "text",
    start,
    duration,
    text: `Overlay ${id}`,
    preset: "title-fade",
    animation: "fade",
    style: { fontSize: 96, color: "#ffffff", bold: true, accent: "#3b82f6", position: "center" },
    lane: 0,
    ...extra,
  };
}

/** A project with one 10-second asset `a` and the given clips laid back to back, plus overlays. */
export function makeProject(clips: Clip[], overlays: Overlay[] = []): Project {
  let t = 0;
  const placed = clips.map((c) => {
    const p = { ...c, start: t };
    t += c.out - c.in;
    return p;
  });
  return {
    version: 1,
    name: "Test",
    assets: {
      a: {
        id: "a",
        path: "/media/a.mp4",
        kind: "video",
        duration: 10,
        width: 640,
        height: 360,
        fps: 30,
        hasAudio: true,
      },
    },
    timeline: {
      width: 1920,
      height: 1080,
      fps: 30,
      fit: "contain",
      tracks: [{ id: "v1", kind: "video", clips: placed }],
      overlays,
    },
  };
}

/** The default three-clip project: 4 s + 3 s + 5 s = 12 s. */
export function defaultProject(overlays: Overlay[] = []): Project {
  return makeProject(
    [clip("c1", "a", 0, 4), clip("c2", "a", 2, 5), clip("c3", "a", 1, 6)],
    overlays,
  );
}

/** The six built-in presets as the server lists them. */
export const PRESETS: PresetInfo[] = [
  {
    id: "title-fade",
    label: "Title: fade",
    category: "title",
    description: "Fading title",
    animation: "fade",
    defaultDuration: 3,
    defaultText: "Your title",
  },
  {
    id: "title-pop",
    label: "Title: pop",
    category: "title",
    description: "Pop title",
    animation: "pop",
    defaultDuration: 2.5,
    defaultText: "Big idea",
  },
  {
    id: "lower-third-slide",
    label: "Lower third: slide",
    category: "lower-third",
    description: "Name plate",
    animation: "slide-left",
    defaultDuration: 4,
    defaultText: "Speaker name",
    defaultSubtitle: "Role",
  },
  {
    id: "caption-bottom",
    label: "Caption: bottom",
    category: "caption",
    description: "Caption",
    animation: "fade",
    defaultDuration: 3,
    defaultText: "Caption text",
  },
];

/** A full {@link StateResponse} around a project. */
export function makeState(project: Project, extra: Partial<StateResponse> = {}): StateResponse {
  return {
    project,
    history: [
      {
        id: 0,
        parent: null,
        label: "Start",
        source: "system",
        at: "2026-01-01T00:00:00Z",
        current: true,
        duration: 12,
        clips: 3,
        overlays: 0,
      },
    ],
    canUndo: false,
    canRedo: false,
    presets: PRESETS,
    jobs: [],
    settings: { activeProvider: "local", providers: {} },
    providers: [],
    busy: false,
    serverVersion: "test",
    ...extra,
  };
}

/** A fake {@link EditorApi}. `run` is a vi.fn that resolves ok unless you give it a different implementation. */
export function makeApi(
  state: StateResponse,
  run?: EditorApi["run"],
): EditorApi & { run: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(run ?? (async (): Promise<CommandResponse> => ({ ok: true, summary: "ok" })));
  return { state, serverUrl: "http://server.test", token: "tok", run: fn as never } as EditorApi & {
    run: ReturnType<typeof vi.fn>;
  };
}

/** Render `ui` inside an EditorProvider for `api`. Returns Testing Library's result plus a way to swap the api. */
export function renderEditor(ui: ReactElement, api: EditorApi) {
  const result = render(<EditorProvider api={api}>{ui}</EditorProvider>);
  return {
    ...result,
    setApi(next: EditorApi) {
      result.rerender(<EditorProvider api={next}>{ui}</EditorProvider>);
    },
  };
}
