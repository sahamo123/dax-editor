import type { PresetInfo } from "@dax/protocol";
import { describe, expect, it, vi } from "vitest";
import { EditorStore } from "./store";

function store(duration = 10, fps = 30): EditorStore {
  const s = new EditorStore();
  s.duration = duration;
  s.fps = fps;
  return s;
}

const preset = {
  id: "title-fade",
  label: "Title",
  category: "title",
  description: "",
  animation: "fade",
  defaultDuration: 3,
  defaultText: "x",
} satisfies PresetInfo;

describe("EditorStore playhead and playback", () => {
  it("clamps the playhead to the video and asks the player to seek", () => {
    const s = store(10);
    s.setPlayhead(99);
    expect(s.getState().playhead).toBe(10);
    s.setPlayhead(-3);
    expect(s.getState().playhead).toBe(0);
    s.setPlayhead(Number.NaN);
    expect(s.getState().playhead).toBe(0);
    expect(s.getState().seekToken).toBe(3);
  });

  it("playback reports do not ask for a seek", () => {
    const s = store(10);
    s.reportPlayhead(4);
    expect(s.getState()).toMatchObject({ playhead: 4, seekToken: 0 });
  });

  it("notifies subscribers only when something changed", () => {
    const s = store();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.setZoom(80); // unchanged default
    expect(fn).not.toHaveBeenCalled();
    s.setZoom(120);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    s.setZoom(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cannot play an empty timeline", () => {
    const s = store(0);
    s.setPlaying(true);
    expect(s.getState().playing).toBe(false);
  });

  it("starting playback at the end restarts from zero", () => {
    const s = store(10);
    s.reportPlayhead(10);
    s.setPlaying(true);
    expect(s.getState()).toMatchObject({ playing: true, playhead: 0 });
    expect(s.getState().seekToken).toBe(1);
  });

  it("starting playback mid-timeline keeps the position", () => {
    const s = store(10);
    s.reportPlayhead(4);
    s.togglePlay();
    expect(s.getState()).toMatchObject({ playing: true, playhead: 4 });
    s.togglePlay();
    expect(s.getState().playing).toBe(false);
  });

  it("L cycles 1x, 2x, 4x and back; K stops and resets the speed", () => {
    const s = store();
    s.playForward();
    expect(s.getState()).toMatchObject({ playing: true, rate: 1 });
    s.playForward();
    expect(s.getState().rate).toBe(2);
    s.playForward();
    expect(s.getState().rate).toBe(4);
    s.playForward();
    expect(s.getState().rate).toBe(1);
    s.setPlaying(false);
    expect(s.getState()).toMatchObject({ playing: false, rate: 1 });
  });

  it("J plays in reverse, faster on repeat, and L takes over again", () => {
    const s = store();
    s.reportPlayhead(5);
    s.playReverse();
    expect(s.getState()).toMatchObject({ playing: true, rate: -1 });
    s.playReverse();
    expect(s.getState().rate).toBe(-2);
    s.playForward();
    expect(s.getState().rate).toBe(1);
  });

  it("steps whole frames, pausing playback", () => {
    const s = store(10, 30);
    s.reportPlayhead(1);
    s.setPlaying(true);
    s.stepFrames(1);
    expect(s.getState().playing).toBe(false);
    expect(s.getState().playhead).toBeCloseTo(1 + 1 / 30, 6);
    s.stepFrames(-2);
    expect(s.getState().playhead).toBeCloseTo(1 - 1 / 30, 6);
  });

  it("does not step below zero or past the end", () => {
    const s = store(1, 30);
    s.stepFrames(-5);
    expect(s.getState().playhead).toBe(0);
    s.setPlayhead(1);
    s.stepFrames(5);
    expect(s.getState().playhead).toBe(1);
  });
});

describe("EditorStore selection, zoom and view", () => {
  it("selects and clears, ignoring an identical selection", () => {
    const s = store();
    const fn = vi.fn();
    s.subscribe(fn);
    s.select({ kind: "clip", id: "c1" });
    s.select({ kind: "clip", id: "c1" });
    expect(fn).toHaveBeenCalledTimes(1);
    s.select(null);
    expect(s.getState().selection).toBeNull();
  });

  it("clamps zoom and zooms by a factor", () => {
    const s = store();
    s.setZoom(1e9);
    expect(s.getState().zoom).toBeLessThanOrEqual(2400);
    s.setZoom(100);
    s.zoomBy(2);
    expect(s.getState().zoom).toBe(200);
  });

  it("fits the zoom through the registered timeline viewport", () => {
    const s = store(10);
    const scrollTo = vi.fn();
    s.viewport = { trackWidth: () => 840, scrollTo };
    s.zoomToFit();
    expect(s.getState().zoom).toBe(80);
    expect(scrollTo).toHaveBeenCalledWith(0);
    s.viewport = null;
    s.zoomToFit(); // no timeline: harmless
  });
});

describe("EditorStore preset drag and drop", () => {
  it("drops onto a registered target at the hover time", () => {
    const s = store();
    const drop = vi.fn();
    s.registerDropTarget({ hitTest: (x) => (x > 100 ? x / 100 : null), drop });
    s.beginPresetDrag(preset, 50, 10);
    expect(s.getState().presetDrag?.hoverTime).toBeNull();
    s.movePresetDrag(250, 10);
    expect(s.getState().presetDrag?.hoverTime).toBe(2.5);
    s.endPresetDrag();
    expect(drop).toHaveBeenCalledWith(preset, 2.5);
    expect(s.getState().presetDrag).toBeNull();
  });

  it("does nothing when released away from the target or cancelled", () => {
    const s = store();
    const drop = vi.fn();
    s.registerDropTarget({ hitTest: () => null, drop });
    s.beginPresetDrag(preset, 0, 0);
    s.endPresetDrag();
    s.beginPresetDrag(preset, 0, 0);
    s.cancelPresetDrag();
    expect(drop).not.toHaveBeenCalled();
  });

  it("unregisters its drop target", () => {
    const s = store();
    const drop = vi.fn();
    const off = s.registerDropTarget({ hitTest: () => 1, drop });
    off();
    s.beginPresetDrag(preset, 0, 0);
    expect(s.getState().presetDrag?.hoverTime).toBeNull();
  });
});
