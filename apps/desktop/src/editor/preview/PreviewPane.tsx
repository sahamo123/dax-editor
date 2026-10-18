// The preview: plays the EDIT (not a file) by driving two stacked <video> elements through the PlaybackEngine,
// and draws text overlays on top as DOM/CSS. It owns no project state; it reads the clips from EditorApi.state.

import type { Project } from "@dax/core";
import { mediaUrl } from "@dax/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorApi, useEditorSelector, useEditorStore, useProject } from "../context";
import { clipDur, mainClips } from "../lib/project";
import { connectEngine } from "../playback/controller";
import {
  type EngineClip,
  type EngineHost,
  type MediaSlot,
  PlaybackEngine,
} from "../playback/engine";
import { Icon } from "../ui/icons";
import { CaptionLayer } from "./CaptionLayer";
import { OverlayLayer } from "./OverlayLayer";

/** Overlays at the live playhead. A separate component so only this subtree re-renders at 60 Hz. */
function LiveOverlays() {
  const project = useProject();
  const time = useEditorSelector((s) => s.playhead);
  return (
    <>
      <CaptionLayer project={project} />
      <OverlayLayer overlays={project.timeline.overlays} time={time} />
    </>
  );
}

/**
 * Build the engine's clip list from the project. Assets that are missing play as black. `urlFor` is injectable so
 * tests do not need a server.
 */
export function buildEngineClips(
  project: Project,
  urlFor: (assetId: string) => string,
): EngineClip[] {
  return mainClips(project).map((c) => ({
    id: c.id,
    assetId: c.assetId,
    url: project.assets[c.assetId] ? urlFor(c.assetId) : null,
    start: c.start,
    in: c.in,
    out: c.out,
    volume: c.volume,
    fadeIn: c.fadeIn,
    fadeOut: c.fadeOut,
  }));
}

/** A string that changes only when something that affects playback changes (so state pushes about jobs do nothing). */
function clipsSignature(clips: readonly EngineClip[]): string {
  return clips
    .map((c) => `${c.id}|${c.url}|${c.start}|${c.in}|${c.out}|${c.volume}|${c.fadeIn}|${c.fadeOut}`)
    .join(";");
}

/**
 * The video preview. Shows the edit at the playhead; plays, pauses and seeks as the editor state asks.
 * Fill its parent (it uses 100% width and height) and give the parent a definite height.
 */
export function PreviewPane({ className }: { className?: string }) {
  const api = useEditorApi();
  const store = useEditorStore();
  const project = useProject();
  const playing = useEditorSelector((s) => s.playing);
  const video0 = useRef<HTMLVideoElement>(null);
  const video1 = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);

  const { serverUrl, token } = api;
  const clips = useMemo(
    () => buildEngineClips(project, (id) => mediaUrl(serverUrl, token, id, "proxy.mp4")),
    [project, serverUrl, token],
  );
  const signature = clipsSignature(clips);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  // Create the engine once per mounted preview.
  useEffect(() => {
    const a = video0.current;
    const b = video1.current;
    if (!a || !b) return;
    const showing: [HTMLVideoElement, HTMLVideoElement] = [a, b];
    const host: EngineHost = {
      onPlayhead: store.reportPlayhead,
      onEnded: () => store.setPlaying(false),
      onVisual: (active, opacity) => {
        showing[active].style.opacity = String(opacity);
        showing[active === 0 ? 1 : 0].style.opacity = "0";
      },
      onBlocked: (isBlocked) => {
        setBlocked(isBlocked);
        if (isBlocked) store.setPlaying(false);
      },
      onBuffering: setBuffering,
      onMediaError: (assetId) => setMissing(assetId),
    };
    const engine = new PlaybackEngine([a as MediaSlot, b as MediaSlot], host);
    engineRef.current = engine;
    engine.setClips(clipsRef.current, store.getState().playhead);
    const disconnect = connectEngine(engine, store);
    store.players += 1;
    let raf = requestAnimationFrame(function loop(now) {
      engine.tick(now);
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      store.players -= 1;
      disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [store]);

  // Feed edits into the engine. `signature` stands in for the clips so no-op state pushes are ignored.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clips are read through clipsRef, keyed by signature.
  useEffect(() => {
    engineRef.current?.setClips(clipsRef.current, store.getState().playhead);
    setMissing(null);
  }, [signature, store]);

  // A proxy that was still being made is now done: try again.
  const proxyJobs = api.state.jobs
    .filter((j) => j.kind === "proxy")
    .map((j) => `${j.id}:${j.status}`)
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: proxyJobs is the trigger, `missing` is only read.
  useEffect(() => {
    if (missing) {
      engineRef.current?.reload();
      setMissing(null);
    }
  }, [proxyJobs]);

  const aspect = project.timeline.width / project.timeline.height;
  // `cover` crops to fill like the export. `blur` (a blurred copy behind) is previewed as `contain`.
  const fit = project.timeline.fit === "cover" ? "cover" : "contain";
  const empty = clips.length === 0;
  const duration = clips.reduce((n, c) => n + clipDur(c), 0);

  return (
    <div className={`dx-preview${className ? ` ${className}` : ""}`} data-testid="preview">
      <div className="dx-preview-viewport">
        <div
          className="dx-stage"
          data-testid="stage"
          style={{
            aspectRatio: `${project.timeline.width} / ${project.timeline.height}`,
            width: `min(100cqw, calc(100cqh * ${aspect}))`,
          }}
        >
          {/* biome-ignore lint/a11y/useMediaCaption: this plays the user's own footage, which has no caption track */}
          <video
            ref={video0}
            className="dx-video"
            style={{ objectFit: fit }}
            playsInline
            preload="auto"
            data-testid="video-a"
          />
          {/* biome-ignore lint/a11y/useMediaCaption: this plays the user's own footage, which has no caption track */}
          <video
            ref={video1}
            className="dx-video"
            style={{ objectFit: fit }}
            playsInline
            preload="auto"
            data-testid="video-b"
          />
          <LiveOverlays />
          {empty ? (
            <div className="dx-stage-note" data-testid="preview-empty">
              Import a video to start editing
            </div>
          ) : null}
          {blocked ? (
            <button
              type="button"
              className="dx-stage-cta"
              onClick={() => {
                setBlocked(false);
                store.setPlaying(true);
              }}
            >
              <Icon name="play" width={22} height={22} /> Click to play
            </button>
          ) : null}
          {!empty && buffering && playing ? <div className="dx-stage-badge">Loading...</div> : null}
          {missing ? (
            <div className="dx-stage-badge" role="status">
              Preparing preview...
            </div>
          ) : null}
          {!empty ? (
            <button
              type="button"
              className="dx-stage-hit"
              aria-label={playing ? "Pause" : "Play"}
              disabled={duration <= 0}
              onClick={() => store.togglePlay()}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
