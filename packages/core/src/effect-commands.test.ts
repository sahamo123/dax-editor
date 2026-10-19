import { describe, expect, it } from "vitest";
import { COMMANDS, type CommandContext, commandTools, runCommand } from "./commands.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";
import { zoomsOf } from "./zoom.js";

const EFFECT_NAMES = ["add_zoom", "update_zoom", "remove_zoom"];

describe("effects commands in the registry", () => {
  it("registers the three zoom commands, with short plain descriptions and documented arguments", () => {
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
