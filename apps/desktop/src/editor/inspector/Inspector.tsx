// The Inspector: edit the selected overlay (text, subtitle, animation, colour, size, position, start, duration) or the
// selected clip (volume, fades). Every change is a command sent through run(); text-like fields are debounced.

import type { Clip, Overlay } from "@dax/core";
import type { CommandResponse } from "@dax/protocol";
import { type ReactNode, useId } from "react";
import { useEditActions } from "../actions";
import { useEditorApi, useEditorSelector, useExec } from "../context";
import { baseName, clipDur, findClip, findOverlay, MIN_OVERLAY_DURATION } from "../lib/project";
import { clamp, formatDuration, round } from "../lib/time";
import { useDraft } from "./useDraft";

const ANIMATION_LABEL: Record<string, string> = {
  none: "None",
  fade: "Fade",
  "slide-up": "Slide up",
  "slide-left": "Slide in from left",
  pop: "Pop",
  typewriter: "Typewriter",
};
const POSITION_LABEL: Record<string, string> = {
  center: "Center",
  top: "Top",
  bottom: "Bottom",
  "lower-third": "Lower third",
};

/** A labelled row of the inspector form. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="dx-field">
      <label className="dx-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="dx-field-control">{children}</div>
    </div>
  );
}

/** A number input with a slider, committed after a pause. */
function NumberSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  slider?: boolean;
  onCommit: (v: number) => Promise<CommandResponse> | undefined;
  testId: string;
}) {
  const id = useId();
  const { min, max, onCommit } = props;
  const [draft, setDraft, flush] = useDraft<number>(props.value, (v) =>
    onCommit(clamp(v, min, max)),
  );
  return (
    <Field label={props.label} htmlFor={id}>
      {props.slider ? (
        <input
          type="range"
          aria-label={`${props.label} slider`}
          min={props.min}
          max={props.max}
          step={props.step}
          value={clamp(draft, props.min, props.max)}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={flush}
        />
      ) : null}
      <input
        id={id}
        data-testid={props.testId}
        className="dx-num"
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={Number.isFinite(draft) ? round(draft, 3) : ""}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) setDraft(v);
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          if (e.key === "Enter") flush();
        }}
      />
      {props.unit ? <span className="dx-unit">{props.unit}</span> : null}
    </Field>
  );
}

