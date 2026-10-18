// Choose where to write the finished MP4 and start the export. Progress then shows on the Export button.

import { type ReactElement, useState } from "react";
import { isTauri, pickSavePath } from "../../platform";
import { useApp, useController } from "../context";
import { basename, dirname, safeFileName } from "../format";
import { Modal } from "../ui/Modal";

/** Suggest `<folder of the first video>/<project name>.mp4`; empty if nothing is imported. */
function suggestPath(projectName: string, assetPaths: string[]): string {
  const first = assetPaths[0];
  if (!first) return "";
  const dir = dirname(first);
  const sep = first.includes("\\") ? "\\" : "/";
  const name = `${safeFileName(projectName)}.mp4`;
  return dir ? `${dir}${sep}${name}` : name;
}

/** The export dialog. Opens when `ui.exportOpen` is set. */
export function ExportDialog(): ReactElement {
  const controller = useController();
  const project = useApp((s) => s.state?.project);
  const patchUi = useApp((s) => s.patchUi);
  const [path, setPath] = useState(() =>
    suggestPath(
      project?.name ?? "export",
      Object.values(project?.assets ?? {}).map((a) => a.path),
    ),
  );
  const [overwrite, setOverwrite] = useState(false);
  const close = () => patchUi({ exportOpen: false });

  const valid = path.trim().toLowerCase().endsWith(".mp4");

  const start = () => {
    if (!valid) return;
    close();
    // The export runs on the server; progress is shown on the Export button via job events.
    void controller.exportTo(path.trim(), overwrite);
  };

  const browse = async () => {
    const picked = await pickSavePath(basename(path) || "export.mp4");
    if (picked) setPath(picked);
  };

  return (
    <Modal
      title="Export video"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={start} disabled={!valid}>
            Export
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="field">
          <span className="field__label">Save as</span>
          <span className="field__row">
            <input
              data-autofocus
              className="input input--mono"
              value={path}
              spellCheck={false}
              placeholder="/home/me/Videos/my-edit.mp4"
              onChange={(e) => setPath(e.target.value)}
              aria-describedby="export-hint"
            />
            {isTauri() ? (
              <button type="button" className="btn" onClick={() => void browse()}>
                Browse...
              </button>
            ) : null}
          </span>
        </label>
        <p id="export-hint" className={valid || !path ? "muted" : "note note--warn"}>
          Full path ending in .mp4. The file is rendered with the project's size and frame rate.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Replace the file if it already exists
        </label>
      </form>
    </Modal>
  );
}
