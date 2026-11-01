// First-run screen in the main area: a big drop zone that says what to do ("Drop a video here or click Import")
// and that the editor needs no AI to get started.

import { type ReactElement, useEffect, useRef } from "react";
import { useApp } from "../context";
import { Icon } from "../ui/icons";
import { useImport } from "../use-import";

/** The empty project screen. */
export function EmptyState(): ReactElement {
  const startImport = useImport();
  const online = useApp((s) => s.connection.status === "online");
  const hover = useApp((s) => s.ui.dropHover);
  const patchUi = useApp((s) => s.patchUi);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !container.current?.contains(document.activeElement)) return;
      event.preventDefault();
      patchUi({ setupVisible: false });
      document.getElementById("project-setup-trigger")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [patchUi]);
  return (
    <section
      ref={container}
      className={`empty${hover ? " is-hover" : ""}`}
      aria-labelledby="empty-title"
    >
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
        <button
          type="button"
          className="btn"
          onClick={() => {
            patchUi({ drawerOpen: true, drawerTab: "tools" });
            requestAnimationFrame(() => document.getElementById("tab-tools")?.focus());
          }}
        >
          Project options
        </button>
        <button
          id="setup-skip"
          type="button"
          className="btn"
          onClick={() => {
            patchUi({ setupVisible: false });
            document.getElementById("project-setup-trigger")?.focus();
          }}
        >
          Start editing
        </button>
        <p className="empty__hint">
          Then cut, trim and add titles by hand on the timeline, or ask the assistant on the left.
          You don't need AI to edit.
        </p>
      </div>
    </section>
  );
}
