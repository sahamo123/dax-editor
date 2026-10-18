// The editor's own UI state (playhead, playback, selection, zoom, preset drag) as a tiny external store that
// React reads with useSyncExternalStore selectors. Kept outside React so the 60 Hz playhead never re-renders
// components that do not read it. It never holds project data: that always comes from EditorApi.state.

import type { PresetInfo } from "@dax/protocol";
import { clampZoom, DEFAULT_ZOOM, fitZoom } from "./lib/geometry";
import { clamp, snapToFrame } from "./lib/time";
import type { EditorSelection } from "./types";

/** A preset being dragged from the Presets panel towards the timeline. */
export interface PresetDragState {
  preset: PresetInfo;
  /** Pointer position in viewport pixels, for the floating drag ghost. */
  clientX: number;
  clientY: number;
  /** Timeline time under the pointer when it is over the timeline's lanes; null elsewhere. */
  hoverTime: number | null;
}

/** Something that can receive a dragged preset. The Timeline registers one. */
export interface PresetDropTarget {
  /** Timeline time for a viewport point if it is over the drop area, else null. */
  hitTest(clientX: number, clientY: number): number | null;
  /** Called on release over the drop area. */
  drop(preset: PresetInfo, time: number): void;
}

/** Everything the store holds. Replaced (never mutated) on each change. */
export interface EditorState {
  playhead: number;
  /** Bumped whenever the playhead is moved by the user/app (not by playback), so the player knows to seek. */
  seekToken: number;
  playing: boolean;
  /** Playback speed: 1 normal, 2/4 fast forward, -1/-2/-4 reverse (stepped, silent). */
  rate: number;
  loop: boolean;
  muted: boolean;
  selection: EditorSelection | null;
  zoom: number;
  snapping: boolean;
  /** Last command failure, shown briefly by the timeline. */
  error: string | null;
  presetDrag: PresetDragState | null;
}

const INITIAL: EditorState = {
  playhead: 0,
  seekToken: 0,
  playing: false,
  rate: 1,
  loop: false,
  muted: false,
  selection: null,
  zoom: DEFAULT_ZOOM,
  snapping: true,
  error: null,
  presetDrag: null,
};

/** Rates cycled by repeated L / J key presses. */
export const SPEEDS = [1, 2, 4] as const;

/** The editor UI store. One instance lives inside each `EditorProvider`. */
export class EditorStore {
  private state: EditorState = INITIAL;
  private listeners = new Set<() => void>();
  private dropTarget: PresetDropTarget | null = null;

  /** Length of the video in seconds; kept current by the provider and used to clamp the playhead. */
  duration = 0;
  /** Timeline frame rate; kept current by the provider and used for frame stepping. */
  fps = 30;
  /** Number of mounted previews driving playback. With none, the provider runs a silent clock instead. */
  players = 0;
  /** Registered by the Timeline: lets the toolbar fit the zoom to the window and scroll to the start. */
  viewport: { trackWidth(): number; scrollTo(left: number): void } | null = null;

  /** Current snapshot (a stable object until something changes). */
  getState = (): EditorState => this.state;

  /** Subscribe to changes; returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(p: Partial<EditorState>): void {
    let changed = false;
    for (const k of Object.keys(p) as (keyof EditorState)[]) {
      if (this.state[k] !== p[k]) changed = true;
    }
    if (!changed) return;
    this.state = { ...this.state, ...p };
    for (const l of [...this.listeners]) l();
  }

  /** Move the playhead (clamped to the video) and ask the player to seek there. */
  setPlayhead = (seconds: number): void => {
    const t = clamp(Number.isFinite(seconds) ? seconds : 0, 0, this.duration);
    this.patch({ playhead: t, seekToken: this.state.seekToken + 1 });
  };

  /** Called by the player each frame during playback; does not request a seek. */
  reportPlayhead = (seconds: number): void => {
    this.patch({ playhead: clamp(seconds, 0, this.duration) });
  };

  /**
   * Start or stop playback. Starting at (or past) the end restarts from zero. Stopping resets the speed to normal.
   * Call from a user gesture so browsers allow audio to start.
   */
  setPlaying = (playing: boolean): void => {
    if (playing === this.state.playing) return;
    if (playing) {
      if (this.duration <= 0) return;
      const atEnd = this.state.playhead >= this.duration - 0.5 / this.fps;
      this.patch(
        atEnd && this.state.rate > 0
          ? { playing: true, playhead: 0, seekToken: this.state.seekToken + 1 }
          : { playing: true },
      );
    } else {
      this.patch({ playing: false, rate: 1 });
    }
  };

