// The "Local model" part of Settings: what model is recommended, its size, and Download / Start / Stop / Remove
// with live progress from the server's `model-download` and `model-start` jobs.

import type { JobInfo } from "@dax/protocol";
import { type ReactElement, useEffect, useMemo } from "react";
import { useApp, useController } from "../context";
import { formatBytes } from "../format";
import { ProgressBar } from "../ui/ProgressBar";

function useModelJob(): JobInfo | undefined {
  const jobs = useApp((s) => s.jobs);
  return useMemo(() => {
    const all = Object.values(jobs).filter(
      (j) => j.kind === "model-download" || j.kind === "model-start",
    );
    return all.find((j) => j.status === "running") ?? all[all.length - 1];
  }, [jobs]);
}

/** Download, start and stop the embedded model. */
export function LocalModelCard(): ReactElement {
  const controller = useController();
  const model = useApp((s) => s.localModel);
  const online = useApp((s) => s.connection.status === "online");
  const job = useModelJob();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the card opens
  useEffect(() => {
    void controller.loadLocalModel();
  }, []);

  // When a download or start finishes, ask the server what changed.
  const jobStatus = job?.status;
  const jobId = job?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh on every job id/status change
  useEffect(() => {
    if (jobStatus === "done" || jobStatus === "error") void controller.loadLocalModel();
  }, [jobStatus, jobId]);

  if (model === null) return <p className="muted">Checking the local model...</p>;
  if (model === "unavailable") {
    return (
      <p className="note note--info">
        The local model isn't available from this engine yet. You can still use an API key or a
        signed-in command-line tool.
      </p>
    );
  }

  const working = job?.status === "running";
  const rec = model.recommended;
  const verb = job?.kind === "model-start" ? "Starting" : "Downloading";

  return (
    <div className="stack">
      <div className="model-card">
        <div className="model-card__head">
          <div>
            <div className="model-card__name">{rec?.label ?? "Local model"}</div>
            {rec?.description ? <div className="muted">{rec.description}</div> : null}
          </div>
          <span
            className={`status-pill ${model.running ? "is-ready" : "is-idle"}`}
            data-testid="local-model-status"
          >
            <span className="status-pill__dot" aria-hidden="true" />
            {model.running ? "Running" : model.installed ? "Stopped" : "Not downloaded"}
          </span>
        </div>
        {model.detail ? <p className="muted">{model.detail}</p> : null}

        {working && job ? (
          <div className="model-card__progress">
            <div className="model-card__progress-row">
              <span>
                {verb}
                {job.label ? ` ${job.label}` : ""}
              </span>
              <span>{Math.round(job.progress * 100)}%</span>
            </div>
            <ProgressBar value={job.progress} label={`${verb} the local model`} />
          </div>
        ) : null}
        {job?.status === "error" ? (
          <p className="note note--error">{job.error ?? "That did not work."}</p>
        ) : null}

        <div className="model-card__actions">
          {!model.installed ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!online || working}
              onClick={() => void controller.localModel({ action: "install", modelId: rec?.id })}
            >
              {working
                ? "Downloading..."
                : `Download${rec ? ` (${formatBytes(rec.sizeBytes)})` : ""}`}
            </button>
          ) : model.running ? (
            <button
              type="button"
              className="btn"
              disabled={!online || working}
              onClick={() => void controller.localModel({ action: "stop" })}
            >
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!online || working}
                onClick={() => void controller.localModel({ action: "start" })}
              >
                Start
              </button>
              <button
                type="button"
                className="btn"
                disabled={!online || working}
                onClick={() => void controller.localModel({ action: "uninstall" })}
              >
                Remove download
              </button>
            </>
          )}
        </div>
      </div>
      <p className="muted">
        The model runs only on this computer. Nothing you edit is sent anywhere. Small models are
        best at simple edits like cutting pauses and adding titles.
      </p>
    </div>
  );
}
