// Draws text overlays as DOM/CSS over a video frame (or a preset chip). Positions and sizes use container query
// units, so the layer must sit inside an element with `container-type: size` that has the frame's aspect ratio;
// everything then scales with the frame, like the export does. Animation maths lives in lib/overlay-anim.ts.

import type { Overlay } from "@dax/core";
import { type CSSProperties, memo } from "react";
import { layoutOverlay, type OverlayFrame, overlayFrame, type TextPart } from "../lib/overlay-anim";

/** The overlay fields the layer draws. A saved {@link Overlay} satisfies it, and so does a preset sample. */
export type OverlayView = Pick<
  Overlay,
  "id" | "start" | "duration" | "text" | "subtitle" | "animation" | "style"
>;

const ORIGIN_X = { center: "50%", left: "0%" } as const;
const ORIGIN_Y = { top: "0%", center: "50%", bottom: "100%" } as const;

/** Convert `#rrggbb` and an opacity to a CSS rgba() colour. */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** CSS for one line of overlay text at the given animation frame. Exported for tests. */
export function partStyle(part: TextPart, frame: OverlayFrame): CSSProperties {
  const centered = part.hAlign === "center";
  return {
    position: "absolute",
    left: centered ? `${part.leftCqw}cqw` : `calc(${part.leftCqw}cqw - ${part.padCqh}cqh)`,
    top: `calc(${part.topCqh}cqh - ${part.padCqh}cqh)`,
    fontSize: `${part.sizeCqh}cqh`,
    lineHeight: 1.21,
    fontWeight: part.bold ? 700 : 400,
    color: part.color,
    whiteSpace: "pre",
    padding: `${part.padCqh}cqh`,
    background: part.box ? rgba(part.box.color, part.box.opacity) : undefined,
    opacity: frame.opacity,
    transformOrigin: `${ORIGIN_X[part.originX]} ${ORIGIN_Y[part.originY]}`,
    transform: `translate(${frame.offsetX * 100}cqw, ${frame.offsetY * 100}cqh) translateX(${centered ? "-50%" : "0"}) scale(${frame.scale})`,
    willChange: "transform, opacity",
  };
}

/** One overlay at one instant. */
const OverlayItem = memo(function OverlayItem({
  overlay,
  time,
}: {
  overlay: OverlayView;
  time: number;
}) {
  const frame = overlayFrame(overlay, time);
  if (!frame.visible) return null;
  const parts = layoutOverlay(overlay);
  return (
    <>
      {parts.map((part) => {
        const text =
          part.typed && frame.visibleChars !== null
            ? [...part.text].slice(0, frame.visibleChars).join("")
            : part.text;
        return (
          <div
            key={part.key}
            className="dx-ovl-text"
            data-overlay-id={overlay.id}
            data-part={part.key}
            style={partStyle(part, frame)}
          >
            {text}
          </div>
        );
      })}
    </>
  );
});

/** Draw every overlay in `overlays` that is visible at timeline time `time`. */
export function OverlayLayer({
  overlays,
  time,
}: {
  overlays: readonly OverlayView[];
  time: number;
}) {
  return (
    <div className="dx-ovl-layer" aria-hidden="true">
      {overlays.map((o) => (
        <OverlayItem key={o.id} overlay={o} time={time} />
      ))}
    </div>
  );
}
