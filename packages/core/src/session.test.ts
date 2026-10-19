import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Asset } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, deleteRange, emptyProject, timelineDuration } from "./timeline.js";

const asset: Asset = { id: "a1", path: "/x/a.mp4", kind: "video", duration: 10, hasAudio: true };

function fresh() {
  return new Session(addAsset(emptyProject("t"), asset));
}

describe("Session history", () => {
  it("undoes and redoes along one branch", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"), { label: "Add clip", source: "manual" });
    await s.apply((p) => deleteRange(p, 2, 4), { label: "Delete 2-4", source: "ai" });
    expect(timelineDuration(s.project)).toBe(8);
    await s.undo();
    expect(timelineDuration(s.project)).toBe(10);
    expect(s.canRedo).toBe(true);
    await s.redo();
    expect(timelineDuration(s.project)).toBe(8);
    expect(s.canRedo).toBe(false);
  });

  it("refuses to undo past the start or redo past the end", async () => {
    const s = fresh();
    await expect(s.undo()).rejects.toThrow(/Nothing to undo/);
    await expect(s.redo()).rejects.toThrow(/Nothing to redo/);
  });

  it("keeps the old branch after undo then a new edit", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"), { label: "Add clip" });
    await s.apply((p) => deleteRange(p, 0, 5), { label: "Delete first half" });
    const abandoned = s.history().find((h) => h.label === "Delete first half");
    await s.undo();
    await s.apply((p) => deleteRange(p, 5, 10), { label: "Delete second half" });
    expect(s.history().map((h) => h.label)).toEqual([
      "Start",
      "Add clip",
      "Delete first half",
      "Delete second half",
    ]);
    // The abandoned state is still reachable.
    await s.restore(abandoned?.id ?? -1);
    expect(timelineDuration(s.project)).toBe(5);
    expect(s.project.timeline.tracks[0]?.clips[0]?.in).toBe(5);
  });

  it("records who made each edit and flags the current state", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"), { label: "Import", source: "manual" });
    await s.apply((p) => deleteRange(p, 0, 1), { label: "AI trim", source: "ai" });
    const h = s.history();
    expect(h.map((x) => x.source)).toEqual(["system", "manual", "ai"]);
    expect(h.filter((x) => x.current)).toHaveLength(1);
    expect(h[2]).toMatchObject({ current: true, duration: 9, clips: 1 });
  });

  it("saves and restores named checkpoints", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"));
    s.checkpoint("rough cut");
    await s.apply((p) => deleteRange(p, 0, 6));
    expect(timelineDuration(s.project)).toBe(4);
    await s.restoreCheckpoint("rough cut");
    expect(timelineDuration(s.project)).toBe(10);
    await expect(s.restoreCheckpoint("nope")).rejects.toThrow(/No checkpoint/);
    expect(s.history().find((h) => h.name === "rough cut")).toBeDefined();
  });

  it("a failing edit changes nothing", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"));
    const before = s.history().length;
    await expect(s.apply((p) => deleteRange(p, 5, 2))).rejects.toThrow();
    expect(s.history()).toHaveLength(before);
    expect(timelineDuration(s.project)).toBe(10);
  });

  it("redo after restore walks toward the restored branch", async () => {
    const s = fresh();
    await s.apply((p) => appendClip(p, "a1"), { label: "a" });
    await s.apply((p) => deleteRange(p, 0, 1), { label: "b" });
    const last = s.history().at(-1);
    await s.restore(0);
    expect(s.canUndo).toBe(false);
    await s.redo();
    await s.redo();
    expect(s.history().find((h) => h.current)?.id).toBe(last?.id);
  });
});

