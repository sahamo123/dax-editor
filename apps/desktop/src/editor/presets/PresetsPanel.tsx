// The Presets panel: the built-in animated text presets from `state.presets`, grouped by category, each with a live
// animated chip. Drag a preset onto the timeline to add it at the drop time, or click it to add it at the playhead.
// Dragging uses pointer events (not HTML5 drag and drop, which is unreliable inside Tauri webviews).

import type { PresetInfo } from "@dax/protocol";
import { type PointerEvent as ReactPointerEvent, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEditActions } from "../actions";
import { useEditorApi, useEditorSelector, useEditorStore } from "../context";
import { startPointerDrag } from "../timeline/drag-session";
import { PresetChip } from "./PresetChip";

const CATEGORY_ORDER = ["title", "lower-third", "caption", "callout"];
const CATEGORY_LABEL: Record<string, string> = {
  title: "Titles",
  "lower-third": "Lower thirds",
  caption: "Captions",
  callout: "Callouts",
};

/** Group presets by category, known categories first in a fixed order, then any others alphabetically. */
export function groupPresets(
  presets: readonly PresetInfo[],
): { category: string; label: string; items: PresetInfo[] }[] {
  const map = new Map<string, PresetInfo[]>();
  for (const p of presets) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  const known = CATEGORY_ORDER.filter((c) => map.has(c));
  const others = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...others].map((category) => ({
    category,
    label:
      CATEGORY_LABEL[category] ??
      category.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    items: map.get(category) ?? [],
  }));
}

/** Floating copy of the preset that follows the pointer while dragging. */
function DragGhost() {
  const drag = useEditorSelector((s) => s.presetDrag);
  useEffect(() => {
    if (!drag) return;
    document.body.classList.add("dx-dragging");
    return () => document.body.classList.remove("dx-dragging");
  }, [drag]);
  if (!drag) return null;
  return createPortal(
    <div
      className={`dx-drag-ghost${drag.hoverTime !== null ? " is-over" : ""}`}
      style={{ left: drag.clientX + 14, top: drag.clientY + 14 }}
      data-testid="drag-ghost"
    >
      <PresetChip preset={drag.preset} />
      <div className="dx-drag-ghost-label">
        {drag.hoverTime !== null ? `Drop at ${drag.hoverTime.toFixed(2)}s` : drag.preset.label}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The presets list. Needs to be inside an `EditorProvider`; a Timeline elsewhere on the page receives the drops.
 */
export function PresetsPanel({ className }: { className?: string }) {
  const api = useEditorApi();
  const store = useEditorStore();
  const actions = useEditActions();
  const groups = groupPresets(api.state.presets);

  const onPointerDown = (e: ReactPointerEvent, preset: PresetInfo) => {
    if (e.button !== 0) return;
    startPointerDrag(
      e,
      { threshold: 5 },
      {
        onDragStart: () => store.beginPresetDrag(preset, e.clientX, e.clientY),
        onMove: ({ clientX, clientY }) => store.movePresetDrag(clientX, clientY),
        onEnd: (_info, outcome) => {
          if (outcome === "commit") store.endPresetDrag();
          else if (outcome === "cancel") store.cancelPresetDrag();
          else void actions.addPreset(preset, store.getState().playhead);
        },
      },
    );
  };

  if (api.state.presets.length === 0) {
    return (
      <div
        className={`dx-presets dx-empty${className ? ` ${className}` : ""}`}
        data-testid="presets-panel"
      >
        No presets available.
      </div>
    );
  }

  return (
    <div className={`dx-presets${className ? ` ${className}` : ""}`} data-testid="presets-panel">
      <p className="dx-hint">Drag onto the timeline, or click to add at the playhead.</p>
      {groups.map((g) => (
        <section key={g.category} className="dx-preset-group">
          <h3 className="dx-group-title">{g.label}</h3>
          <div className="dx-preset-grid">
            {g.items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="dx-preset"
                data-testid="preset"
                data-preset-id={p.id}
                title={p.description}
                onPointerDown={(e) => onPointerDown(e, p)}
                onClick={(e) => {
                  // Keyboard activation (detail 0). Pointer clicks are handled by the drag session above.
                  if (e.detail === 0) void actions.addPreset(p, store.getState().playhead);
                }}
              >
                <PresetChip preset={p} />
                <span className="dx-preset-meta">
                  <span className="dx-preset-label">{p.label}</span>
                  <span className="dx-preset-desc">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <DragGhost />
    </div>
  );
}
