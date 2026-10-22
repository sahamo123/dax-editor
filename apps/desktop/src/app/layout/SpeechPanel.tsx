// Offline setup, source-timed transcript correction and reviewed cleanup cuts.
import type { SpeechStatus } from "@dax/protocol";
import { type ReactElement, useEffect, useState } from "react";
import { useApp, useController } from "../context";
import { basename, formatBytes } from "../format";

interface Decision {
  id: string;
  kind: string;
  reason: string;
  start: number;
  end: number;
  status: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Install speech, correct words and apply selected cleanup decisions through the command registry. */
export function SpeechPanel(): ReactElement {
  const controller = useController();
  const project = useApp((s) => s.state?.project);
  const revision = useApp((s) => s.state?.revision);
  const projectId = useApp((s) => s.state?.projectId);
  const jobs = useApp((s) => s.jobs);
  const [status, setStatus] = useState<SpeechStatus | null | undefined>();
  const [assetId, setAssetId] = useState("");
  const [page, setPage] = useState(0);
  const [plan, setPlan] = useState<{ id: string; decisions: Decision[]; revision?: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const jobState = Object.values(jobs)
    .filter((job) => job.kind === "speech-setup" || job.kind === "transcribe")
    .map((job) => `${job.id}:${job.status}`)
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh installation status when a speech job changes.
  useEffect(() => {
    void controller.speechStatus().then(setStatus);
  }, [controller, jobState]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: project switches invalidate local transcript/plan selection.
  useEffect(() => {
    setPlan(null);
    setSelected([]);
    setAssetId("");
    setPage(0);
  }, [projectId]);
  const assets = Object.values(project?.assets ?? {}).filter((asset) => asset.hasAudio);
  const asset = assets.find((value) => value.id === assetId) ?? assets[0];
  const active = Object.values(jobs).find(
    (job) => (job.kind === "transcribe" || job.kind === "speech-setup") && job.status === "running",
  );
  const review = async () => {
    if (!asset) return;
    setWorking(true);
    try {
      const result = await controller.run("plan_cuts", { assetId: asset.id, preset: "standard" });
      if (
        !result.ok ||
        !record(result.data) ||
        typeof result.data.planId !== "string" ||
        !Array.isArray(result.data.decisions)
      )
        return;
      const decisions = result.data.decisions.flatMap((value: unknown): Decision[] =>
        record(value) &&
        typeof value.id === "string" &&
        typeof value.kind === "string" &&
        typeof value.reason === "string" &&
        typeof value.start === "number" &&
        typeof value.end === "number" &&
        typeof value.status === "string"
          ? [
              {
                id: value.id,
                kind: value.kind,
                reason: value.reason,
                start: value.start,
                end: value.end,
                status: value.status,
              },
            ]
          : [],
      );
      setPlan({ id: result.data.planId, decisions, revision });
      setSelected(
        decisions
          .filter((decision) => decision.status === "approved" && decision.kind !== "breath")
          .map((decision) => decision.id),
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="project-tools stack">
      <h3>Offline speech</h3>
      <p className="muted" role="status">
        {status === undefined
          ? "Checking speech setup…"
          : (status?.detail ?? "Speech setup is unavailable in this build.")}
      </p>
      {status ? (
        <>
          <small className="muted">
            {status.modelId} · {formatBytes(status.sizeBytes)} · recognition stays on this computer
          </small>
          <div className="row">
            <button
              className="btn"
              type="button"
              disabled={Boolean(active)}
              onClick={() => void controller.speech("install")}
            >
              {status.ready ? "Verify speech setup" : "Install offline speech"}
            </button>
            {status.modelInstalled ? (
              <button
                className="btn"
                type="button"
                disabled={Boolean(active)}
                onClick={() =>
                  void controller
                    .speech("remove")
                    .then(() => controller.speechStatus())
                    .then(setStatus)
                }
              >
                Remove speech model
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {active ? (
        <>
          <p role="status">
            {active.label} · {Math.round(active.progress * 100)}%
          </p>
          <progress max={1} value={active.progress} aria-label="Speech progress" />
          <button
            className="btn"
            type="button"
            onClick={() => void controller.cancelTask(active.id)}
          >
            Cancel speech job
          </button>
        </>
      ) : null}
      <label className="field">
        <span className="field__label">Speech source</span>
        <select
          className="input"
          value={asset?.id ?? ""}
          onChange={(event) => {
            setAssetId(event.target.value);
            setPage(0);
            setPlan(null);
          }}
        >
          {assets.length ? (
            assets.map((value) => (
              <option key={value.id} value={value.id}>
                {basename(value.path)}
              </option>
            ))
          ) : (
            <option value="">Import media with audio first</option>
          )}
        </select>
      </label>
      <button
        className="btn"
        type="button"
        disabled={!status?.ready || !asset || Boolean(active)}
        onClick={() => {
          if (asset) void controller.speech("transcribe", asset.id);
        }}
      >
        Generate transcript
      </button>
      {asset?.transcript ? (
        <>
          <h4>Transcript · {asset.transcript.words.length} words</h4>
          <small className="muted">Correct words below. Source timing is preserved.</small>
          <ol className="speech-words">
            {asset.transcript.words.slice(page * 40, page * 40 + 40).map((word, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: absolute source-word index is the correction command identity; words are never reordered here.
              <li key={`${asset.id}-${page * 40 + index}-${word.text}`}>
                <span>{word.start.toFixed(2)}s</span>
                <input
                  className="input"
                  aria-label={`Word ${page * 40 + index + 1}`}
                  defaultValue={word.text}
                  maxLength={120}
                  onBlur={(event) => {
                    const text = event.target.value.trim();
                    if (text && text !== word.text)
                      void controller.run("correct_transcript_word", {
                        assetId: asset.id,
                        wordIndex: page * 40 + index,
                        text,
                      });
                  }}
                />
              </li>
            ))}
          </ol>
          <div className="row">
            <button
              className="btn"
              disabled={page === 0}
              type="button"
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              Previous words
            </button>
            <button
              className="btn"
              disabled={(page + 1) * 40 >= asset.transcript.words.length}
              type="button"
              onClick={() => setPage(page + 1)}
            >
              Next words
            </button>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => void controller.run("set_captions", { enabled: true, style: "classic" })}
          >
            Enable captions
          </button>
        </>
      ) : null}
      <button
        className="btn"
        type="button"
        disabled={!asset || working || Boolean(active)}
        onClick={() => void review()}
      >
        {working ? "Analysing…" : "Review cleanup cuts"}
      </button>
      {plan ? (
        <>
          <small className="muted">
            {plan.decisions.length} decisions shown. Breaths are preserved. Reanalyse after timeline
            changes.
          </small>
          {plan.decisions
            .filter((decision) => decision.kind !== "breath")
            .map((decision) => (
              <label className="check" key={decision.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(decision.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, decision.id]
                        : selected.filter((id) => id !== decision.id),
                    )
                  }
                />
                <span>
                  {decision.start.toFixed(2)}–{decision.end.toFixed(2)}s · {decision.kind} ·{" "}
                  {decision.reason}
                </span>
              </label>
            ))}
          <button
            className="btn btn--primary"
            type="button"
            disabled={!selected.length || revision !== plan.revision}
            onClick={() =>
              void controller
                .run("apply_cut_plan", { planId: plan.id, only: selected, includeProposed: true })
                .then(() => setPlan(null))
            }
          >
            Apply selected cuts
          </button>
        </>
      ) : null}
    </div>
  );
}
