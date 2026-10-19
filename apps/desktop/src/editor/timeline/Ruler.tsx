// The time ruler: ticks and labels for the visible window only, and the sticky corner above the lane labels.
// Pointer handling (scrubbing) is done by the Timeline, which owns the scroll container.

import { memo } from "react";
import { rulerLabel, rulerTicks, tickSpec } from "../lib/geometry";
import { GUTTER, RULER_H } from "./constants";

/** Props of {@link Ruler}. */
export interface RulerProps {
  zoom: number;
  fps: number;
  /** Visible window in pixels from the time origin. */
  fromPx: number;
  toPx: number;
  /** Total content width, so the ruler background spans the whole track. */
  width: number;
}

/** Ruler ticks for the visible window. Memoised: it only changes with zoom or when the window moves a step. */
export const Ruler = memo(function Ruler({ zoom, fps, fromPx, toPx, width }: RulerProps) {
  const spec = tickSpec(zoom, fps);
  const ticks = rulerTicks(Math.max(0, fromPx / zoom), toPx / zoom, spec);
  return (
    <div className="dx-ruler" style={{ width, height: RULER_H }} data-testid="ruler">
      {ticks.map((t) => {
        const x = GUTTER + t.time * zoom;
        return (
          <div
            key={t.time.toFixed(5)}
            className={t.major ? "dx-tick dx-tick-major" : "dx-tick"}
            style={{ left: x }}
          >
            {t.major ? (
              <span className="dx-tick-label">{rulerLabel(t.time, spec, fps)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
