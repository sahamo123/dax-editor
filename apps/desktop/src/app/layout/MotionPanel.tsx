// Controlled Blender templates render through engine jobs and keep editable generation recipes.
import type { BlenderRenderRequest, BlenderStatus } from "@dax/protocol";
import { type ReactElement, useEffect, useState } from "react";
import { useApp, useController } from "../context";
import { basename } from "../format";

const initial: BlenderRenderRequest = {
  template: "title-card",
  text: "Your story starts here",
  color: "#6b97ff",
  duration: 3,
  width: 640,
  height: 360,
  fps: 24,
};

/** Manual motion rendering and regeneration using bounded application-owned Blender templates. */
export function MotionPanel(): ReactElement {
  const controller = useController();
  const project = useApp((s) => s.state?.project);
  const projectId = useApp((s) => s.state?.projectId);
  const jobs = useApp((s) => s.jobs);
  const [status, setStatus] = useState<BlenderStatus | null>(null);
  const [request, setRequest] = useState<BlenderRenderRequest>(initial);
  const [logoName, setLogoName] = useState("");
  useEffect(() => {
    void controller.blenderStatus().then(setStatus);
  }, [controller]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a project switch invalidates the selected generation target/logo.
  useEffect(() => {
    setRequest(initial);
    setLogoName("");
  }, [projectId]);
  const active = Object.values(jobs).find(
    (job) => job.kind === "blender" && job.status === "running",
  );
  const generated = Object.values(project?.assets ?? {}).filter(
    (asset) => asset.generation?.kind === "blender",
  );
  const patch = (value: Partial<BlenderRenderRequest>) => setRequest({ ...request, ...value });
  return (
    <div className="project-tools stack">
      <h3>Motion templates</h3>
      <p className="muted" role="status">
        {status?.detail ?? "Checking Blender…"}
      </p>
      {!status?.available ? (
        <>
          <a href="https://www.blender.org/download/lts/" target="_blank" rel="noreferrer">
            Get Blender from its official site
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => void controller.blenderStatus().then(setStatus)}
          >
            Check Blender again
          </button>
        </>
      ) : null}
      <small className="muted">
        Blender starts for each render and closes afterward. The default 640 × 360 preview uses two
        CPU threads.
      </small>
      {generated.length ? (
        <label className="field">
          <span className="field__label">Regenerate an asset</span>
          <select
            className="input"
            value={request.replaceAssetId ?? ""}
            onChange={(event) => {
              const asset = generated.find((value) => value.id === event.target.value);
              if (!asset?.generation) {
                setRequest(initial);
                return;
              }
              const params = asset.generation.parameters;
              if (
                params.template === "title-card" ||
                params.template === "logo-intro" ||
                params.template === "text-3d"
              )
                setRequest({
                  template: params.template,
                  text: typeof params.text === "string" ? params.text : "Title",
                  color: typeof params.color === "string" ? params.color : initial.color,
                  duration: asset.duration,
                  width: asset.width ?? initial.width,
                  height: asset.height ?? initial.height,
                  fps: asset.fps ?? initial.fps,
                  ...(typeof params.logoPath === "string" ? { logoPath: params.logoPath } : {}),
                  replaceAssetId: asset.id,
                });
            }}
          >
            <option value="">Create a new animation</option>
            {generated.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {basename(asset.path)} · {asset.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.renderMotion(request);
        }}
      >
        <label className="field">
          <span className="field__label">Motion template</span>
          <select
            className="input"
            value={request.template}
            onChange={(event) =>
              patch({ template: event.target.value as BlenderRenderRequest["template"] })
            }
          >
            <option value="title-card">Title card</option>
            <option value="logo-intro">Logo intro</option>
            <option value="text-3d">3D text</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Animation text</span>
          <textarea
            className="input"
            maxLength={160}
            value={request.text}
            required
            onChange={(event) => patch({ text: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Text color</span>
          <input
            type="color"
            value={request.color}
            onChange={(event) => patch({ color: event.target.value })}
          />
        </label>
        {(["duration", "width", "height", "fps"] as const).map((field) => (
          <label className="field" key={field}>
            <span className="field__label">
              {field === "duration"
                ? "Duration (seconds)"
                : field === "fps"
                  ? "Frames per second"
                  : `${field} (pixels)`}
            </span>
            <input
              className="input"
              type="number"
              required
              value={request[field]}
              min={field === "duration" ? 0.5 : field === "fps" ? 12 : 128}
              max={
                field === "duration" ? 10 : field === "fps" ? 30 : field === "height" ? 1080 : 1920
              }
              step={field === "duration" ? 0.5 : field === "fps" ? 1 : 2}
              onChange={(event) => patch({ [field]: Number(event.target.value) })}
            />
          </label>
        ))}
        {request.template === "logo-intro" ? (
          <label className="field">
            <span className="field__label">PNG or JPG logo</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const path = await controller.stageLogo(file);
                if (path) {
                  patch({ logoPath: path });
                  setLogoName(file.name);
                }
              }}
            />
            <small className="muted">
              {logoName || (request.logoPath ? "Saved logo selected" : "Choose a local image")}
            </small>
          </label>
        ) : null}
        <button
          className="btn btn--primary"
          disabled={
            !status?.available ||
            Boolean(active) ||
            !request.text.trim() ||
            (request.template === "logo-intro" && !request.logoPath)
          }
          type="submit"
        >
          {request.replaceAssetId ? "Regenerate animation" : "Render and add to timeline"}
        </button>
      </form>
      {active ? (
        <>
          <p role="status">
            {active.label} · {Math.round(active.progress * 100)}%
          </p>
          <progress max={1} value={active.progress} aria-label="Blender progress" />
          <button
            type="button"
            className="btn"
            onClick={() => void controller.cancelTask(active.id)}
          >
            Cancel Blender render
          </button>
        </>
      ) : null}
    </div>
  );
}
