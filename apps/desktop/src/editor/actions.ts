// The edit actions shared by the toolbar, the keyboard shortcuts and the timeline. Each one is a thin wrapper that
// runs a registry command through EditorApi.run (via useExec); none of them touches project data directly.

import type { PresetInfo } from "@dax/protocol";
import { useMemo, useRef } from "react";
import { useEditorApi, useEditorStore, useExec } from "./context";
import { clipEndTime, type mainClips } from "./lib/project";
import { round } from "./lib/time";

/** The edit actions. All return after the command finished; failures are reported through the editor error toast. */
export interface EditActions {
  /** Cut the clip under the playhead in two (`split`). */
  split(): Promise<void>;
  /** Remove the selected clip (ripple, `remove_clip`) or overlay (`remove_overlay`). */
  deleteSelected(): Promise<void>;
  /** `undo` / `redo` through the command registry. */
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Add a text preset (`add_overlay`) at a timeline time and select the new overlay. */
  addPreset(preset: Pick<PresetInfo, "id">, start: number): Promise<void>;
}

/** True when the playhead is strictly inside a clip, so `split` can work. */
export function canSplitAt(clips: ReturnType<typeof mainClips>, t: number): boolean {
  return clips.some((c) => t > c.start + 1e-3 && t < clipEndTime(c) - 1e-3);
}

/** Build the {@link EditActions} for the current editor. The object is stable for the life of the provider. */
export function useEditActions(): EditActions {
  const exec = useExec();
  const store = useEditorStore();
  const api = useEditorApi();
  // The actions read the latest state at call time through the store/api refs below.
  const apiRef = useLatest(api);
  return useMemo<EditActions>(
    () => ({
      async split() {
        await exec("split", { at: round(store.getState().playhead, 4) });
      },
      async deleteSelected() {
        const sel = store.getState().selection;
        if (!sel) return;
        const res =
          sel.kind === "clip"
            ? await exec("remove_clip", { clipId: sel.id })
            : await exec("remove_overlay", { overlayId: sel.id });
        if (res.ok) store.select(null);
      },
      async undo() {
        if (apiRef.current.state.canUndo) await exec("undo");
      },
      async redo() {
        if (apiRef.current.state.canRedo) await exec("redo");
      },
      async addPreset(preset, start) {
        const res = await exec("add_overlay", {
          preset: preset.id,
          start: round(Math.max(0, start), 3),
        });
        const data = res.ok ? res.data : undefined;
        const id =
          data && typeof data === "object" && "overlayId" in data
            ? (data as { overlayId: unknown }).overlayId
            : undefined;
        if (typeof id === "string") store.select({ kind: "overlay", id });
      },
    }),
    [exec, store, apiRef],
  );
}

/** A ref that always holds the latest value passed in (assigned during render). */
function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