describe("Session history on disk", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "dax-hist-"));
    dirs.push(d);
    return join(d, "p.dax.json");
  };
  afterAll(() => {
    // `dirs` holds the temp directories we created, so remove exactly those and nothing above them.
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  async function seed(file: string) {
    const s = await Session.open(file, "persist");
    await s.apply((p) => appendClip(addAsset(p, asset), "a1"), { label: "Add clip" });
    await s.apply((p) => deleteRange(p, 0, 4), { label: "Cut intro", source: "ai" });
    s.checkpoint("good version");
    return s;
  }

  it("keeps the history, sources and checkpoints across a restart, so undo still works", async () => {
    const file = tmp();
    await seed(file);
    const reopened = await Session.open(file);
    expect(reopened.history().map((h) => h.label)).toEqual(["Start", "Add clip", "Cut intro"]);
    expect(reopened.history().at(-1)).toMatchObject({ source: "ai", current: true });
    expect(timelineDuration(reopened.project)).toBe(6);
    await reopened.undo();
    expect(timelineDuration(reopened.project)).toBe(10);
    await reopened.redo();
    await reopened.apply((p) => deleteRange(p, 0, 1), { label: "More" });
    const third = await Session.open(file);
    expect(third.history()).toHaveLength(4);
  });

  it("ignores a history that does not match the project on disk", async () => {
    const file = tmp();
    await seed(file);
    // Someone edits the project file by hand: the saved history no longer describes it.
    const edited = { ...JSON.parse(readFileSync(file, "utf8")), name: "edited elsewhere" };
    writeFileSync(file, JSON.stringify(edited));
    const reopened = await Session.open(file);
    expect(reopened.history().map((h) => h.label)).toEqual(["Start"]);
    expect(reopened.project.name).toBe("edited elsewhere");
  });

  it("survives a corrupt history file", async () => {
    const file = tmp();
    await seed(file);
    writeFileSync(`${file}.history.json`, "{ not json");
    const reopened = await Session.open(file);
    expect(reopened.history()).toHaveLength(1);
    expect(timelineDuration(reopened.project)).toBe(6);
  });

  it("prunes the oldest states but keeps checkpoints and the current state", async () => {
    const file = tmp();
    const s = await Session.open(file, "big");
    await s.apply((p) => appendClip(addAsset(p, asset), "a1"), { label: "base" });
    s.checkpoint("keep me");
    for (let i = 0; i < 420; i++) {
      await s.apply((p) => ({ ...p, name: `v${i}` }), { label: `edit ${i}` });
    }
    const h = s.history();
    expect(h.length).toBeLessThanOrEqual(400);
    expect(h.find((x) => x.name === "keep me")).toBeDefined();
    expect(h.at(-1)).toMatchObject({ current: true, label: "edit 419" });
    // Pruning must leave a consistent tree: undo works and never points at a missing state.
    await s.undo();
    expect(s.project.name).toBe("v418");
    const reopened = await Session.open(file);
    expect(reopened.history().length).toBeLessThanOrEqual(400);
  }, 60_000);
});

describe("Session history cap without a file", () => {
  it("keeps an in-memory session's history at 400 states", async () => {
    // No backing file, so nothing writes the history: the cap must hold on apply itself.
    const s = fresh();
    for (let i = 0; i < 450; i++) {
      await s.apply((p) => ({ ...p, name: `v${i}` }), { label: `edit ${i}` });
    }
    expect(s.history().length).toBeLessThanOrEqual(400);
    expect(s.history().at(-1)).toMatchObject({ current: true, label: "edit 449" });
    await s.undo();
    expect(s.project.name).toBe("v448");
  });
});

describe("Session autosave failures", () => {
  it("keeps an edit whose autosave failed and reports it through saveError instead of throwing", async () => {
    // The backing file lives in a folder that does not exist, so every write fails.
    const dir = mkdtempSync(join(tmpdir(), "dax-sess-"));
    try {
      const s = new Session(addAsset(emptyProject("t"), asset), join(dir, "missing", "p.dax.json"));
      // Before the fix apply() rejected here while the edit stayed applied, so a retry duplicated it.
      await s.apply((p) => appendClip(p, "a1"), { label: "Add clip" });
      expect(timelineDuration(s.project)).toBe(10);
      expect(s.history().at(-1)).toMatchObject({ label: "Add clip", current: true });
      expect(s.saveError).toBeTruthy();
      // An explicit save still throws: the caller asked for the write itself.
      await expect(s.save()).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists a checkpoint name without needing another edit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dax-sess-"));
    try {
      const file = join(dir, "p.dax.json");
      const s = await Session.open(file, "t");
      await s.apply((p) => addAsset(p, asset));
      await s.saveCheckpoint("before cuts");
      const reopened = await Session.open(file);
      expect(reopened.history().find((h) => h.name === "before cuts")).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("has no saveError while saves work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dax-sess-"));
    try {
      const s = await Session.open(join(dir, "p.dax.json"), "t");
      await s.apply((p) => addAsset(p, asset));
      expect(s.saveError).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
