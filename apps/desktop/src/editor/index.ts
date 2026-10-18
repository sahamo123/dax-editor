// PLACEHOLDER - replaced at merge by the editor builder's `src/editor/index.ts`.
// A deliberately tiny stand-in that exports the exact public surface from docs/specs/product-v1.md
// so the app shell compiles and can be tested on its own. Nothing here is real editor behaviour.

import { mediaUrl } from "@dax/protocol";
import {
  createContext,
  createElement as h,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import type { EditorApi, EditorUi } from "./types";

export type { EditorApi, EditorUi } from "./types";

const EditorContext = createContext<(EditorApi & EditorUi) | null>(null);

/** Placeholder provider: holds the playhead, selection and zoom and passes `api` through. */
export function EditorProvider(props: { api: EditorApi; children: ReactNode }): ReactElement {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, select] = useState<EditorUi["selection"]>(null);
  const [zoom, setZoom] = useState(80);
  const value = useMemo(
    () => ({
      ...props.api,
      playhead,
      setPlayhead,
      playing,
      setPlaying,
      selection,
      select,
      zoom,
      setZoom,
    }),
    [props.api, playhead, playing, selection, zoom],
  );
  return h(EditorContext.Provider, { value }, props.children);
}

/** The editor's state and the app API in one object. Throws outside an {@link EditorProvider}. */
export function useEditor(): EditorApi & EditorUi {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside <EditorProvider>");
  return ctx;
}

/** Placeholder: the real editor binds its keyboard shortcuts here. */
export function useEditorShortcuts(): void {}

const box = {
  background: "#000",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-dim, #9aa3b2)",
  fontSize: 12,
} as const;

/** Placeholder preview: the first asset's thumbnail on black. */
export function PreviewPane(): ReactElement {
  const ed = useEditor();
  const first = ed.state.project.timeline.tracks[0]?.clips[0];
  return h(
    "div",
    { style: { ...box, height: "100%", width: "100%", position: "relative" } },
    first
      ? h("img", {
          alt: "",
          src: mediaUrl(ed.serverUrl, ed.token, first.assetId, "thumb.jpg"),
          style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
        })
      : null,
    h(
      "span",
      { style: { position: "absolute", bottom: 8, left: 12 } },
      "Preview (editor placeholder)",
    ),
  );
}

/** Placeholder timeline: one block per clip, widths proportional to duration. */
export function Timeline(): ReactElement {
  const ed = useEditor();
  const clips = ed.state.project.timeline.tracks.flatMap((t) => t.clips);
  return h(
    "div",
    { style: { padding: 12, color: "var(--text-dim, #9aa3b2)", fontSize: 12 } },
    h("div", { style: { marginBottom: 8 } }, "Timeline (editor placeholder)"),
    h(
      "div",
      { style: { display: "flex", gap: 2 } },
      clips.map((c) =>
        h(
          "button",
          {
            key: c.id,
            type: "button",
            onClick: () => ed.select({ kind: "clip", id: c.id }),
            style: {
              width: Math.max(24, (c.out - c.in) * ed.zoom),
              height: 44,
              background: "var(--bg-3, #242936)",
              color: "inherit",
              border: "1px solid var(--border-strong, #343b4a)",
              borderRadius: 4,
            },
          },
          c.id.slice(0, 8),
        ),
      ),
    ),
  );
}

/** Placeholder presets list. */
export function PresetsPanel(): ReactElement {
  const ed = useEditor();
  return h(
    "ul",
    { style: { margin: 0, padding: 12, listStyle: "none", fontSize: 13 } },
    ed.state.presets.map((p) => h("li", { key: p.id, style: { padding: "4px 0" } }, p.label)),
  );
}

/** Placeholder inspector. */
export function Inspector(): ReactElement {
  const ed = useEditor();
  return h(
    "div",
    { style: { padding: 12, fontSize: 13, color: "var(--text-dim, #9aa3b2)" } },
    ed.selection ? `Selected ${ed.selection.kind} ${ed.selection.id}` : "Nothing selected",
  );
}

/** Placeholder editor toolbar. */
export function EditorToolbar(): ReactElement {
  return h("div", { style: { height: 32 } });
}
