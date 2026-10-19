// Types for fixture-video.mjs.

/** Make a short test video (tone and silence alternating every 1.5 s) with FFmpeg's lavfi sources. */
export function makeFixtureVideo(
  path: string,
  options?: { seconds?: number; width?: number; height?: number },
): Promise<string>;
