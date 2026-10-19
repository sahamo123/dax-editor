import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COMMANDS,
  type CommandContext,
  commandTools,
  getCommand,
  runCommand,
  tryRunCommand,
} from "./commands.js";
import { probe } from "./media.js";
import type { Asset } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject, mainClips, timelineDuration } from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

function ctxWithClip(extra: Partial<CommandContext> = {}): CommandContext {
  const project = appendClip(addAsset(emptyProject("t"), asset), "a1");
  return { session: new Session(project), ...extra };
}

describe("registry shape", () => {
  it("has unique snake_case names, descriptions and object schemas", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of commandTools()) {
      expect(t.name).toMatch(/^[a-z][a-z_]*$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.parameters).toMatchObject({ type: "object" });
      expect(t.parameters).not.toHaveProperty("$schema");
    }
  });

  it("flags only export as irreversible, and read-only commands never edit", () => {
    expect(
      commandTools()
        .filter((t) => t.irreversible)
        .map((t) => t.name),
    ).toEqual(["export_video"]);
    expect(commandTools({ readOnlyOnly: true }).map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_project", "list_presets", "detect_silence", "get_history"]),
    );
  });

  it("filters tools by name", () => {
    expect(commandTools({ names: ["split", "undo"] }).map((t) => t.name)).toEqual([
      "split",
      "undo",
    ]);
  });

  it("describes arguments to the model", () => {
    const del = commandTools({ names: ["delete_range"] })[0];
    const params = del?.parameters as { properties: Record<string, { description?: string }> };
    const props = params.properties;
    expect(props.from?.description).toMatch(/seconds/);
  });

  it("looks commands up", () => {
    expect(getCommand("split")?.readOnly).toBe(false);
    expect(getCommand("nope")).toBeUndefined();
  });
});

