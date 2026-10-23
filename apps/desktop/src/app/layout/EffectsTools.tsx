// Manual effects use the same bounded registry operations, tasks and undo as the assistant.
import { type ReactElement, useRef, useState } from "react";
import { useEditor } from "../../editor";
import { useApp, useController } from "../context";
import { basename } from "../format";
import { EffectNumber, EffectSelect } from "./EffectFields";

const EASES = ["linear", "ease-in", "ease-out", "ease-in-out"];
const POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top",
  "bottom",
  "center",
];
const MOTIONS = ["none", "fade", "slide-up", "slide-left", "pop"];

/** Add/edit/remove zooms, music/SFX, image overlays and ducking without an AI provider. Times use timeline seconds except the explicitly labelled audio source offset. */
export function EffectsTools(): ReactElement | null {
  const controller = useController();
  const project = useApp((state) => state.state?.project);
  const online = useApp((state) => state.connection.status === "online");
  const identity = useApp((state) => state.state?.projectId ?? state.state?.project);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const { playhead } = useEditor();
  const [duration, setDuration] = useState(3);
  const [scale, setScale] = useState(1.15);
  const [style, setStyle] = useState("punch-in");
  const [role, setRole] = useState("music");
  const [preset, setPreset] = useState("logo-corner");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  if (!project) return null;
  const total = Math.max(
    0,
    ...project.timeline.tracks
      .filter((track) => track.kind === "video")
      .flatMap((track) => track.clips.map((clip) => clip.start + clip.out - clip.in)),
  );
  const run = (command: string, args: Record<string, unknown>) => {
    void controller.run(command, args);
  };
  const upload = async (file: File | undefined, image: boolean) => {
    if (!file) return;
    const requestedProject = identity;
    setProcessing(true);
    setError("");
    try {
      const path = image ? await controller.stageLogo(file) : await controller.stageAudio(file);
      if (currentIdentity.current !== requestedProject) {
        setError(
          "The project changed while copying media. Select the file again in the intended project.",
        );
        return;
      }
      if (path)
        await controller.run(
          image ? "add_image_overlay" : "add_audio",
          image
            ? { path, preset, start: playhead, duration: Math.max(0.2, total - playhead) }
            : { path, role, start: playhead },
        );
    } finally {
      setProcessing(false);
    }
  };
  const ducking = project.timeline.ducking;
  return (
    <section className="stack" aria-label="Manual effects">
      <h3>Effects and sound</h3>
      <p className="muted">
        All times are timeline seconds. Export a short sample to review exact zoom, image and music
        rendering; the preview may not show every effect.
      </p>
      <fieldset disabled={!online || total <= 0 || processing} className="stack">
        <legend>Manual effects controls</legend>
        {processing ? <p role="status">Copying media and applying effect…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <details>
          <summary>Zooms</summary>
          <div className="stack">
            <EffectNumber
              label="New zoom duration (seconds)"
              value={duration}
              min={0.2}
              onCommit={setDuration}
            />
            <EffectNumber
              label="New zoom scale"
              value={scale}
              min={1.02}
              max={3}
              step={0.01}
              onCommit={setScale}
            />
            <EffectSelect
              label="New zoom style"
              value={style}
              options={["punch-in", "push-in"]}
              onCommit={setStyle}
            />
            <button
              className="btn"
              type="button"
              disabled={playhead >= total}
              onClick={() =>
                run("add_zoom", {
                  start: playhead,
                  end: Math.min(total, playhead + duration),
                  scale,
                  style,
                })
              }
            >
              Add zoom at playhead
            </button>
            {(project.timeline.zooms ?? []).map((zoom, index) => (
              <details key={zoom.id}>
                <summary>
                  Zoom {index + 1} · {zoom.start.toFixed(2)}s
                </summary>
                <div className="stack">
                  <EffectNumber
                    label={`Zoom ${index + 1} start (seconds)`}
                    value={zoom.start}
                    max={Math.max(0, total - zoom.duration)}
                    onCommit={(start) => run("update_zoom", { zoomId: zoom.id, start })}
                  />
                  <EffectNumber
                    label={`Zoom ${index + 1} end (seconds)`}
                    value={zoom.start + zoom.duration}
                    min={zoom.start + 0.01}
                    max={total}
                    onCommit={(end) => run("update_zoom", { zoomId: zoom.id, end })}
                  />
                  <EffectNumber
                    label={`Zoom ${index + 1} start scale`}
                    value={zoom.fromScale}
                    min={1}
                    max={3}
                    step={0.01}
                    onCommit={(startScale) => run("update_zoom", { zoomId: zoom.id, startScale })}
                  />
                  <EffectNumber
                    label={`Zoom ${index + 1} final scale`}
                    value={zoom.toScale}
                    min={1.02}
                    max={3}
                    step={0.01}
                    onCommit={(scale) => run("update_zoom", { zoomId: zoom.id, scale })}
                  />
                  <EffectSelect
                    label={`Zoom ${index + 1} easing`}
                    value={zoom.ease}
                    options={EASES}
                    onCommit={(ease) => run("update_zoom", { zoomId: zoom.id, ease })}
                  />
                  {(["x", "y"] as const).map((axis) => (
                    <EffectNumber
                      key={axis}
                      label={`Zoom ${index + 1} focus ${axis} (0–1)`}
                      value={zoom[axis]}
                      max={1}
                      step={0.01}
                      onCommit={(value) => run("update_zoom", { zoomId: zoom.id, [axis]: value })}
                    />
                  ))}
                  <button
                    className="btn"
                    type="button"
                    onClick={() => run("remove_zoom", { zoomId: zoom.id })}
                  >
                    Remove zoom {index + 1}
                  </button>
                </div>
              </details>
            ))}
          </div>
        </details>
        <details>
          <summary>Music and sound effects</summary>
          <div className="stack">
            <EffectSelect
              label="New audio role"
              value={role}
              options={["music", "sfx"]}
              onCommit={setRole}
            />
            <label className="field">
              Add audio at playhead
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,.opus"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void upload(file, false);
                }}
              />
            </label>
            {project.timeline.tracks
              .filter((track) => track.kind === "audio")
              .flatMap((track) => track.clips)
              .map((clip, index) => (
                <details key={clip.id}>
                  <summary>
                    Audio {index + 1} ·{" "}
                    {basename(project.assets[clip.assetId]?.path ?? clip.assetId)}
                  </summary>
                  <div className="stack">
                    <EffectSelect
                      label={`Audio ${index + 1} role`}
                      value={clip.role ?? "music"}
                      options={["music", "sfx"]}
                      onCommit={(role) => run("update_audio", { audioId: clip.id, role })}
                    />
                    {(["start", "volume", "fadeIn", "fadeOut"] as const).map((field) => (
                      <EffectNumber
                        key={field}
                        label={`Audio ${index + 1} ${field}${field === "volume" ? " (0–2)" : " (seconds)"}`}
                        value={clip[field]}
                        max={field === "volume" ? 2 : field.startsWith("fade") ? 60 : 3600}
                        onCommit={(value) =>
                          run("update_audio", { audioId: clip.id, [field]: value })
                        }
                      />
                    ))}
                    <EffectNumber
                      label={`Audio ${index + 1} length (seconds)`}
                      value={clip.length ?? clip.out - clip.in}
                      min={0.01}
                      onCommit={(length) => run("update_audio", { audioId: clip.id, length })}
                    />
                    <EffectNumber
                      label={`Audio ${index + 1} source offset (seconds)`}
                      value={clip.in}
                      max={Math.max(0, (project.assets[clip.assetId]?.duration ?? clip.out) - 0.01)}
                      onCommit={(sourceStart) =>
                        run("update_audio", { audioId: clip.id, sourceStart })
                      }
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={clip.loop ?? false}
                        onChange={(event) =>
                          run("update_audio", { audioId: clip.id, loop: event.target.checked })
                        }
                      />
                      Loop audio {index + 1}
                    </label>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => run("remove_audio", { audioId: clip.id })}
                    >
                      Remove audio {index + 1}
                    </button>
                  </div>
                </details>
              ))}
            <label>
              <input
                type="checkbox"
                checked={ducking?.enabled ?? true}
                onChange={(event) => run("set_ducking", { enabled: event.target.checked })}
              />
              Lower music under speech
            </label>
            <EffectNumber
              label="Music ducking amount (dB)"
              value={ducking?.amountDb ?? 12}
              min={3}
              max={30}
              onCommit={(amountDb) => run("set_ducking", { amountDb })}
            />
            <EffectNumber
              label="Music ducking recovery (seconds)"
              value={ducking?.releaseSeconds ?? 0.4}
              min={0.05}
              max={3}
              step={0.05}
              onCommit={(releaseSeconds) => run("set_ducking", { releaseSeconds })}
            />
          </div>
        </details>
        <details>
          <summary>Logos and images</summary>
          <div className="stack">
            <EffectSelect
              label="New image preset"
              value={preset}
              options={["logo-corner", "watermark", "sticker-pop", "logo-end-card", "bug-slide"]}
              onCommit={setPreset}
            />
            <label className="field">
              Add image at playhead
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void upload(file, true);
                }}
              />
            </label>
            {(project.timeline.images ?? []).map((image, index) => (
              <details key={image.id}>
                <summary>
                  Image {index + 1} ·{" "}
                  {basename(project.assets[image.assetId]?.path ?? image.assetId)}
                </summary>
                <div className="stack">
                  {(["start", "duration", "width", "opacity"] as const).map((field) => (
                    <EffectNumber
                      key={field}
                      label={`Image ${index + 1} ${field}${field === "width" || field === "opacity" ? " (0–1)" : " (seconds)"}`}
                      value={image[field]}
                      min={field === "duration" ? 0.2 : field === "width" ? 0.02 : 0}
                      max={field === "width" || field === "opacity" ? 1 : 3600}
                      step={0.01}
                      onCommit={(value) =>
                        run("update_image_overlay", { imageId: image.id, [field]: value })
                      }
                    />
                  ))}
                  <EffectSelect
                    label={`Image ${index + 1} position`}
                    value={image.position}
                    options={POSITIONS}
                    onCommit={(position) =>
                      run("update_image_overlay", { imageId: image.id, position })
                    }
                  />
                  <EffectSelect
                    label={`Image ${index + 1} animation`}
                    value={image.animation}
                    options={MOTIONS}
                    onCommit={(animation) =>
                      run("update_image_overlay", { imageId: image.id, animation })
                    }
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => run("remove_image_overlay", { imageId: image.id })}
                  >
                    Remove image {index + 1}
                  </button>
                </div>
              </details>
            ))}
          </div>
        </details>
      </fieldset>
      {!online ? (
        <p role="status">Connect to the editor engine to edit effects.</p>
      ) : total <= 0 ? (
        <p>Import video to add effects.</p>
      ) : null}
    </section>
  );
}
