// What the timeline draws for each clip right now, as a pure function: the saved layout, overridden by the
// optimistic hold after a drop, overridden by the live preview of a drag in progress.

import type { PlacedClip } from "../lib/clip-layout";
import type { Drag, Optimistic } from "./gesture-env";

/** Compute the clips to draw. Never mutates its inputs. */
export function displayClips(
  saved: readonly PlacedClip[],
  optimistic: Optimistic | null,
  drag: Drag | null,
): PlacedClip[] {
  let list: PlacedClip[] = optimistic?.clips ? [...optimistic.clips] : [...saved];
  const patch = optimistic?.clipPatch;
  if (patch) list = list.map((c) => (patch[c.id] ? { ...c, ...patch[c.id] } : c));
  if (drag?.type === "trim") return [...drag.preview.clips];
  if (drag?.type === "fade" || drag?.type === "volume") {
    const d = drag;
    list = list.map((c) => {
      if (c.id !== d.clipId) return c;
      if (d.type === "volume") return { ...c, volume: d.value };
      return d.side === "in" ? { ...c, fadeIn: d.value } : { ...c, fadeOut: d.value };
    });
  }
  return list;
}
