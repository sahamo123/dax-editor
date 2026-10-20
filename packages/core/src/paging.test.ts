// Paging for long reads: get_transcript and get_project return one page and say where the next one starts.

import { describe, expect, it } from "vitest";
import { tryRunCommand } from "./commands.js";
import { overlayFromPreset } from "./presets.js";
import type { Asset, Project } from "./schema.js";
import { Session } from "./session.js";
import { addAsset, appendClip, emptyProject } from "./timeline.js";

const words = Array.from({ length: 500 }, (_, i) => ({
  text: `w${i}`,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const asset: Asset = {
  id: "a1",
  path: "/x/a.mp4",
  kind: "video",
  duration: 260,
  hasAudio: true,
  transcript: { words },
};

describe("get_transcript paging", () => {
  it("returns one page at a time, with the offset of the next", async () => {
    const session = new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));
    const first = await tryRunCommand({ session }, "get_transcript", {});
    expect(first.ok).toBe(true);
    const d1 = (first as { data: Record<string, unknown> }).data;
    expect(d1).toMatchObject({ totalWords: 500, offset: 0, returned: 300, nextOffset: 300 });

    const second = await tryRunCommand({ session }, "get_transcript", { offset: 300 });
    const d2 = (second as { data: Record<string, unknown> }).data;
    expect(d2).toMatchObject({ offset: 300, returned: 200, nextOffset: null });
    expect(String(d2.text)).toContain("w499");
    expect(String(d2.text)).not.toContain("w0 ");
  });

  it("honours a smaller limit", async () => {
    const session = new Session(appendClip(addAsset(emptyProject("t"), asset), "a1"));
    const r = await tryRunCommand({ session }, "get_transcript", { limit: 50, offset: 10 });
    expect((r as { data: Record<string, unknown> }).data).toMatchObject({
      returned: 50,
      nextOffset: 60,
    });
  });
});

describe("get_project paging", () => {
  it("pages long overlay lists instead of returning them all", async () => {
    let p: Project = appendClip(addAsset(emptyProject("t"), asset), "a1");
    p = structuredClone(p);
    p.timeline.overlays = Array.from({ length: 150 }, (_, i) => ({
      ...overlayFromPreset("title-fade", { start: i, duration: 1, text: `t${i}` }),
      id: `ov${i}`,
    }));
    const session = new Session(p);
    const first = await tryRunCommand({ session }, "get_project", {});
    const d1 = (first as { data: Record<string, unknown> }).data;
    expect(d1).toMatchObject({ overlayCount: 150, nextOffset: 100 });
    expect((d1.overlays as unknown[]).length).toBe(100);

    const second = await tryRunCommand({ session }, "get_project", { offset: 100 });
    const d2 = (second as { data: Record<string, unknown> }).data;
    expect(d2).toMatchObject({ nextOffset: null });
    expect((d2.overlays as unknown[]).length).toBe(50);
    expect((second as { summary: string }).summary).toContain("150 overlay(s)");
  });
});