  /** Toggle between playing and paused at normal speed. */
  togglePlay = (): void => {
    if (this.state.playing) {
      this.setPlaying(false);
    } else {
      this.patch({ rate: 1 });
      this.setPlaying(true);
    }
  };

  /** Play forward; pressing again while playing forward steps through {@link SPEEDS}. */
  playForward = (): void => {
    const { playing, rate } = this.state;
    if (playing && rate > 0) {
      const i = SPEEDS.indexOf(rate as (typeof SPEEDS)[number]);
      this.patch({ rate: SPEEDS[(i + 1) % SPEEDS.length] ?? 1 });
      return;
    }
    this.patch({ rate: 1 });
    this.setPlaying(true);
  };

  /** Play backward (stepped, silent); pressing again while reversing increases the speed. */
  playReverse = (): void => {
    const { playing, rate } = this.state;
    if (this.duration <= 0) return;
    if (playing && rate < 0) {
      const i = SPEEDS.indexOf(Math.abs(rate) as (typeof SPEEDS)[number]);
      this.patch({ rate: -(SPEEDS[(i + 1) % SPEEDS.length] ?? 1) });
      return;
    }
    this.patch({ rate: -1, playing: true });
  };

  /** Move the playhead by whole frames and pause. */
  stepFrames = (frames: number): void => {
    this.patch({ playing: false, rate: 1 });
    const t = snapToFrame(this.state.playhead, this.fps) + frames / this.fps;
    this.setPlayhead(snapToFrame(t, this.fps));
  };

  /** Change the selection. */
  select = (selection: EditorSelection | null): void => {
    const cur = this.state.selection;
    if (cur === selection) return;
    if (cur && selection && cur.kind === selection.kind && cur.id === selection.id) return;
    this.patch({ selection });
  };

  /** Set the zoom in pixels per second (clamped). */
  setZoom = (pixelsPerSecond: number): void => {
    this.patch({ zoom: clampZoom(pixelsPerSecond) });
  };

  /** Zoom by a factor (for example 1.25 to zoom in a step). */
  zoomBy = (factor: number): void => this.setZoom(this.state.zoom * factor);

  /** Zoom so the whole video fits the visible timeline, and scroll to the start. No-op without a Timeline. */
  zoomToFit = (): void => {
    const vp = this.viewport;
    if (!vp) return;
    this.setZoom(fitZoom(this.duration, vp.trackWidth()));
    vp.scrollTo(0);
  };

  /** Turn looping on or off. */
  setLoop = (loop: boolean): void => this.patch({ loop });

  /** Turn the preview's audio off or on. */
  setMuted = (muted: boolean): void => this.patch({ muted });

  /** Turn magnetic snapping on or off. */
  setSnapping = (snapping: boolean): void => this.patch({ snapping });

  /** Show (or clear, with null) a command failure message. */
  setError = (error: string | null): void => this.patch({ error });

  // ---- preset drag and drop (pointer based, because HTML5 drag and drop is unreliable inside Tauri webviews) ----

  /** Register the area that accepts dropped presets. Returns a function that unregisters it. */
  registerDropTarget = (target: PresetDropTarget): (() => void) => {
    this.dropTarget = target;
    return () => {
      if (this.dropTarget === target) this.dropTarget = null;
    };
  };

  /** Begin dragging a preset. */
  beginPresetDrag = (preset: PresetInfo, clientX: number, clientY: number): void => {
    this.patch({
      presetDrag: {
        preset,
        clientX,
        clientY,
        hoverTime: this.dropTarget?.hitTest(clientX, clientY) ?? null,
      },
    });
  };

  /** Update the dragged preset's pointer position. */
  movePresetDrag = (clientX: number, clientY: number): void => {
    const d = this.state.presetDrag;
    if (!d) return;
    this.patch({
      presetDrag: {
        ...d,
        clientX,
        clientY,
        hoverTime: this.dropTarget?.hitTest(clientX, clientY) ?? null,
      },
    });
  };

  /** Finish the drag: drops onto the timeline if the pointer is over it, otherwise cancels. */
  endPresetDrag = (): void => {
    const d = this.state.presetDrag;
    if (!d) return;
    this.patch({ presetDrag: null });
    if (d.hoverTime !== null) this.dropTarget?.drop(d.preset, d.hoverTime);
  };

  /** Abort the drag without dropping. */
  cancelPresetDrag = (): void => this.patch({ presetDrag: null });
}
