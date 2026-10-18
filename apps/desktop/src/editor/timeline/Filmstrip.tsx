// Thumbnails along the top of a clip block. Uses the asset's filmstrip sprite (one row of equally spaced frames)
// as a CSS background, rendering only the tiles inside the visible window, so very long clips stay cheap.
// Falls back to the single `thumb.jpg` image, then to a plain gradient, if the server has not produced them yet.

import { memo } from "react";
import { filmstripFrames, useImageSize } from "../lib/media-cache";
import { clamp } from "../lib/time";
import { THUMB_H } from "./constants";

/** Props of {@link Filmstrip}. */
export interface FilmstripProps {
  spriteUrl: string | null;
  thumbUrl: string | null;
  /** Length of the whole source file, in seconds, which the sprite spans. */
  assetDuration: number;
  /** Width / height of the video frame. */
  aspect: number;
  /** Source time at the left edge of the block. */
  sourceIn: number;
  zoom: number;
  /** Visible part of the block, in pixels from its left edge. */
  fromPx: number;
  toPx: number;
}

/** The thumbnail row of a clip. */
export const Filmstrip = memo(function Filmstrip(p: FilmstripProps) {
  const sprite = useImageSize(p.spriteUrl);
  const thumbReady = useImageSize(sprite === null ? p.thumbUrl : null);
  const tileW = Math.max(24, Math.round(THUMB_H * p.aspect));
  const first = Math.max(0, Math.floor(p.fromPx / tileW));
  const last = Math.max(first, Math.ceil(p.toPx / tileW));
  const tiles: number[] = [];
  for (let k = first; k <= last && tiles.length < 80; k++) tiles.push(k);

  if (sprite) {
    const n = filmstripFrames(sprite, p.aspect);
    return (
      <div className="dx-film" aria-hidden="true">
        {tiles.map((k) => {
          const t = p.sourceIn + ((k + 0.5) * tileW) / p.zoom;
          const frame = clamp(Math.floor((t / Math.max(0.001, p.assetDuration)) * n), 0, n - 1);
          return (
            <div
              key={k}
              className="dx-film-tile"
              style={{
                left: k * tileW,
                width: tileW,
                height: THUMB_H,
                backgroundImage: `url("${p.spriteUrl}")`,
                backgroundSize: `${n * tileW}px ${THUMB_H}px`,
                backgroundPosition: `${-frame * tileW}px 0`,
              }}
            />
          );
        })}
      </div>
    );
  }
  if (thumbReady && p.thumbUrl) {
    return (
      <div
        className="dx-film dx-film-single"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${p.thumbUrl}")`,
          backgroundSize: `auto ${THUMB_H}px`,
        }}
      />
    );
  }
  return <div className="dx-film dx-film-empty" aria-hidden="true" />;
});
