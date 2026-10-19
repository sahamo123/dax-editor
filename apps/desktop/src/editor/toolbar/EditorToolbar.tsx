// The editor toolbar: undo/redo, split/delete, transport (start, frame step, play, end, loop, mute), timecode,
// snapping and zoom. Buttons only call store actions or edit actions; no project data is touched here.

import type { ReactNode } from "react";
import { canSplitAt, useEditActions } from "../actions";
import { useEditorApi, useEditorSelector, useEditorStore } from "../context";
import { MAX_ZOOM, MIN_ZOOM } from "../lib/geometry";
import { mainClips } from "../lib/project";
import { formatTimecode } from "../lib/time";
import { Icon, type IconName } from "../ui/icons";

/** One toolbar button. */
function Tool(props: {
  icon: IconName;
  label: string;
  shortcut?: string;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
  primary?: boolean;
}) {
  const title = props.shortcut ? `${props.label} (${props.shortcut})` : props.label;
  return (
    <button
      type="button"
      className={`dx-tool${props.primary ? " dx-tool-primary" : ""}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={title}
      disabled={props.disabled}
      data-testid={props.testId}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

function Separator() {
  return <hr className="dx-sep" aria-orientation="vertical" />;
}

/** Current time and total length. Its own component so only it re-renders while playing. */
function Timecode({ fps, duration }: { fps: number; duration: number }) {
  const t = useEditorSelector((s) => s.playhead);
  return (
    <output className="dx-timecode" data-testid="timecode" aria-label="Playhead time">
      <span className="dx-timecode-now">{formatTimecode(t, fps)}</span>
      <span className="dx-timecode-total"> / {formatTimecode(duration, fps)}</span>
    </output>
  );
}

function ZoomSlider() {
  const store = useEditorStore();
  const zoom = useEditorSelector((s) => s.zoom);
  const lo = Math.log(MIN_ZOOM);
  const hi = Math.log(MAX_ZOOM);
  return (
    <input
      className="dx-zoom-slider"
      type="range"
      aria-label="Zoom"
      data-testid="zoom-slider"
      min={lo}
      max={hi}
      step={0.01}
      value={Math.log(zoom)}
      onChange={(e) => store.setZoom(Math.exp(Number(e.target.value)))}
    />
  );
}

/**
 * Editing toolbar. Place it above the timeline (or wherever suits the layout).
 * Pair it with `useEditorShortcuts()` so the keys match the buttons' tooltips.
 */
export function EditorToolbar({
  className,
  history = false,
}: {
  className?: string;
  /** Show Undo/Redo buttons. Off by default because the app shell has its own in the top bar. */
  history?: boolean;
}) {
  const api = useEditorApi();
  const store = useEditorStore();
  const actions = useEditActions();
  const playing = useEditorSelector((s) => s.playing);
  const loop = useEditorSelector((s) => s.loop);
  const muted = useEditorSelector((s) => s.muted);
  const snapping = useEditorSelector((s) => s.snapping);
  const selection = useEditorSelector((s) => s.selection);
  const { state } = api;
  const clips = mainClips(state.project);
  // A boolean slice: re-renders only when splitting becomes possible/impossible, not on every playhead tick.
  const splittable = useEditorSelector((s) => canSplitAt(clips, s.playhead));
  const duration = clips.length > 0 ? store.duration : 0;
  const hasMedia = duration > 0;

  const group = (children: ReactNode, label: string) => (
    // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA toolbar pattern groups controls with role="group"
    <div className="dx-tool-group" role="group" aria-label={label}>
      {children}
    </div>
  );

  return (
    <div
      className={`dx-toolbar${className ? ` ${className}` : ""}`}
      role="toolbar"
      aria-label="Editor"
      data-testid="toolbar"
    >
      {history ? (
        <>
          {group(
            <>
              <Tool
                icon="undo"
                label="Undo"
                shortcut="Ctrl+Z"
                testId="undo"
                disabled={!state.canUndo}
                onClick={() => void actions.undo()}
              />
              <Tool
                icon="redo"
                label="Redo"
                shortcut="Shift+Ctrl+Z"
                testId="redo"
                disabled={!state.canRedo}
                onClick={() => void actions.redo()}
              />
            </>,
            "History",
          )}
          <Separator />
        </>
      ) : null}
      {group(
        <>
          <Tool
            icon="split"
            label="Split at playhead"
            shortcut="S"
            testId="split"
            disabled={!splittable}
            onClick={() => void actions.split()}
          />
          <Tool
            icon="trash"
            label="Delete selected"
            shortcut="Delete"
            testId="delete"
            disabled={!selection}
            onClick={() => void actions.deleteSelected()}
          />
        </>,
        "Edit",
      )}
      <Separator />
      {group(
        <>
          <Tool
            icon="skipStart"
            label="Go to start"
            shortcut="Home"
            disabled={!hasMedia}
            onClick={() => store.setPlayhead(0)}
          />
          <Tool
            icon="stepBack"
            label="Previous frame"
            shortcut="Left"
            disabled={!hasMedia}
            onClick={() => store.stepFrames(-1)}
          />
          <Tool
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause" : "Play"}
            shortcut="Space"
            testId="play"
            primary
            disabled={!hasMedia}
            onClick={store.togglePlay}
          />
          <Tool
            icon="stepForward"
            label="Next frame"
            shortcut="Right"
            disabled={!hasMedia}
            onClick={() => store.stepFrames(1)}
          />
          <Tool
            icon="skipEnd"
            label="Go to end"
            shortcut="End"
            disabled={!hasMedia}
            onClick={() => store.setPlayhead(duration)}
          />
          <Tool
            icon="loop"
            label="Loop"
            testId="loop"
            pressed={loop}
            onClick={() => store.setLoop(!loop)}
          />
          <Tool
            icon={muted ? "mute" : "volume"}
            label={muted ? "Unmute preview" : "Mute preview"}
            testId="mute"
            pressed={muted}
            onClick={() => store.setMuted(!muted)}
          />
        </>,
        "Transport",
      )}
      <Timecode fps={state.project.timeline.fps} duration={duration} />
      <span className="dx-spacer" />
      {group(
        <>
          <Tool
            icon="magnet"
            label="Snapping"
            testId="snapping"
            pressed={snapping}
            onClick={() => store.setSnapping(!snapping)}
          />
          <Tool
            icon="zoomOut"
            label="Zoom out"
            shortcut="-"
            testId="zoom-out"
            onClick={() => store.zoomBy(1 / 1.35)}
          />
          <ZoomSlider />
          <Tool
            icon="zoomIn"
            label="Zoom in"
            shortcut="+"
            testId="zoom-in"
            onClick={() => store.zoomBy(1.35)}
          />
          <Tool
            icon="fit"
            label="Fit timeline to window"
            shortcut="Shift+Z"
            testId="zoom-fit"
            onClick={store.zoomToFit}
          />
        </>,
        "Timeline view",
      )}
    </div>
  );
}
