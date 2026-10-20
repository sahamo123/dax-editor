// First-run screen in the main area: a big drop zone that says what to do ("Drop a video here or click Import")
// and that the editor needs no AI to get started.

import type { ReactElement } from "react";
import { useApp } from "../context";
import { Icon } from "../ui/icons";
import { useImport } from "../use-import";

/** The empty project screen. */
export function EmptyState(): ReactElement {
  const startImport = useImport();
  const online = useApp((s) => s.connection.status === "online");
  const hover = useApp((s) => s.ui.dropHover);
  return (
    <section className={`empty${hover ? " is-hover" : ""}`} aria-labelledby="empty-title">
      <div className="empty__card">
        <div className="empty__icon" aria-hidden="true">
          <Icon name="film" size={30} />
        </div>
        <h2 id="empty-title" className="empty__title">
          Drop a video here or click Import
        </h2>
        <p className="empty__text">
          MP4, MOV, MKV and WebM work. Your files stay on this computer.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={!online}
          onClick={() => void startImport()}
        >
          <Icon name="import" /> Import video
        </button>
        <p className="empty__hint">
          Then cut, trim and add titles by hand on the timeline, or ask the assistant on the left.
          You don't need AI to edit.
        </p>
      </div>
    </section>
  );
}
