// The bar across the top: project name, Import, Undo/Redo, History, Export (with live progress) and Settings.
// Every control has a text label or aria-label and a visible focus ring.

import type { ReactElement } from "react";
import { useApp, useController } from "../context";
import { runningExport } from "../selectors";
import { Icon } from "../ui/icons";
import { useImport } from "../use-import";
import { ProjectMenu } from "./ProjectMenu";

/** The application's top bar. */
export function TopBar(): ReactElement {
  const controller = useController();
  const state = useApp((s) => s.state);
  const jobs = useApp((s) => s.jobs);
  const online = useApp((s) => s.connection.status === "online");
  const drawerOpen = useApp((s) => s.ui.drawerOpen);
  const drawerTab = useApp((s) => s.ui.drawerTab);
  const patchUi = useApp((s) => s.patchUi);
  const startImport = useImport();

  const exporting = runningExport(jobs);
  const percent = exporting ? Math.round(exporting.progress * 100) : 0;
  const historyActive = drawerOpen && drawerTab === "history";

  return (
    <header className="topbar">
      <div className="topbar__brand" aria-hidden="true">
        <span className="logo-mark" />
      </div>
      <h1 className="topbar__project" title={state?.projectPath ?? "Not saved to a file yet"}>
        {state?.project.name ?? "dax editor"}
      </h1>

      <div className="topbar__spacer" />
      <ProjectMenu />

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
          onClick={() => patchUi({ drawerOpen: true, drawerTab: "history" })}
        >
          <Icon name="history" />
        </button>
      </fieldset>

      <button
        type="button"
        className={`btn btn--primary btn--export${exporting ? " is-busy" : ""}`}
        onClick={() => patchUi({ exportOpen: true })}
        disabled={
          !online || Boolean(exporting) || !state || Object.keys(state.project.assets).length === 0
        }
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
        type="button"
        className={`icon-btn${drawerOpen ? " is-active" : ""}`}
        aria-label={drawerOpen ? "Hide side panel" : "Show side panel"}
        aria-pressed={drawerOpen}
        title={drawerOpen ? "Hide side panel" : "Show side panel"}
        onClick={() => patchUi({ drawerOpen: !drawerOpen })}
      >
        <Icon name="panelRight" />
      </button>
    </header>
  );
}