describe("running commands", () => {
  it("get_project reports clips and totals", async () => {
    const r = await runCommand(ctxWithClip(), "get_project", {});
    expect(r.summary).toMatch(/10s, 1 clip/);
    expect((r.data as { clips: unknown[] }).clips).toHaveLength(1);
  });

  it("edits, records history with the source, and undoes", async () => {
    const ctx = ctxWithClip({ source: "ai" });
    await runCommand(ctx, "split", { at: 4 });
    await runCommand(ctx, "delete_range", { from: 2, to: 6 });
    expect(timelineDuration(ctx.session.project)).toBe(6);
    expect(ctx.session.history().at(-1)).toMatchObject({ label: "Delete 2s to 6s", source: "ai" });
    await runCommand(ctx, "undo", {});
    expect(timelineDuration(ctx.session.project)).toBe(10);
  });

  it("works with overlays end to end", async () => {
    const ctx = ctxWithClip();
    const added = await runCommand(ctx, "add_overlay", {
      preset: "lower-third-slide",
      start: 1,
      text: "Ada",
      subtitle: "Engineer",
      color: "#ff0000",
    });
    const id = (added.data as { overlayId: string }).overlayId;
    expect(ctx.session.project.timeline.overlays[0]).toMatchObject({
      text: "Ada",
      subtitle: "Engineer",
    });
    expect(ctx.session.project.timeline.overlays[0]?.style.color).toBe("#ff0000");
    await runCommand(ctx, "update_overlay", { overlayId: id, subtitle: null, text: "Grace" });
    expect(ctx.session.project.timeline.overlays[0]).toMatchObject({ text: "Grace" });
    expect(ctx.session.project.timeline.overlays[0]?.subtitle).toBeUndefined();
    await runCommand(ctx, "remove_overlay", { overlayId: id });
    expect(ctx.session.project.timeline.overlays).toHaveLength(0);
  });

  it("restores any earlier state and named checkpoints", async () => {
    const ctx = ctxWithClip();
    await runCommand(ctx, "save_checkpoint", { name: "original" });
    await runCommand(ctx, "delete_range", { from: 0, to: 5 });
    await runCommand(ctx, "delete_range", { from: 0, to: 2 });
    expect(timelineDuration(ctx.session.project)).toBe(3);
    const history = (await runCommand(ctx, "get_history", {})).data as {
      id: number;
      name?: string;
    }[];
    const original = history.find((h) => h.name === "original");
    await runCommand(ctx, "restore_state", { id: original?.id });
    expect(timelineDuration(ctx.session.project)).toBe(10);
  });

  it("rejects bad arguments with a message a model can act on", async () => {
    const ctx = ctxWithClip();
    await expect(runCommand(ctx, "delete_range", { from: "soon", to: 3 })).rejects.toThrow(
      /Invalid arguments for delete_range: from/,
    );
    await expect(runCommand(ctx, "add_overlay", { preset: "nope", start: 0 })).rejects.toThrow(
      /preset/,
    );
    await expect(runCommand(ctx, "frobnicate", {})).rejects.toThrow(/Unknown command/);
  });

  it("turns edit-function errors into command errors and leaves the project alone", async () => {
    const ctx = ctxWithClip();
    await expect(runCommand(ctx, "split", { at: 99 })).rejects.toThrow(
      /No clip can be split at 99s/,
    );
    await expect(runCommand(ctx, "undo", {})).rejects.toThrow(/Nothing to undo/);
    expect(timelineDuration(ctx.session.project)).toBe(10);
  });

  it("tryRunCommand returns errors as values", async () => {
    const ctx = ctxWithClip();
    const bad = await tryRunCommand(ctx, "split", { at: 99 });
    expect(bad).toMatchObject({ ok: false });
    const good = await tryRunCommand(ctx, "split", { at: 3 });
    expect(good).toMatchObject({ ok: true });
  });

  it("transcript commands explain when there is no transcript", async () => {
    const ctx = ctxWithClip();
    await expect(runCommand(ctx, "get_transcript", {})).rejects.toThrow(/no transcript yet/);
    await expect(runCommand(ctx, "remove_fillers", {})).rejects.toThrow(/no transcript yet/);
  });

  it("removes filler words found in a transcript", async () => {
    const ctx = ctxWithClip();
    await ctx.session.apply((p) => {
      const q = structuredClone(p);
      const a = q.assets.a1;
      if (a) {
        a.transcript = {
          words: [
            { text: "So", start: 0, end: 0.5 },
            { text: "um", start: 1, end: 1.5 },
            { text: "yes", start: 2, end: 2.5 },
          ],
        };
      }
      return q;
    });
    const r = await runCommand(ctx, "remove_fillers", {});
    expect(r.summary).toMatch(/1 filler/);
    expect(timelineDuration(ctx.session.project)).toBeCloseTo(10 - 0.54, 2);
    const t = await runCommand(ctx, "get_transcript", { from: 0, to: 3 });
    expect((t.data as { text: string }).text).toContain("[00:00] So um yes");
  });
});

