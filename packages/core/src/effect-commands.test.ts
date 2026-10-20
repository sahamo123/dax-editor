// The effects commands through the registry: arguments, safety (repeat, undo, errors) and, with FFmpeg, importing real
// files and exporting a video that has a zoom, music and a logo together.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audioClips } from "./audio-layer.js";
import { COMMANDS, type CommandContext, commandTools, runCommand } from "./commands.js";
import { imagesOf } from "./image-overlays.js";
import { probe } from "./media.js";
import { Session } from "./session.js";
import {
  audioLevels,
  ff,
  hasFfmpeg,
  makePng,
  makeSpeechVideo,
  makeTempDir,
  makeTone,
  pixel,
  removeTempDir,
  rgbFrameAt,
} from "./test-utils.js";
import { addAsset, appendClip, emptyProject, timelineDuration } from "./timeline.js";
import { zoomsOf } from "./zoom.js";

const EFFECT_NAMES = [
  "add_zoom",
  "update_zoom",
  "remove_zoom",
  "add_audio",
  "update_audio",
  "remove_audio",
  "set_ducking",
  "add_image_overlay",
  "update_image_overlay",
  "remove_image_overlay",
];

describe("effects commands in the registry", () => {
  it("registers all ten commands, with short plain descriptions and documented arguments", () => {
    const tools = commandTools({ names: EFFECT_NAMES });
    expect(tools.map((t) => t.name).sort()).toEqual([...EFFECT_NAMES].sort());
    for (const t of tools) {
      expect(t.readOnly).toBe(false);
      expect(t.irreversible).toBe(false);
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(
        t.description.length,
        `${t.name} description is too long for a small model`,
      ).toBeLessThan(430);
      const props = (t.parameters as { properties: Record<string, { description?: string }> })
        .properties;
      // Every argument that is not a bare id says what it is (the description reaches the model).
      for (const [name, def] of Object.entries(props)) {
        if (name.endsWith("Id") || name === "id") continue;
        expect(def.description, `${t.name}.${name}`).toBeTruthy();
      }
    }
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
  });
});

/** A project with a 10 s clip of an asset that never needs to exist on disk (for commands that do not read files). */
function ctxWithVideo(): CommandContext {
  const p = appendClip(
    addAsset(emptyProject("t", { width: 640, height: 360 }), {
      id: "a1",
      path: "/x/a.mp4",
      kind: "video",
      duration: 10,
      hasAudio: true,
    }),
    "a1",
  );
  return { session: new Session(p) };
}

