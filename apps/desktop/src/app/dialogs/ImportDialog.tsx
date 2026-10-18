// Import by typing a path. This is what the browser build shows instead of a native file dialog (browsers never
// reveal real file paths); the desktop app uses the native dialog and only falls back here if it fails.

import { type ReactElement, useState } from "react";
import { useApp, useController } from "../context";
import { Modal } from "../ui/Modal";

/** The typed-path import dialog. Opens when `ui.importOpen` is set. */
export function ImportDialog(): ReactElement {
  const controller = useController();
  const note = useApp((s) => s.ui.importNote);
  const patchUi = useApp((s) => s.patchUi);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => patchUi({ importOpen: false, importNote: null });
  const paths = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const submit = async () => {
    if (paths.length === 0 || busy) return;
    setBusy(true);
    const ok = await controller.importPaths(paths);
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal
      title="Import video"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={paths.length === 0 || busy}
          >
            {busy ? "Importing..." : paths.length > 1 ? `Import ${paths.length} files` : "Import"}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {note ? <p className="note note--warn">{note}</p> : null}
        <p className="muted">
          This browser can't open a file dialog or read where a dropped file lives. Paste the full
          path of each video, one per line. The desktop app has a normal file picker and
          drag-and-drop.
        </p>
        <label className="field">
          <span className="field__label">File path(s)</span>
          <textarea
            data-autofocus
            className="input input--mono"
            rows={4}
            value={text}
            placeholder="/home/me/Videos/interview.mp4"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
        </label>
      </form>
    </Modal>
  );
}
