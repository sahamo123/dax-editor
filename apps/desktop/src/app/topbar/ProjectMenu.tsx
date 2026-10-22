// Project lifecycle controls: native dialogs, browser upload/download, recent files and autosave state.
import { type ReactElement, useRef, useState } from "react";
import { pickProjectPath } from "../../platform";
import { useApp, useController } from "../context";
import { basename } from "../format";
import { Modal } from "../ui/Modal";

/** Accessible project menu with a browser file flow and native project dialogs. */
export function ProjectMenu(): ReactElement {
  const controller = useController();
  const state = useApp((s) => s.state);
  const online = useApp((s) => s.connection.status === "online");
  const toast = useApp((s) => s.pushToast);
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("Untitled");
  const [working, setWorking] = useState(false);
  const open = async () => {
    try {
      const path = await pickProjectPath();
      if (path === null) input.current?.click();
      else if (path) await controller.project("open", path);
    } catch {
      toast("error", "Could not open the project picker.");
    }
  };
  const saveAs = async () => {
    if (!state) return;
    try {
      const path = await pickProjectPath(true);
      if (path === "") return;
      if (path) {
        await controller.project("save", path);
        return;
      }
      if (!(await controller.project("save"))) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(state.project, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${state.project.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "project"}.dax.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast("error", "Could not save the project copy.");
    }
  };
  return (
    <>
      <details
        className="project-menu"
        onToggle={(event) => {
          if (event.currentTarget.open) void controller.recentProjects().then(setRecent);
        }}
      >
        <summary className="btn">Project</summary>
        <div className="project-menu__panel stack">
          <button
            className="btn"
            type="button"
            disabled={!online || working}
            onClick={() => setNewOpen(true)}
          >
            New project
          </button>
          <button
            className="btn"
            type="button"
            disabled={!online || working}
            onClick={() => void open()}
          >
            Open project…
          </button>
          <button
            className="btn"
            type="button"
            disabled={!online || working}
            onClick={() => void controller.project("save")}
          >
            Save project
          </button>
          <button
            className="btn"
            type="button"
            disabled={!online || working}
            onClick={() => void saveAs()}
          >
            Save project as…
          </button>
          <p className={state?.saveError ? "note note--error" : "muted"} role="status">
            {state?.saveError
              ? `Autosave failed: ${state.saveError}`
              : "Changes autosave locally. Project copies reference your media files."}
          </p>
          <strong>Recent projects</strong>
          {recent.length ? (
            recent.slice(0, 8).map((path) => (
              <button
                className="btn"
                key={path}
                title={path}
                type="button"
                disabled={!online || working}
                onClick={() => void controller.project("open", path)}
              >
                {basename(path)}
              </button>
            ))
          ) : (
            <small className="muted">No recent projects</small>
          )}
        </div>
      </details>
      <input
        ref={input}
        type="file"
        accept=".dax.json,.json"
        hidden
        aria-label="Open Dax project"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 900_000) {
            toast(
              "error",
              "This project exceeds the browser import limit. Open it in the desktop app.",
            );
            return;
          }
          setWorking(true);
          try {
            await controller.project("copy", JSON.parse(await file.text()));
          } catch {
            toast("error", "Choose a valid Dax project JSON file.");
          } finally {
            setWorking(false);
          }
        }}
      />
      {newOpen ? (
        <Modal title="New project" onClose={() => setNewOpen(false)}>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setWorking(true);
              try {
                if (await controller.project("new", name.trim())) setNewOpen(false);
              } finally {
                setWorking(false);
              }
            }}
          >
            <label className="field">
              <span className="field__label">Project name</span>
              <input
                className="input"
                data-autofocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <p className="muted">
              Your current project stays saved locally. Finish or cancel queued work before
              switching.
            </p>
            <button className="btn btn--primary" disabled={!name.trim() || working} type="submit">
              Create project
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
