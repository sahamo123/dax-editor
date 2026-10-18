import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probe } from "./media.js";
import { exportProject } from "./render.js";
import type { Fit } from "./schema.js";
import { addAsset, appendClip, emptyProject, setFormat } from "./timeline.js";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** RGB of the pixel at (x, y) of a 90x160 thumbnail of the frame at `t`. */
function pixel(file: string, x: number, y: number): [number, number, number] {
  const buf = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      "1",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=90:160",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 5_000_000 },
  );
  const i = (y * 90 + x) * 3;
  return [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0];
}

const brightness = ([r, g, b]: [number, number, number]) => r + g + b;

describe.skipIf(!hasFfmpeg())(
  "fitting landscape footage into a vertical frame (needs ffmpeg)",
  () => {
    let dir: string;
    let src: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "dax-fit-"));
      src = join(dir, "blue.mp4");
      // A bright blue landscape clip, so "black bars" and "filled" are easy to tell apart.
      execFileSync("ffmpeg", [
        ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x3366cc:s=640x360:r=30:d=3"],
        ...[
          "-f",
          "lavfi",
          "-i",
          "sine=f=300:d=3",
          "-shortest",
          "-c:v",
          "mpeg4",
          "-c:a",
          "aac",
          src,
        ],
      ]);
    }, 30_000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    const render = async (fit: Fit) => {
      const a = await probe(src);
      let p = appendClip(addAsset(emptyProject("t"), a), a.id);
      p = setFormat(p, { width: 360, height: 640, fit });
      const out = join(dir, `${fit}.mp4`);
      await exportProject(p, out);
      const info = await probe(out);
      expect([info.width, info.height]).toEqual([360, 640]);
      return out;
    };

    it("contain leaves black bars above and below", async () => {
      const out = await render("contain");
      expect(brightness(pixel(out, 45, 5))).toBeLessThan(30); // top bar
      expect(brightness(pixel(out, 45, 80))).toBeGreaterThan(300); // the picture
    }, 60_000);

    it("cover crops the picture to fill the whole frame", async () => {
      const out = await render("cover");
      expect(brightness(pixel(out, 45, 5))).toBeGreaterThan(300);
      expect(brightness(pixel(out, 2, 80))).toBeGreaterThan(300);
    }, 60_000);

    it("blur fills the bars with a blurred copy and keeps the sharp picture in the middle", async () => {
      const out = await render("blur");
      expect(brightness(pixel(out, 45, 5))).toBeGreaterThan(300); // not black
      expect(brightness(pixel(out, 45, 80))).toBeGreaterThan(300);
    }, 60_000);
  },
);