describe("zoom commands", () => {
  it("adds a punch-in, shows it in get_project, and one undo removes it", async () => {
    const ctx = ctxWithVideo();
    const r = await runCommand(ctx, "add_zoom", { start: 2, end: 4, scale: 1.25 });
    expect(r.summary).toMatch(/punch-in to 1.25x from 2s to 4s/);
    const zoomId = (r.data as { zoomId: string }).zoomId;
    const zoom = zoomsOf(ctx.session.project)[0];
    expect(zoom).toMatchObject({
      id: zoomId,
      start: 2,
      duration: 2,
      fromScale: 1.25,
      toScale: 1.25,
    });
    const info = (await runCommand(ctx, "get_project", {})).data as { zooms: { id: string }[] };
    expect(info.zooms.map((z) => z.id)).toEqual([zoomId]);
    await runCommand(ctx, "undo", {});
    expect(zoomsOf(ctx.session.project)).toHaveLength(0);
  });

  it("makes a push-in glide from 1, with the ease asked for", async () => {
    const ctx = ctxWithVideo();
    await runCommand(ctx, "add_zoom", {
      start: 1,
      end: 6,
      scale: 1.1,
      style: "push-in",
      ease: "linear",
    });
    expect(zoomsOf(ctx.session.project)[0]).toMatchObject({
      fromScale: 1,
      toScale: 1.1,
      ease: "linear",
    });
  });

  it("is safe to repeat: the same range is updated, nothing is doubled, no history is added", async () => {
    const ctx = ctxWithVideo();
    await runCommand(ctx, "add_zoom", { start: 2, end: 4 });
    const states = ctx.session.history().length;
    const again = await runCommand(ctx, "add_zoom", { start: 2, end: 4 });
    expect(again.summary).toMatch(/nothing changed/);
    expect(zoomsOf(ctx.session.project)).toHaveLength(1);
    expect(ctx.session.history()).toHaveLength(states);
    // Same range with a different amount is an update of that zoom.
    await runCommand(ctx, "add_zoom", { start: 2, end: 4, scale: 1.4 });
    expect(zoomsOf(ctx.session.project)).toHaveLength(1);
    expect(zoomsOf(ctx.session.project)[0]?.toScale).toBe(1.4);
  });

  it("explains bad requests in plain words", async () => {
    const ctx = ctxWithVideo();
    await expect(runCommand(ctx, "add_zoom", { start: 4, end: 3 })).rejects.toThrow(/end after/);
    await expect(runCommand(ctx, "add_zoom", { start: 12, end: 14 })).rejects.toThrow(
      /only 10s long/,
    );
    await expect(runCommand(ctx, "add_zoom", { start: 1, end: 3, scale: 9 })).rejects.toThrow(
      /Invalid arguments/,
    );
    await runCommand(ctx, "add_zoom", { start: 2, end: 5 });
    await expect(runCommand(ctx, "add_zoom", { start: 4, end: 6 })).rejects.toThrow(
      /overlaps zoom/,
    );
  });

  it("updates and removes a zoom; a hold stays a hold when its amount changes", async () => {
    const ctx = ctxWithVideo();
    const id = (
      (await runCommand(ctx, "add_zoom", { start: 1, end: 3 })).data as { zoomId: string }
    ).zoomId;
    await runCommand(ctx, "update_zoom", { zoomId: id, scale: 1.3, end: 4 });
    expect(zoomsOf(ctx.session.project)[0]).toMatchObject({
      start: 1,
      duration: 3,
      fromScale: 1.3,
      toScale: 1.3,
    });
    await runCommand(ctx, "update_zoom", { zoomId: id, startScale: 1 });
    expect(zoomsOf(ctx.session.project)[0]).toMatchObject({ fromScale: 1, toScale: 1.3 });
    await expect(runCommand(ctx, "update_zoom", { zoomId: "nope", scale: 1.2 })).rejects.toThrow(
      /Unknown zoom/,
    );
    await runCommand(ctx, "remove_zoom", { zoomId: id });
    expect(zoomsOf(ctx.session.project)).toHaveLength(0);
    await expect(runCommand(ctx, "remove_zoom", { zoomId: id })).rejects.toThrow(/Unknown zoom/);
    await runCommand(ctx, "undo", {});
    expect(zoomsOf(ctx.session.project)).toHaveLength(1);
  });

  it("follows ripple deletes", async () => {
    const ctx = ctxWithVideo();
    await runCommand(ctx, "add_zoom", { start: 6, end: 8 });
    await runCommand(ctx, "delete_range", { from: 1, to: 3 });
    expect(zoomsOf(ctx.session.project)[0]).toMatchObject({ start: 4, duration: 2 });
  });
});

