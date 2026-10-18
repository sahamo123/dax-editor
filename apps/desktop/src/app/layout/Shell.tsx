// The whole window once connected: top bar, chat on the left, preview over timeline in the middle, tabbed drawer
// on the right. Panels are resizable (mouse or keyboard) and sizes are remembered. The editor module is hosted
// here: this file turns the store into the `EditorApi` it expects.

import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  type EditorApi,
  EditorProvider,
  EditorToolbar,
  PreviewPane,
  Timeline,
  useEditor,
  useEditorShortcuts,
} from "../../editor";
import { ChatPanel } from "../chat/ChatPanel";
import { useApp, useController } from "../context";
import { ExportDialog } from "../dialogs/ExportDialog";
import { ImportDialog } from "../dialogs/ImportDialog";
import { isProjectEmpty } from "../selectors";
import { SettingsDialog } from "../settings/SettingsDialog";
import { TopBar } from "../topbar/TopBar";
import { Splitter, useStoredNumber } from "../ui/Splitter";
import { Toasts } from "../ui/Toasts";
import { useUndoRedoKeys } from "../use-shortcuts";
import { ConnectionBanner } from "./ConnectionBanner";
import { Drawer } from "./Drawer";
import { EmptyState } from "./EmptyState";

const SPLITTER_PX = 6;
const MIN_CENTER = 460;

function useViewportWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/** Switches the drawer to the Inspector when the user selects something on the timeline. */
function useInspectOnSelect(): void {
  const { selection } = useEditor();
  const patchUi = useApp((s) => s.patchUi);
  const key = selection ? `${selection.kind}:${selection.id}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to a change of selection
  useEffect(() => {
    if (key) patchUi({ drawerOpen: true, drawerTab: "inspector" });
  }, [key]);
}

/** The preview-over-timeline column, or the first-run screen when nothing is imported. */
function Workspace({
  timelineHeight,
  onTimelineHeight,
  maxTimeline,
}: {
  timelineHeight: number;
  onTimelineHeight(n: number): void;
  maxTimeline: number;
}): ReactElement {
  const empty = useApp((s) => isProjectEmpty(s.state));
  useEditorShortcuts();
  useInspectOnSelect();

  if (empty) return <EmptyState />;
  return (
    <div
      className="workspace"
      style={{ gridTemplateRows: `minmax(160px, 1fr) ${SPLITTER_PX}px ${timelineHeight}px` }}
    >
      <section className="workspace__preview" aria-label="Preview">
        <PreviewPane />
      </section>
      <Splitter
        orientation="horizontal"
        label="Resize timeline"
        value={timelineHeight}
        min={150}
        max={maxTimeline}
        grow="toward-start"
        onChange={onTimelineHeight}
      />
      <section className="workspace__timeline" aria-label="Timeline">
        <EditorToolbar />
        <Timeline />
      </section>
    </div>
  );
}

function Waiting(): ReactElement {
  const status = useApp((s) => s.connection.status);
  return (
    <div className="workspace workspace--waiting" aria-live="polite">
      <p className="muted">
        {status === "connecting"
          ? "Connecting to the editor engine..."
          : "Waiting for the editor engine..."}
      </p>
    </div>
  );
}

/** Hosts the editor module: it gets an `EditorApi` as soon as the first state has arrived. */
function EditorHost({ children }: { children: ReactNode }): ReactNode {
  const state = useApp((s) => s.state);
  const server = useApp((s) => s.server);
  const controller = useController();
  const api = useMemo<EditorApi | null>(
    () =>
      state && server
        ? { state, serverUrl: server.url, token: server.token, run: controller.run }
        : null,
    [state, server, controller],
  );
  return api ? <EditorProvider api={api}>{children}</EditorProvider> : children;
}

/** The connected application window. */
export function Shell(): ReactElement {
  const hasState = useApp((s) => s.state !== null);
  const drawerOpen = useApp((s) => s.ui.drawerOpen);
  const settingsOpen = useApp((s) => s.ui.settingsOpen);
  const importOpen = useApp((s) => s.ui.importOpen);
  const exportOpen = useApp((s) => s.ui.exportOpen);
  const dropHover = useApp((s) => s.ui.dropHover);
  const viewport = useViewportWidth();
  const [chatW, setChatW] = useStoredNumber("dax.chatWidth", 380);
  const [drawerW, setDrawerW] = useStoredNumber("dax.drawerWidth", 320);
  const [timelineH, setTimelineH] = useStoredNumber("dax.timelineHeight", 300);
  useUndoRedoKeys();

  // Keep the middle column usable: panels may not squeeze it below MIN_CENTER.
  // The drawer hosts editor panels that need server state, so it waits for the first state.
  const showDrawer = drawerOpen && hasState;
  const drawerSpace = showDrawer ? drawerW + SPLITTER_PX : 0;
  const chatMax = Math.max(260, Math.min(600, viewport - drawerSpace - MIN_CENTER - SPLITTER_PX));
  const drawerMax = Math.max(240, Math.min(560, viewport - chatW - MIN_CENTER - 2 * SPLITTER_PX));
  const chat = Math.min(chatW, chatMax);
  const drawer = Math.min(drawerW, drawerMax);
  const maxTimeline = Math.max(160, window.innerHeight - 48 - 180 - SPLITTER_PX);

  const columns = showDrawer
    ? `${chat}px ${SPLITTER_PX}px minmax(0, 1fr) ${SPLITTER_PX}px ${drawer}px`
    : `${chat}px ${SPLITTER_PX}px minmax(0, 1fr)`;

  return (
    <div className="app">
      <TopBar />
      <ConnectionBanner />
      <EditorHost>
        <div className="app__body" style={{ gridTemplateColumns: columns }}>
          <ChatPanel />
          <Splitter
            orientation="vertical"
            label="Resize chat panel"
            value={chat}
            min={260}
            max={chatMax}
            onChange={setChatW}
          />
          {hasState ? (
            <Workspace
              timelineHeight={Math.min(timelineH, maxTimeline)}
              onTimelineHeight={setTimelineH}
              maxTimeline={maxTimeline}
            />
          ) : (
            <Waiting />
          )}
          {showDrawer ? (
            <>
              <Splitter
                orientation="vertical"
                label="Resize side panel"
                value={drawer}
                min={240}
                max={drawerMax}
                grow="toward-start"
                onChange={setDrawerW}
              />
              <Drawer />
            </>
          ) : null}
        </div>
      </EditorHost>
      {dropHover ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__box">Drop to import</div>
        </div>
      ) : null}
      {settingsOpen ? <SettingsDialog /> : null}
      {importOpen ? <ImportDialog /> : null}
      {exportOpen ? <ExportDialog /> : null}
      <Toasts />
    </div>
  );
}
