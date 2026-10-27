// Complete-edit review uses the same tracked renderer as export; interactive playback remains independent.
import { renderedPreviewUrl } from "@dax/protocol";
import { useEffect, useRef, useState } from "react";
import { useEditorApi, useEditorStore } from "../context";

interface Review {
  previewId: string;
  jobId: string;
  projectId: string;
  revision: number;
}

/** Render and play a revision-bound complete edit without changing the project or choosing an export path. */
export function RenderedReview() {
  const api = useEditorApi(),
    store = useEditorStore();
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState("");
  const [missingStatus, setMissingStatus] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const job = api.state.jobs.find((item) => item.id === review?.jobId);
  const stale =
    review !== null &&
    (review.projectId !== api.state.projectId || review.revision !== api.state.revision);
  const running = !stale && job?.status === "running";
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);
  useEffect(() => {
    setMissingStatus(false);
    if (!review || job || stale) return;
    const timer = setTimeout(() => setMissingStatus(true), 15_000);
    return () => clearTimeout(timer);
  }, [review, job, stale]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const render = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    setReview(null);
    try {
      const response = await api.run("render_preview", {});
      if (!response.ok) throw new Error(response.error);
      const data = response.data;
      if (
        !data ||
        typeof data !== "object" ||
        !("previewId" in data) ||
        !("jobId" in data) ||
        !("projectId" in data) ||
        !("revision" in data) ||
        typeof data.previewId !== "string" ||
        typeof data.jobId !== "string" ||
        typeof data.projectId !== "string" ||
        typeof data.revision !== "number"
      )
        throw new Error("The engine did not return a preview task. Reconnect and try again.");
      setReview({
        previewId: data.previewId,
        jobId: data.jobId,
        projectId: data.projectId,
        revision: data.revision,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  const stop = async () => {
    if (!review) return;
    try {
      const result = await api.run("cancel_task", { taskId: review.jobId });
      if (!result.ok) setError(result.error);
    } catch (failure) {
      setError(String(failure));
    }
  };
  return (
    <>
      <button
        className="dx-review-trigger"
        type="button"
        ref={trigger}
        disabled={api.state.project.timeline.tracks.every(
          (track) => track.kind !== "video" || track.clips.length === 0,
        )}
        onClick={() => {
          store.setPlaying(false);
          setOpen(true);
          if (!review && !pending) void render();
        }}
      >
        Review effects
      </button>
      {open ? (
        <div className="dx-review-backdrop">
          <section
            className="dx-review-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Rendered effects preview"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
              if (event.key !== "Tab") return;
              const elements = event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]),video[controls]",
              );
              const first = elements[0],
                last = elements[elements.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <header>
              <h2>Rendered effects preview</h2>
              <button type="button" ref={closeButton} onClick={close}>
                Back to editing
              </button>
            </header>
            <p>
              This review includes zooms, images, music, ducking and captions using the export
              renderer. Rendering may take as long as export. Closing this window keeps the task
              running.
            </p>
            {pending ? <p role="status">Starting preview render…</p> : null}
            {error ? <p role="alert">{error}</p> : null}
            {stale ? (
              <p role="status">
                This preview is out of date. Render the current edit to review your changes.
              </p>
            ) : null}
            {!stale && job?.status === "error" ? (
              <p role="alert">{job.error ?? "Preview render failed. Try again."}</p>
            ) : null}
            {!stale && review && !job ? (
              <p role="status">
                {missingStatus
                  ? "Render status is unavailable. Check the connection, then stop or retry."
                  : "Waiting for render status…"}
              </p>
            ) : null}
            {running ? (
              <>
                <p role="status">Rendering preview · {Math.round(job.progress * 100)}%</p>
                <progress aria-label="Preview render progress" max={1} value={job.progress} />
              </>
            ) : null}
            {!stale && review && job?.status === "done" ? (
              <>
                {/* biome-ignore lint/a11y/useMediaCaption: captions from the user's project are burned into this review. */}
                <video
                  controls
                  playsInline
                  preload="metadata"
                  tabIndex={0}
                  aria-label="Complete edit review"
                  src={renderedPreviewUrl(api.serverUrl, api.token, review.previewId)}
                  onError={() =>
                    setError("The review video could not play. Reconnect or render a new preview.")
                  }
                />
              </>
            ) : null}
            <footer>
              <button type="button" disabled={pending || running} onClick={() => void render()}>
                Render current edit
              </button>
              {review && !stale && (running || !job) ? (
                <button type="button" onClick={() => void stop()}>
                  Stop preview render
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
