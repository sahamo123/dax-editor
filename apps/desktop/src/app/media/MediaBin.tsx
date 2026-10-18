// The media bin: every imported file as a card with a thumbnail, length and size, plus Import and
// "Add to timeline". Thumbnails come from the server's media pipeline and may take a moment after import.

import { mediaUrl } from "@dax/protocol";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp, useController } from "../context";
import { basename, formatDuration } from "../format";
import { backgroundJobs } from "../selectors";
import { Icon } from "../ui/icons";
import { ProgressBar } from "../ui/ProgressBar";
import { useImport } from "../use-import";

/** Thumbnails are made in the background, so a 404 right after import is normal: retry a few times. */
const THUMB_RETRIES = 6;

function Thumb({ assetId }: { assetId: string }): ReactElement {
  const server = useApp((s) => s.server);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!server || attempt >= THUMB_RETRIES) {
    return (
      <div className="thumb thumb--empty">
        <Icon name="film" size={22} />
      </div>
    );
  }
  return (
    <img
      className="thumb"
      alt=""
      loading="lazy"
      src={mediaUrl(server.url, server.token, assetId, "thumb.jpg", { r: attempt })}
      onError={() => {
        // Wait before asking again; the server may still be making it.
        timer.current = setTimeout(() => setAttempt((a) => a + 1), 1500);
      }}
    />
  );
}

/** The Media tab of the side drawer. */
export function MediaBin(): ReactElement {
  const controller = useController();
  const project = useApp((s) => s.state?.project);
  const jobs = useApp((s) => s.jobs);
  const online = useApp((s) => s.connection.status === "online");
  const startImport = useImport();

  const assets = Object.values(project?.assets ?? {});
  const used = new Set(
    (project?.timeline.tracks ?? []).flatMap((t) => t.clips.map((c) => c.assetId)),
  );
  const busy = backgroundJobs(jobs);

  return (
    <div className="media">
      <div className="media__bar">
        <button
          type="button"
          className="btn btn--small"
          disabled={!online}
          onClick={() => void startImport()}
        >
          <Icon name="plus" size={14} /> Import
        </button>
        <span className="muted">
          {assets.length === 0
            ? "No media yet"
            : `${assets.length} file${assets.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {busy.length > 0 ? (
        <div className="media__jobs">
          {busy.map((j) => (
            <div key={j.id} className="media__job">
              <span className="media__job-label">{j.label}</span>
              <ProgressBar value={j.progress} label={j.label} />
            </div>
          ))}
        </div>
      ) : null}

      {assets.length === 0 ? (
        <p className="empty-note">
          Videos you import appear here. Drag a file onto the window, or use Import.
        </p>
      ) : (
        <ul className="media__grid">
          {assets.map((a) => (
            <li key={a.id} className="media-card">
              <Thumb assetId={a.id} />
              <div className="media-card__body">
                <div className="media-card__name" title={a.path}>
                  {basename(a.path)}
                </div>
                <div className="media-card__meta">
                  {formatDuration(a.duration)}
                  {a.width && a.height ? ` · ${a.width}×${a.height}` : ""}
                  {a.hasAudio ? "" : " · no audio"}
                </div>
                <div className="media-card__row">
                  {used.has(a.id) ? (
                    <span className="badge">On timeline</span>
                  ) : (
                    <span className="badge badge--dim">Not used</span>
                  )}
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={!online}
                    aria-label={`Add ${basename(a.path)} to the timeline`}
                    onClick={() => void controller.run("add_clip", { assetId: a.id })}
                  >
                    Add
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
