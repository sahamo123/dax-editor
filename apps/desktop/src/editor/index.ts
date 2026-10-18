// Public surface of the editor module. The app shell imports only from here.
// Usage: wrap the editing UI in <EditorProvider api={...}>, call useEditorShortcuts() once inside it, and place
// PreviewPane over Timeline, with PresetsPanel / Inspector / EditorToolbar wherever the layout wants them.

import "./ui/editor.css";

export { EditorProvider, useEditor } from "./context";
export { Inspector } from "./inspector/Inspector";
export { PresetsPanel } from "./presets/PresetsPanel";
export { PreviewPane } from "./preview/PreviewPane";
export { useEditorShortcuts } from "./shortcuts";
export { Timeline } from "./timeline/Timeline";
export { EditorToolbar } from "./toolbar/EditorToolbar";
export type { EditorApi, EditorSelection, EditorUi } from "./types";
