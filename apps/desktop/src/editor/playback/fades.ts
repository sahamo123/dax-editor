// Fade envelope for a clip: how bright and loud it is at a moment inside the clip. Linear, like FFmpeg's `fade` and `afade`.

/**
 * Gain from 0 to 1 at `local` seconds into a clip that lasts `duration` seconds, with a fade-in of `fadeIn` seconds
 * and a fade-out of `fadeOut` seconds (fades from/to black and silence). If the two fades together are longer than
 * the clip they are scaled down proportionally so the clip still reaches full level only if there is room.
 */
export function fadeFactor(
  local: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
): number {
  if (duration <= 0) return 0;
  let fi = Math.max(0, fadeIn);
  let fo = Math.max(0, fadeOut);
  const total = fi + fo;
  if (total > duration) {
    const k = duration / total;
    fi *= k;
    fo *= k;
  }
  let g = 1;
  if (fi > 0 && local < fi) g = Math.min(g, Math.max(0, local) / fi);
  if (fo > 0 && local > duration - fo) g = Math.min(g, Math.max(0, duration - local) / fo);
  return g;
}
