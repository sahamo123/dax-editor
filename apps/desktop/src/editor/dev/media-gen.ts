// Generates the demo media for the dev harness and e2e tests with FFmpeg (lavfi), so nothing is committed.
// For each source file it writes what the real server's media pipeline would: a browser-playable proxy, a poster
// thumbnail, a filmstrip sprite and waveform peaks. The proxy is VP9/Opus WebM because the Chromium bundled with
// Playwright has no H.264 decoder; the real server serves H.264 MP4, which the UI treats identically.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One generated demo asset on disk. */
export interface DemoMedia {
  /** Source video, imported into the project. */
  source: string;
  proxy: string;
  thumb: string;
  filmstrip: string;
  waveform: string;
  duration: number;
}

const FRAMES_PER_SECOND_STRIP = 2;

function ffmpeg(args: string[]): Buffer {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Peak magnitude (0..1) per slice of `sliceMs` over a mono s16 PCM buffer. */
export function computePeaks(pcm: Buffer, sampleRate: number, sliceMs: number): number[] {
  const samplesPerSlice = Math.max(1, Math.round((sampleRate * sliceMs) / 1000));
  const total = Math.floor(pcm.length / 2);
  const peaks: number[] = [];
  for (let i = 0; i < total; i += samplesPerSlice) {
    let max = 0;
    const end = Math.min(total, i + samplesPerSlice);
    for (let j = i; j < end; j++) max = Math.max(max, Math.abs(pcm.readInt16LE(j * 2)));
    peaks.push(Number((max / 32768).toFixed(4)));
  }
  return peaks;
}

/**
 * Make one demo clip: a colourful test pattern with a big letter, and a tone that pulses so the waveform
 * has an obvious shape. Returns the paths of everything the media pipeline would produce.
 */
export function makeDemoMedia(
  dir: string,
  name: string,
  opts: { letter: string; hue: number; freq: number; duration: number; fontFile: string },
): DemoMedia {
  mkdirSync(dir, { recursive: true });
  const w = 640;
  const h = 360;
  const source = join(dir, `${name}.mp4`);
  const proxy = join(dir, `${name}.proxy.webm`);
  const thumb = join(dir, `${name}.thumb.jpg`);
  const filmstrip = join(dir, `${name}.filmstrip.jpg`);
  const waveform = join(dir, `${name}.waveform.json`);

  const video = `testsrc2=size=${w}x${h}:rate=30:duration=${opts.duration},hue=h=${opts.hue},drawtext=fontfile=${opts.fontFile}:text=${opts.letter}:fontsize=220:fontcolor=white@0.85:x=(w-text_w)/2:y=(h-text_h)/2:borderw=6:bordercolor=black@0.6`;
  const audio = `aevalsrc=exprs='0.8*sin(2*PI*${opts.freq}*t)*abs(sin(2*PI*1.2*t))':s=44100:d=${opts.duration}`;
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    video,
    "-f",
    "lavfi",
    "-i",
    audio,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  // Short keyframe interval (-g 15) keeps seeking quick, as the real proxy does.
  ffmpeg([
    "-i",
    source,
    "-vf",
    "scale=480:270",
    "-c:v",
    "libvpx-vp9",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-row-mt",
    "1",
    "-b:v",
    "700k",
    "-g",
    "15",
    "-c:a",
    "libopus",
    proxy,
  ]);
  ffmpeg([
    "-ss",
    String(opts.duration / 2),
    "-i",
    source,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-2",
    thumb,
  ]);
  const frames = Math.round(opts.duration * FRAMES_PER_SECOND_STRIP);
  ffmpeg([
    "-i",
    source,
    "-vf",
    `fps=${FRAMES_PER_SECOND_STRIP},scale=160:90,tile=${frames}x1`,
    "-frames:v",
    "1",
    filmstrip,
  ]);
  const pcm = ffmpeg(["-i", source, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
  writeFileSync(waveform, JSON.stringify({ peaks: computePeaks(pcm, 8000, 50) }));
  return { source, proxy, thumb, filmstrip, waveform, duration: opts.duration };
}
