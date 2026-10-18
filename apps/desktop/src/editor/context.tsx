// React wiring for the editor: the provider, and the hooks components use to read the project, the UI state
// and to run commands. The project always comes from `EditorApi.state`; this file never keeps a copy.

import type { Project } from "@dax/core";
import type { CommandResponse } from "@dax/protocol";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { findClip, findOverlay, videoDuration } from "./lib/project";
import { type EditorState, EditorStore } from "./store";
import type { EditorApi, EditorUi } from "./types";

const ApiContext = createContext<EditorApi | null>(null);
const StoreContext = createContext<EditorStore | null>(null);

function required<T>(value: T | null, hook: string): T {
  if (value === null) throw new Error(`${hook} must be used inside <EditorProvider>`);
  return value;
}

/**
 * Provides the editor to its children. Pass the app's {@link EditorApi}; pass a new object (or at least a new
 * `state`) whenever the server state changes. Create exactly one provider per editor.
 */
export function EditorProvider({ api, children }: { api: EditorApi; children: ReactNode }) {
  const storeRef = useRef<EditorStore | null>(null);
  if (storeRef.current === null) storeRef.current = new EditorStore();
  const store = storeRef.current;

  const project = api.state.project;
  // Set during render so children rendered in this pass already see the right bounds. Idempotent.
  store.duration = videoDuration(project);
  store.fps = project.timeline.fps;

  useKeepStateValid(store, project);
  useSilentClock(store);

  return (
    <StoreContext.Provider value={store}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    </StoreContext.Provider>
  );
}

/** Keep the playhead inside the video and the selection pointing at something that still exists. */
function useKeepStateValid(store: EditorStore, project: Project): void {
  useEffect(() => {
    const s = store.getState();
    if (s.playhead > store.duration) store.reportPlayhead(store.duration);
    const sel = s.selection;
    if (!sel) return;
    const exists = sel.kind === "clip" ? findClip(project, sel.id) : findOverlay(project, sel.id);
    if (!exists) store.select(null);
  }, [store, project]);
}

/**
 * Advance the playhead on a wall clock while `playing` is true but no PreviewPane is mounted (for example a layout
 * that hides the preview), so playback state never gets stuck.
 */
function useSilentClock(store: EditorStore): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      const s = store.getState();
      if (!s.playing || store.players > 0) {
        raf = 0;
        last = null;
        return;
      }
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      const next = s.playhead + dt * s.rate;
      if (next >= store.duration && s.rate > 0) {
        if (s.loop) store.setPlayhead(0);
        else {
          store.reportPlayhead(store.duration);
          store.setPlaying(false);
        }
      } else if (next <= 0 && s.rate < 0) {
        store.reportPlayhead(0);
        store.setPlaying(false);
      } else {
        store.reportPlayhead(next);
      }
      raf = requestAnimationFrame(loop);
    };
    const check = () => {
      const s = store.getState();
      if (s.playing && store.players === 0 && raf === 0) raf = requestAnimationFrame(loop);
    };
    const off = store.subscribe(check);
    check();
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [store]);
}

/** The editor's external store (for internal components). */
export function useEditorStore(): EditorStore {
  return required(useContext(StoreContext), "useEditorStore");
}

/** The app-provided {@link EditorApi} (latest state, URLs, run). */
export function useEditorApi(): EditorApi {
  return required(useContext(ApiContext), "useEditorApi");
}

/** The current project from the server state. */
export function useProject(): Project {
  return useEditorApi().state.project;
}

/**
 * Subscribe to one slice of the editor UI state. The selector should return a primitive (or a stable reference) so
 * the component only re-renders when that slice changes, which keeps 60 Hz playhead updates cheap.
 */
export function useEditorSelector<T>(selector: (s: EditorState) => T): T {
  const store = useEditorStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

/** Combined, always-fresh view of the editor for the app shell: API plus UI state. Re-renders on every playhead tick. */
export function useEditor(): EditorApi & EditorUi {
  const api = useEditorApi();
  const store = useEditorStore();
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const run = api.run;
  return useMemo<EditorApi & EditorUi>(
    () => ({
      state: api.state,
      serverUrl: api.serverUrl,
      token: api.token,
      run,
      playhead: s.playhead,
      setPlayhead: store.setPlayhead,
      playing: s.playing,
      setPlaying: store.setPlaying,
      selection: s.selection,
      select: store.select,
      zoom: s.zoom,
      setZoom: store.setZoom,
    }),
    [api.state, api.serverUrl, api.token, run, s, store],
  );
}

/** Identifies the current history state, so UI can tell when a command's result has arrived. */
export function useProjectRevision(): string {
  const { history } = useEditorApi().state;
  const current = history.find((h) => h.current);
  return `${current?.id ?? "none"}:${history.length}`;
}

/** Runs a command, records a failure in the editor store (shown by the timeline), and returns the response. */
export type Exec = (name: string, args?: Record<string, unknown>) => Promise<CommandResponse>;

/**
 * A stable function that runs a command through `EditorApi.run`. Failures set the editor's error message
 * and never throw. All edits made by the editor go through this.
 */
export function useExec(): Exec {
  const api = useEditorApi();
  const store = useEditorStore();
  const apiRef = useRef(api);
  apiRef.current = api;
  return useCallback<Exec>(
    async (name, args) => {
      let res: CommandResponse;
      try {
        res = await apiRef.current.run(name, args);
      } catch (err) {
        res = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      store.setError(res.ok ? null : res.error);
      return res;
    },
    [store],
  );
}
