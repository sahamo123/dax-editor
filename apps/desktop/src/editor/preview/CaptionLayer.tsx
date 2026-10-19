// Draws the automatic captions (from the transcript) over the preview, in the three built-in looks. Lines are computed
// from the project, so they follow every cut automatically, just like the export. Uses container units like OverlayLayer.

import type { Project } from "@dax/core";
import { type CSSProperties, useMemo } from "react";
import { useEditorSelector } from "../context";
import {
  type ActiveCaption,
  captionAt,
  captionLook,
  previewCaptionLines,
} from "../lib/captions-preview";
import { rgba } from "./OverlayLayer";

/** CSS for the caption block of a settings/look pair. Exported for tests. */
export function captionStyle(
  settings: NonNullable<Project["timeline"]["captions"]>,
): CSSProperties {
  const look = captionLook(settings.style);
  const pad = look.boxed ? look.sizeCqh * 0.25 : 0;
  const base: CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: settings.position === "center" ? "translate(-50%, -50%)" : "translateX(-50%)",
    maxWidth: "88cqw",
    textAlign: "center",
    fontSize: `${look.sizeCqh}cqh`,
    lineHeight: 1.21,
    fontWeight: look.bold ? 700 : 400,
    color: settings.color,
    padding: `${pad}cqh ${pad * 1.4}cqh`,
    background: look.boxed ? rgba("#000000", 0.5) : undefined,
    textShadow: look.boxed
      ? undefined
      : `0 0 ${look.outlineCqh}cqh #000, 0 0 ${look.outlineCqh * 2}cqh #000, 0 0.1cqh ${look.outlineCqh * 2}cqh rgba(0,0,0,0.8)`,
    WebkitTextStroke: look.bold ? `${look.outlineCqh}cqh #000` : undefined,
    paintOrder: "stroke fill",
  };
  if (settings.position === "top") return { ...base, top: `${look.marginCqh}cqh` };
  if (settings.position === "center") return { ...base, top: "50cqh" };
  return { ...base, bottom: `${look.marginCqh}cqh` };
}

function CaptionText({
  active,
  settings,
}: {
  active: ActiveCaption;
  settings: NonNullable<Project["timeline"]["captions"]>;
}) {
  const pop = settings.style === "bold-pop";
  const words = active.line.words.map((w, i) => ({
    id: `${active.line.start}:${i}`,
    text: settings.uppercase ? w.text.toUpperCase() : w.text,
    hot: pop && i === active.activeWord,
  }));
  return (
    <div className="dx-caption" data-testid="caption" style={captionStyle(settings)}>
      {words.map((w, i) => (
        <span key={w.id} style={w.hot ? { color: settings.highlight } : undefined}>
          {i > 0 ? " " : ""}
          {w.text}
        </span>
      ))}
    </div>
  );
}

/** Captions for the current playhead. Renders nothing when captions are off or no line is showing. */
export function CaptionLayer({ project }: { project: Project }) {
  const settings = project.timeline.captions;
  const lines = useMemo(
    () => (settings ? previewCaptionLines(project, settings.maxWords) : []),
    [project, settings],
  );
  const time = useEditorSelector((s) => s.playhead);
  if (!settings) return null;
  const active = captionAt(lines, time);
  if (!active) return null;
  return (
    <div className="dx-caption-layer" aria-hidden="true">
      <CaptionText active={active} settings={settings} />
    </div>
  );
}
