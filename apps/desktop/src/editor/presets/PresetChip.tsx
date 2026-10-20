// A small animated sample of a text preset: a 16:9 mock frame looping the preset's real animation (drawn by the same
// OverlayLayer the preview uses). All chips share one animation clock so a long preset list costs one timer.

import { memo, useEffect, useMemo, useState } from "react";
import { OverlayLayer } from "../preview/OverlayLayer";
import { chipLoopLength, type PresetWithStyle, presetSample } from "./preset-style";

const listeners = new Set<(seconds: number) => void>();
let raf = 0;
let lastEmit = 0;

/** Subscribe to a shared ~30 fps clock (seconds). The clock only runs while someone is subscribed. */
function subscribeClock(fn: (seconds: number) => void): () => void {
  listeners.add(fn);
  if (!raf) {
    const loop = (now: number) => {
      if (now - lastEmit >= 33) {
        lastEmit = now;
        for (const l of listeners) l(now / 1000);
      }
      raf = listeners.size > 0 ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
  }
  return () => {
    listeners.delete(fn);
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Animated chip for one preset. */
export const PresetChip = memo(function PresetChip({ preset }: { preset: PresetWithStyle }) {
  const sample = useMemo(() => presetSample(preset), [preset]);
  const loop = chipLoopLength(sample);
  const reduced = useMemo(prefersReducedMotion, []);
  // With reduced motion the chip is a still frame from the middle of the animation.
  const [time, setTime] = useState(reduced ? sample.start + sample.duration * 0.6 : 0);

  useEffect(() => {
    if (reduced) return;
    return subscribeClock((s) => setTime(s % loop));
  }, [loop, reduced]);

  return (
    <div className="dx-chip" data-testid="preset-chip" data-animation={preset.animation}>
      <div className="dx-chip-frame">
        <OverlayLayer overlays={[sample]} time={time} />
      </div>
    </div>
  );
});
