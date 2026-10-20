// The playhead line. It is moved imperatively (a CSS transform set from a store subscription) so playback at 60 Hz
// never re-renders React components. Pointer events are handled by the Timeline's ruler, not here.

import { useEffect, useLayoutEffect, useRef } from "react";
import { useEditorStore } from "../context";
import { GUTTER } from "./constants";

/** The playhead line plus its handle on the ruler. `zoom` is pixels per second. */
export function Playhead({ zoom }: { zoom: number }) {
  const store = useEditorStore();
  const ref = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const t = store.getState().playhead;
    el.style.transform = `translateX(${GUTTER + t * zoomRef.current}px)`;
    el.setAttribute("data-time", t.toFixed(3));
  };

  // Re-place when zoom changes, then follow the store.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `zoom` is the trigger, placement reads it through a ref.
  useLayoutEffect(place, [zoom]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribes once; `place` only reads refs and the store.
  useEffect(() => store.subscribe(place), [store]);

  return (
    <div ref={ref} className="dx-playhead" data-testid="playhead">
      <div className="dx-playhead-handle" />
    </div>
  );
}
