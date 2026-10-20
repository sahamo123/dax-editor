import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "./media.js";
import { addOverlay } from "./overlays.js";
import { overlayFromPreset } from "./presets.js";
import { exportProject } from "./render.js";
import { addAsset, appendClip, emptyProject, setClipFades } from "./timeline.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Raw RGB bytes of one frame (320x180) taken at `t` seconds. */
function frameAt(file: string, t: number): Buffer {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:180",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 10_000_000 },
  );
}

/** Fraction of pixels that differ noticeably from the first pixel (the flat background). */
function changedFraction(buf: Buffer): number {
  const [r, g, b] = [buf[0] ?? 0, buf[1] ?? 0, buf[2] ?? 0];
  let changed = 0;
  for (let i = 0; i < buf.length; i += 3) {
    const d =
      Math.abs((buf[i] ?? 0) - r) +
      Math.abs((buf[i + 1] ?? 0) - g) +
      Math.abs((buf[i + 2] ?? 0) - b);
    if (d > 60) changed++;
  }
  return changed / (buf.length / 3);
}

describe.skipIf(!hasFfmpeg())("overlay and fade rendering (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-ovl-"));
    src = join(dir, "bg.mp4");
    execFileSync("ffmpeg", [
      ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x224466:s=640x360:r=30:d=6"],
      ...["-f", "lavfi", "-i", "sine=f=300:d=6", "-shortest", "-c:v", "mpeg4", "-c:a", "aac", src],
    ]);
  }, 30_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function render(texts: string[]) {
    const asset = await probe(src);
    let p = appendClip(
      addAsset(emptyProject("t", { width: 640, height: 360, fps: 30 }), asset),
      asset.id,
    );
    texts.forEach((text, i) => {
      p = addOverlay(
        p,
        overlayFromPreset("title-fade", { start: 1 + i * 0.01, duration: 3, text, lane: i }),
      );
    });
    const out = join(dir, `out-${Math.random().toString(36).slice(2)}.mp4`);
    await exportProject(p, out);
    return out;
  }

  it("draws the title only while it is on screen", async () => {
    const out = await render(["Hello world"]);
    expect(changedFraction(frameAt(out, 0.4))).toBeLessThan(0.001); // before
    expect(changedFraction(frameAt(out, 2.5))).toBeGreaterThan(0.002); // during
    expect(changedFraction(frameAt(out, 5.2))).toBeLessThan(0.001); // after
  }, 60_000);

  it("survives hostile text with quotes, colons, percent signs, brackets and newlines", async () => {
    const out = await render([`He said: "it's 100%" \\ ; [x] , 'y'\nsecond line %{localtime}`]);
    expect(changedFraction(frameAt(out, 2.5))).toBeGreaterThan(0.002);
  }, 60_000);

  it("renders several overlays on top of each other", async () => {
    const one = changedFraction(frameAt(await render(["One"]), 2.5));
    const two = changedFraction(frameAt(await render(["One", "Two"]), 2.5));
    expect(two).toBeGreaterThanOrEqual(one);
  }, 90_000);

  it("fades a clip to black at the end", async () => {
    const asset = await probe(src);
    let p = appendClip(
      addAsset(emptyProject("t", { width: 640, height: 360, fps: 30 }), asset),
      asset.id,
    );
    const id = p.timeline.tracks[0]?.clips[0]?.id ?? "";
    p = setClipFades(p, id, { fadeOut: 1 });
    const out = join(dir, "fade.mp4");
    await exportProject(p, out);
    const mid = frameAt(out, 2);
    const last = frameAt(out, 5.9);
    const brightness = (b: Buffer) => b.reduce((s, v) => s + v, 0) / b.length;
    expect(brightness(mid)).toBeGreaterThan(40);
    expect(brightness(last)).toBeLessThan(brightness(mid) * 0.35);
  }, 60_000);
});
