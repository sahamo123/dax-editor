// PLACEHOLDER - replaced at merge by the editor builder's version of this file.
// The interfaces below are copied verbatim from docs/specs/product-v1.md ("UI split: two builders, one interface").
// Do not extend them here; the app shell only depends on exactly this surface.

import type { CommandResponse, StateResponse } from "@dax/protocol";

/** What the editor needs from the rest of the app. Implemented by the app shell. */
export interface EditorApi {
  /** Latest server state; replaced whenever the server pushes a `state` event. */
  state: StateResponse;
  /** Base URL and token, used with `mediaUrl()` from @dax/protocol to build media URLs. */
  serverUrl: string;
  token: string;
  /** Run a registry command via POST /api/command. Never throws: failures come back as { ok: false }. */
  run(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
}

/** Editor-owned UI state, available to the app shell through useEditor(). */
export interface EditorUi {
  playhead: number; // seconds on the timeline
  setPlayhead(seconds: number): void;
  playing: boolean;
  setPlaying(playing: boolean): void;
  selection: { kind: "clip" | "overlay"; id: string } | null;
  select(selection: { kind: "clip" | "overlay"; id: string } | null): void;
  zoom: number; // pixels per second
  setZoom(pixelsPerSecond: number): void;
}
