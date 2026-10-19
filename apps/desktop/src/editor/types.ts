// The public contract between the editor module and the app shell. The shell implements EditorApi;
// the editor owns EditorUi. Keep this file free of React and of runtime imports.

import type { CommandResponse, StateResponse } from "@dax/protocol";

/** What the editor needs from the rest of the app. Implemented by the app shell. */
export interface EditorApi {
  /** Latest server state; replaced whenever the server pushes a `state` event. */
  state: StateResponse;
  /** Base URL of the engine server, used with `mediaUrl()` from @dax/protocol to build media URLs. */
  serverUrl: string;
  /** Per-launch auth token, passed to `mediaUrl()` as the `?token=` query parameter. */
  token: string;
  /**
   * Run a registry command via `POST /api/command`.
   * Never throws: failures come back as `{ ok: false, error }`.
   */
  run(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
}

/** What is currently selected on the timeline. */
export interface EditorSelection {
  /** Main-track clip or text overlay. */
  kind: "clip" | "overlay";
  /** Clip id or overlay id from the project. */
  id: string;
}

/** Editor-owned UI state, available to the app shell through `useEditor()`. */
export interface EditorUi {
  /** Playhead position in timeline seconds. */
  playhead: number;
  /** Move the playhead (clamped to the timeline) and seek the preview. */
  setPlayhead(seconds: number): void;
  /** True while the preview is playing the edit. */
  playing: boolean;
  /** Start or stop playback. Starting from a user gesture is what satisfies browser autoplay rules. */
  setPlaying(playing: boolean): void;
  /** The selected clip or overlay, or null. */
  selection: EditorSelection | null;
  /** Change the selection; `null` clears it. */
  select(selection: EditorSelection | null): void;
  /** Timeline zoom in pixels per second. */
  zoom: number;
  /** Set the zoom (clamped to the supported range). */
  setZoom(pixelsPerSecond: number): void;
}