function OverlayInspector({ overlay }: { overlay: Overlay }) {
  const exec = useExec();
  const actions = useEditActions();
  const textId = useId();
  const subId = useId();
  const colorId = useId();
  const animId = useId();
  const patch = (fields: Record<string, unknown>) =>
    exec("update_overlay", { overlayId: overlay.id, ...fields });

  const [text, setText, flushText] = useDraft(overlay.text, (v) =>
    v.trim().length === 0 ? undefined : patch({ text: v }),
  );
  const [subtitle, setSubtitle, flushSub] = useDraft(overlay.subtitle ?? "", (v) =>
    patch({ subtitle: v.length === 0 ? null : v }),
  );
  const [color, setColor, flushColor] = useDraft(
    overlay.style.color,
    (v) => patch({ color: v }),
    250,
  );
  const emptyText = text.trim().length === 0;

  return (
    <div className="dx-inspector-body" data-testid="inspector-overlay">
      <h3 className="dx-inspector-title">Text overlay</h3>
      <Field label="Text" htmlFor={textId}>
        <textarea
          id={textId}
          data-testid="overlay-text"
          rows={2}
          maxLength={280}
          value={text}
          aria-invalid={emptyText}
          onChange={(e) => setText(e.target.value)}
          onBlur={flushText}
        />
        {emptyText ? <span className="dx-field-error">Text cannot be empty.</span> : null}
      </Field>
      <Field label="Second line" htmlFor={subId}>
        <input
          id={subId}
          data-testid="overlay-subtitle"
          type="text"
          maxLength={280}
          placeholder="Optional"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          onBlur={flushSub}
        />
      </Field>
      <Field label="Animation" htmlFor={animId}>
        <select
          id={animId}
          data-testid="overlay-animation"
          value={overlay.animation}
          onChange={(e) => void patch({ animation: e.target.value })}
        >
          {Object.entries(ANIMATION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Position">
        <fieldset className="dx-segmented" aria-label="Position">
          {Object.entries(POSITION_LABEL).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={overlay.style.position === value}
              data-testid={`position-${value}`}
              onClick={() => void patch({ position: value })}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </Field>
      <Field label="Colour" htmlFor={colorId}>
        <input
          id={colorId}
          data-testid="overlay-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={flushColor}
        />
        <span className="dx-unit">{color}</span>
      </Field>
      <NumberSlider
        label="Size"
        testId="overlay-size"
        value={overlay.style.fontSize}
        min={8}
        max={400}
        step={1}
        unit="px"
        slider
        onCommit={(v) => patch({ fontSize: Math.round(v) })}
      />
      <NumberSlider
        label="Start"
        testId="overlay-start"
        value={round(overlay.start)}
        min={0}
        max={36000}
        step={0.1}
        unit="s"
        onCommit={(v) => patch({ start: round(v) })}
      />
      <NumberSlider
        label="Duration"
        testId="overlay-duration"
        value={round(overlay.duration)}
        min={MIN_OVERLAY_DURATION}
        max={120}
        step={0.1}
        unit="s"
        onCommit={(v) => patch({ duration: round(v) })}
      />
      <div className="dx-inspector-actions">
        <button
          type="button"
          className="dx-btn dx-btn-danger"
          onClick={() => void actions.deleteSelected()}
        >
          Delete overlay
        </button>
      </div>
    </div>
  );
}

function ClipInspector({ clip, name }: { clip: Clip; name: string }) {
  const exec = useExec();
  const actions = useEditActions();
  const dur = clipDur(clip);
  return (
    <div className="dx-inspector-body" data-testid="inspector-clip">
      <h3 className="dx-inspector-title">Clip</h3>
      <dl className="dx-facts">
        <dt>File</dt>
        <dd title={name}>{name}</dd>
        <dt>Starts at</dt>
        <dd>{formatDuration(clip.start)}</dd>
        <dt>Length</dt>
        <dd>{formatDuration(dur)}</dd>
        <dt>Source</dt>
        <dd>
          {clip.in.toFixed(2)}s to {clip.out.toFixed(2)}s
        </dd>
      </dl>
      <NumberSlider
        label="Volume"
        testId="clip-volume"
        value={Math.round(clip.volume * 100)}
        min={0}
        max={400}
        step={5}
        unit="%"
        slider
        onCommit={(v) => exec("set_volume", { clipId: clip.id, volume: round(v / 100, 2) })}
      />
      <NumberSlider
        label="Fade in"
        testId="clip-fade-in"
        value={round(clip.fadeIn, 2)}
        min={0}
        max={Math.max(0, round(dur - clip.fadeOut, 2))}
        step={0.1}
        unit="s"
        slider
        onCommit={(v) => exec("set_fades", { clipId: clip.id, fadeIn: round(v, 2) })}
      />
      <NumberSlider
        label="Fade out"
        testId="clip-fade-out"
        value={round(clip.fadeOut, 2)}
        min={0}
        max={Math.max(0, round(dur - clip.fadeIn, 2))}
        step={0.1}
        unit="s"
        slider
        onCommit={(v) => exec("set_fades", { clipId: clip.id, fadeOut: round(v, 2) })}
      />
      <div className="dx-inspector-actions">
        <button type="button" className="dx-btn" onClick={() => void actions.split()}>
          Split at playhead
        </button>
        <button
          type="button"
          className="dx-btn dx-btn-danger"
          onClick={() => void actions.deleteSelected()}
        >
          Delete clip
        </button>
      </div>
    </div>
  );
}

/**
 * Properties of whatever is selected on the timeline. Shows a hint when nothing is selected.
 */
export function Inspector({ className }: { className?: string }) {
  const api = useEditorApi();
  const selection = useEditorSelector((s) => s.selection);
  const project = api.state.project;
  const overlay = selection?.kind === "overlay" ? findOverlay(project, selection.id) : undefined;
  const clip = selection?.kind === "clip" ? findClip(project, selection.id) : undefined;
  const cls = `dx-inspector${className ? ` ${className}` : ""}`;

  if (overlay) {
    return (
      <div className={cls} data-testid="inspector">
        <OverlayInspector key={overlay.id} overlay={overlay} />
      </div>
    );
  }
  if (clip) {
    const asset = project.assets[clip.assetId];
    return (
      <div className={cls} data-testid="inspector">
        <ClipInspector
          key={clip.id}
          clip={clip}
          name={asset ? baseName(asset.path) : "Missing media"}
        />
      </div>
    );
  }
  return (
    <div className={`${cls} dx-empty`} data-testid="inspector">
      <p>Select a clip or a text overlay on the timeline to edit its properties.</p>
    </div>
  );
}
