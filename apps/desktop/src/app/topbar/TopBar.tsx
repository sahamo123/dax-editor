// The bar across the top: project name, Import, Undo/Redo, History, Export (with live progress) and Settings.
// Every control has a text label or aria-label and a visible focus ring.

import type { ReactElement } from "react";
import { TaskQueue } from "../chat/TaskQueue";
import { useApp, useController } from "../context";
import { isProjectEmpty, runningExport } from "../selectors";
import { Icon } from "../ui/icons";
import { useImport } from "../use-import";
import { ProjectMenu } from "./ProjectMenu";

/** The application's top bar. */
export function TopBar({
  compact = false,
  compactView = "edit",
  onCompactView,
}: {
  compact?: boolean;
  compactView?: "edit" | "assistant";
  onCompactView?(view: "edit" | "assistant"): void;
} = {}): ReactElement {
  const controller = useController();
  const state = useApp((s) => s.state);
  const jobs = useApp((s) => s.jobs);
  const online = useApp((s) => s.connection.status === "online");
  const drawerOpen = useApp((s) => s.ui.drawerOpen);
  const drawerTab = useApp((s) => s.ui.drawerTab);
  const patchUi = useApp((s) => s.patchUi);
  const startImport = useImport();
  const tasks = useApp((s) => s.state?.tasks);
  const unfinished = (tasks ?? []).filter(
    (task) => task.status === "running" || task.status === "queued",
  );
  const recentFinished = (tasks ?? [])
    .filter((task) => task.status !== "running" && task.status !== "queued")
    .slice(-5);
  const attention = recentFinished.filter(
    (task) => task.status === "failed" || task.status === "interrupted",
  ).length;

  const exporting = runningExport(jobs);
  const percent = exporting ? Math.round(exporting.progress * 100) : 0;
  const drawerVisible = drawerOpen && (!compact || compactView === "edit");
  const historyActive = drawerVisible && drawerTab === "history";

  return (
    <header className="topbar">
      <div className="topbar__brand" aria-hidden="true">
        <span className="logo-mark" />
      </div>
      <h1 className="topbar__project" title={state?.projectPath ?? "Not saved to a file yet"}>
        {state?.project.name ?? "dax editor"}
      </h1>

      <div className="topbar__spacer" />
      {compact ? (
        <fieldset className="workspace-switch" aria-label="Workspace view">
          <button
            type="button"
            className="btn"
            aria-label="Edit view"
            aria-pressed={compactView === "edit"}
            onClick={() => onCompactView?.("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Assistant view"
            aria-pressed={compactView === "assistant"}
            onClick={() => onCompactView?.("assistant")}
          >
            Assistant
          </button>
        </fieldset>
      ) : null}
      <ProjectMenu />
      <button
        id="project-setup-trigger"
        type="button"
        className="btn"
        aria-label="Project setup"
        disabled={!state}
        onClick={() => {
          if (compact) onCompactView?.("edit");
          if (isProjectEmpty(state)) {
            patchUi({ setupVisible: true });
            requestAnimationFrame(() => document.getElementById("setup-skip")?.focus());
          } else {
            patchUi({ drawerOpen: true, drawerTab: "tools" });
          }
        }}
      >
        Setup
      </button>
      <details className="project-menu work-menu">
        <summary className="btn" aria-label="Work status" aria-describedby="work-status-detail">
          Work ·{" "}
          <span id="work-status-detail" aria-live="polite">
            {unfinished.length ? `${unfinished.length} active/queued` : "idle"}
            {attention ? ` · ${attention} ${attention === 1 ? "issue" : "issues"}` : ""}
          </span>
        </summary>
        <div className="project-menu__panel">
          <TaskQueue />
        </div>
      </details>

      <button type="button" className="btn" onClick={() => void startImport()} disabled={!online}>
        <Icon name="import" /> Import
      </button>

      <fieldset className="topbar__group">
        <legend className="sr-only">History controls</legend>
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!online || !state?.canUndo}
          onClick={() => void controller.undo()}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title="Redo (Shift+Ctrl+Z)"
          disabled={!online || !state?.canRedo}
          onClick={() => void controller.redo()}
        >
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className={`icon-btn${historyActive ? " is-active" : ""}`}
          aria-label="History"
          aria-pressed={historyActive}
          title="Version history"
          onClick={() => {
            if (compact) onCompactView?.("edit");
            patchUi({ drawerOpen: true, drawerTab: "history" });
          }}
        >
          <Icon name="history" />
        </button>
      </fieldset>

      <button
        type="button"
        className={`btn btn--primary btn--export${exporting ? " is-busy" : ""}`}
        onClick={() => {
          // Keep the busy control focusable, but never start a second export from it.
          if (!exporting) patchUi({ exportOpen: true });
        }}
        disabled={!online || !state || Object.keys(state.project.assets).length === 0}
        aria-disabled={exporting ? true : undefined}
        aria-label={exporting ? `Exporting, ${percent} percent` : "Export"}
      >
        {exporting ? (
          <>
            <span className="btn__progress" style={{ width: `${percent}%` }} aria-hidden="true" />
            <span className="btn__label">Exporting {percent}%</span>
          </>
        ) : (
          <>
            <Icon name="export" /> Export
          </>
        )}
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label="Settings"
        title="Settings"
        onClick={() => patchUi({ settingsOpen: true, settingsKind: null })}
      >
        <Icon name="settings" />
      </button>
      <button
        id="side-panel-trigger"
        type="button"
        className={`icon-btn${drawerVisible ? " is-active" : ""}`}
        aria-label={drawerVisible ? "Hide side panel" : "Show side panel"}
        aria-pressed={drawerVisible}
        title={drawerVisible ? "Hide side panel" : "Show side panel"}
        onClick={() => {
          if (compact) onCompactView?.("edit");
          patchUi({ drawerOpen: !drawerVisible });
        }}
      >
        <Icon name="panelRight" />
      </button>
    </header>
  );
}