describe.skipIf(!hasFfmpeg())("audio and image commands with real files (needs ffmpeg)", () => {
  let dir: string;
  let videoPath: string;
  const f = (name: string) => join(dir, name);

  beforeAll(async () => {
    dir = makeTempDir("dax-fx-cmd-");
    videoPath = f("talk.mp4");
    makeSpeechVideo(videoPath, 6, 0.4);
    makeTone(f("song.wav"), 220, 3, 0.5);
    makeTone(f("pop.wav"), 880, 0.4, 0.5);
    makePng(f("logo.png"), "red", 200, 100);
    ff(["-f", "lavfi", "-i", "color=c=blue:s=64x64:r=10:d=1", f("mute.mp4")]);
  }, 60_000);
  afterAll(() => removeTempDir(dir));

  async function ctx(extra: Partial<CommandContext> = {}): Promise<CommandContext> {
    const asset = await probe(videoPath);
    const p = appendClip(
      addAsset(emptyProject("e2e", { width: 640, height: 360 }), asset),
      asset.id,
    );
    return { session: new Session(p), ...extra };
  }

  it("imports music by path, places it, and one undo takes it (and its import) away", async () => {
    const c = await ctx();
    const r = await runCommand(c, "add_audio", { path: f("song.wav"), start: 1, volume: 0.4 });
    expect(r.summary).toMatch(/Added music "song.wav" from 1s for 3s; it will drop under speech/);
    const clip = audioClips(c.session.project)[0];
    expect(clip).toMatchObject({ role: "music", start: 1, volume: 0.4, length: 3 });
    expect(Object.values(c.session.project.assets).some((a) => a.kind === "audio")).toBe(true);
    await runCommand(c, "undo", {});
    expect(audioClips(c.session.project)).toHaveLength(0);
    expect(Object.values(c.session.project.assets).some((a) => a.kind === "audio")).toBe(false);
  }, 30_000);

  it("fills the rest of the video when asked to loop, and gives music default fades", async () => {
    const c = await ctx();
    await runCommand(c, "add_audio", { path: f("song.wav"), start: 1, loop: true });
    const clip = audioClips(c.session.project)[0];
    expect(clip?.length).toBeCloseTo(timelineDuration(c.session.project) - 1, 3);
    expect(clip?.loop).toBe(true);
    expect(clip?.fadeIn).toBeGreaterThan(0);
    expect(clip?.fadeOut).toBeGreaterThan(0);
  }, 30_000);

  it("is safe to repeat: the same file at the same start is not added twice", async () => {
    const c = await ctx();
    await runCommand(c, "add_audio", { path: f("song.wav") });
    const states = c.session.history().length;
    const again = await runCommand(c, "add_audio", { path: f("song.wav") });
    expect(again.summary).toMatch(/nothing changed/);
    expect(audioClips(c.session.project)).toHaveLength(1);
    expect(Object.keys(c.session.project.assets)).toHaveLength(2); // the video and the song, once
    expect(c.session.history()).toHaveLength(states);
    // A different start is a second clip; an effect is a separate role and not a duplicate.
    await runCommand(c, "add_audio", { path: f("song.wav"), start: 4 });
    await runCommand(c, "add_audio", { path: f("pop.wav"), role: "sfx", start: 2 });
    expect(audioClips(c.session.project)).toHaveLength(3);
  }, 30_000);

  it("updates, removes and sets ducking, each as one undoable step", async () => {
    const c = await ctx();
    const id = (
      (await runCommand(c, "add_audio", { path: f("song.wav") })).data as { audioId: string }
    ).audioId;
    await runCommand(c, "update_audio", { audioId: id, volume: 0.1, start: 2, fadeOut: 0.5 });
    expect(audioClips(c.session.project)[0]).toMatchObject({ volume: 0.1, start: 2, fadeOut: 0.5 });

    const d = await runCommand(c, "set_ducking", { amountDb: 18 });
    expect(d.summary).toMatch(/18 dB/);
    expect(c.session.project.timeline.ducking).toMatchObject({ enabled: true, amountDb: 18 });
    expect((await runCommand(c, "set_ducking", { enabled: false })).summary).toMatch(/Ducking off/);
    await runCommand(c, "undo", {});
    expect(c.session.project.timeline.ducking?.enabled).toBe(true);

    await runCommand(c, "remove_audio", { audioId: id });
    expect(audioClips(c.session.project)).toHaveLength(0);
    await expect(runCommand(c, "remove_audio", { audioId: id })).rejects.toThrow(/Unknown audio/);
    await runCommand(c, "undo", {});
    expect(audioClips(c.session.project)).toHaveLength(1);
  }, 30_000);

  it("says plainly what is wrong with a file or an argument", async () => {
    const c = await ctx();
    await expect(runCommand(c, "add_audio", {})).rejects.toThrow(/Give a path/);
    await expect(runCommand(c, "add_audio", { path: f("song.wav"), assetId: "x" })).rejects.toThrow(
      /either path or assetId/,
    );
    await expect(runCommand(c, "add_audio", { path: f("missing.wav") })).rejects.toThrow(
      /not found/,
    );
    await expect(runCommand(c, "add_audio", { path: f("logo.png") })).rejects.toThrow(
      /needs a music or sound file/,
    );
    await expect(runCommand(c, "add_audio", { path: f("mute.mp4") })).rejects.toThrow(/no sound/);
    await expect(runCommand(c, "add_audio", { assetId: "nope" })).rejects.toThrow(/Unknown asset/);
    await expect(runCommand(c, "add_image_overlay", { path: videoPath })).rejects.toThrow(
      /needs a picture/,
    );
    const locked = await ctx({ allowedRoots: [join(dir, "nowhere")] });
    await expect(runCommand(locked, "add_audio", { path: f("song.wav") })).rejects.toThrow(
      /outside the allowed folders/,
    );
    expect(audioClips(c.session.project)).toHaveLength(0);
  }, 30_000);

  it("adds a logo from a PNG with a preset, updates it, removes it, and is safe to repeat", async () => {
    const c = await ctx();
    const r = await runCommand(c, "add_image_overlay", {
      path: f("logo.png"),
      preset: "watermark",
    });
    expect(r.summary).toMatch(/Added "logo.png" at 0s for 6s \(bottom-right\)/);
    const id = (r.data as { imageId: string }).imageId;
    const img = imagesOf(c.session.project)[0];
    expect(img).toMatchObject({ preset: "watermark", opacity: 0.5, animation: "none" });
    const states = c.session.history().length;
    await runCommand(c, "add_image_overlay", { path: f("logo.png"), preset: "watermark" });
    expect(imagesOf(c.session.project)).toHaveLength(1);
    expect(c.session.history()).toHaveLength(states);

    await runCommand(c, "update_image_overlay", {
      imageId: id,
      opacity: 0.8,
      position: "top-left",
    });
    expect(imagesOf(c.session.project)[0]).toMatchObject({ opacity: 0.8, position: "top-left" });
    const info = (await runCommand(c, "get_project", {})).data as { images: { file: string }[] };
    expect(info.images[0]?.file).toBe("logo.png");
    await runCommand(c, "remove_image_overlay", { imageId: id });
    await expect(runCommand(c, "remove_image_overlay", { imageId: id })).rejects.toThrow(
      /Unknown image/,
    );
    await runCommand(c, "undo", {});
    expect(imagesOf(c.session.project)).toHaveLength(1);
  }, 30_000);

  it("exports a video with a zoom, music and a logo together", async () => {
    const c = await ctx();
    await runCommand(c, "add_zoom", { start: 1, end: 3, scale: 1.5 });
    await runCommand(c, "add_audio", { path: f("song.wav"), loop: true, volume: 0.5 });
    await runCommand(c, "add_image_overlay", {
      path: f("logo.png"),
      preset: "sticker-pop",
      start: 3.5,
      duration: 2,
      animation: "none",
    });
    await runCommand(c, "add_overlay", {
      preset: "title-fade",
      start: 0.5,
      duration: 2,
      text: "Hi",
    });
    const out = join(dir, "all.mp4");
    await runCommand(c, "export_video", { path: out });
    const info = await probe(out);
    expect(info.duration).toBeCloseTo(6, 0);
    expect(info.width).toBe(640);
    // The sticker (red, centred) is on screen at 4.5 s and not at 0.2 s.
    const during = pixel(rgbFrameAt(out, 4.5), 320, 180);
    expect(during[0]).toBeGreaterThan(200);
    expect(pixel(rgbFrameAt(out, 0.2), 320, 180)[0]).toBeLessThan(80);
    // Music is audible in the gap between voice bursts (3.6 to 4.2 s).
    expect(audioLevels(out, 3.8, 0.3, 220).rmsDb).toBeGreaterThan(-30);
  }, 120_000);
});