describe("path safety", () => {
  it("refuses to import or export outside the allowed folders", async () => {
    const ctx = ctxWithClip({ allowedRoots: ["/safe"] });
    await expect(runCommand(ctx, "import_media", { path: "/etc/passwd" })).rejects.toThrow(
      /outside the allowed folders/,
    );
    await expect(runCommand(ctx, "export_video", { path: "/tmp/x.mp4" })).rejects.toThrow(
      /outside the allowed folders/,
    );
  });

  it("only exports .mp4 and never overwrites by default", async () => {
    const ctx = ctxWithClip();
    await expect(runCommand(ctx, "export_video", { path: "/tmp/x.mov" })).rejects.toThrow(/\.mp4/);
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFfmpeg())("commands on real media (needs ffmpeg)", () => {
  let dir: string;
  let src: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dax-cmd-"));
    mkdirSync(join(dir, "out"));
    src = join(dir, "src.mp4");
    execFileSync("ffmpeg", [
      ...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=6:s=320x240:r=30"],
      ...[
        "-f",
        "lavfi",
        "-i",
        "sine=f=440:d=2",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono:d=2",
      ],
      ...["-f", "lavfi", "-i", "sine=f=440:d=2"],
      ...["-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]"],
      ...["-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", src],
    ]);
  }, 30_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("imports, removes silence, and exports without overwriting", async () => {
    const ctx: CommandContext = { session: new Session(emptyProject("e2e")), allowedRoots: [dir] };
    await runCommand(ctx, "import_media", { path: src });
    expect(mainClips(ctx.session.project)).toHaveLength(1);

    const found = await runCommand(ctx, "detect_silence", {});
    expect((found.data as { count: number }).count).toBe(1);

    const before = timelineDuration(ctx.session.project);
    const r = await runCommand(ctx, "remove_silences", {});
    expect(r.summary).toMatch(/Removed 1 silence/);
    expect(timelineDuration(ctx.session.project)).toBeLessThan(before - 1.5);

    // A second pass finds nothing and adds no history entry.
    const states = ctx.session.history().length;
    expect((await runCommand(ctx, "remove_silences", {})).summary).toMatch(/Nothing changed/);
    expect(ctx.session.history()).toHaveLength(states);

    const out = join(dir, "out", "result.mp4");
    const progress: number[] = [];
    await runCommand({ ...ctx, onProgress: (f) => progress.push(f) }, "export_video", {
      path: out,
    });
    expect(existsSync(out)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    const exported = await probe(out);
    expect(exported.duration).toBeCloseTo(timelineDuration(ctx.session.project), 0);

    await expect(runCommand(ctx, "export_video", { path: out })).rejects.toThrow(/already exists/);
    await runCommand(ctx, "export_video", { path: out, overwrite: true });
  }, 90_000);

  it("rejects missing files and non-video files", async () => {
    const ctx: CommandContext = { session: new Session(emptyProject("e2e")) };
    await expect(
      runCommand(ctx, "import_media", { path: join(dir, "missing.mp4") }),
    ).rejects.toThrow(/File not found/);
    const wav = join(dir, "tone.wav");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=d=1", wav]);
    await expect(runCommand(ctx, "import_media", { path: wav })).rejects.toThrow(/only video/);
    writeFileSync(join(dir, "notes.txt"), "hello");
    await expect(
      runCommand(ctx, "import_media", { path: join(dir, "notes.txt") }),
    ).rejects.toThrow();
  }, 30_000);
});

describe("transcribe and set_format", () => {
  it("transcribes through the injected engine and records it as one edit", async () => {
    const ctx = ctxWithClip({
      transcriber: {
        async transcribe(_path, opts) {
          return {
            language: opts?.language ?? "en",
            words: [{ text: "hello", start: 0.1, end: 0.5 }],
          };
        },
      },
    });
    const r = await runCommand(ctx, "transcribe", { language: "en" });
    expect(r.summary).toMatch(/1 word/);
    expect(ctx.session.project.assets.a1?.transcript?.words).toHaveLength(1);
    expect(ctx.session.history().at(-1)?.label).toMatch(/^Transcribe/);
  });

  it("explains when no speech engine is set up", async () => {
    await expect(runCommand(ctxWithClip(), "transcribe", {})).rejects.toThrow(/not set up/);
  });

  it("changes the output format by preset or size, and rejects odd sizes", async () => {
    const ctx = ctxWithClip();
    await runCommand(ctx, "set_format", { preset: "portrait-1080x1920" });
    expect(ctx.session.project.timeline).toMatchObject({ width: 1080, height: 1920 });
    await runCommand(ctx, "set_format", { fps: 60 });
    expect(ctx.session.project.timeline).toMatchObject({ width: 1080, height: 1920, fps: 60 });
    await expect(runCommand(ctx, "set_format", { width: 101, height: 100 })).rejects.toThrow(
      /even/,
    );
  });
});

describe("set_format fit", () => {
  it("defaults vertical presets to a blurred background and landscape back to bars", async () => {
    const ctx = ctxWithClip();
    await runCommand(ctx, "set_format", { preset: "portrait-1080x1920" });
    expect(ctx.session.project.timeline.fit).toBe("blur");
    await runCommand(ctx, "set_format", { fit: "cover" });
    expect(ctx.session.project.timeline.fit).toBe("cover");
    await runCommand(ctx, "set_format", { preset: "square-1080" });
    expect(ctx.session.project.timeline.fit).toBe("cover"); // an explicit choice is kept
    await runCommand(ctx, "set_format", { preset: "landscape-1080p" });
    expect(ctx.session.project.timeline.fit).toBe("contain");
  });
});
