import { describe, expect, it, vi } from "vitest";
import { type EngineClip, type EngineHost, type MediaSlot, PlaybackEngine } from "./engine";

/** A stand-in for <video> with just enough browser behaviour: seeking events, play/pause, loading. */
class FakeMedia implements MediaSlot {
  private t = 0;
  private srcValue = "";
  paused = true;
  seeking = false;
  ended = false;
  readyState = 0;
  volume = 1;
  playbackRate = 1;
  playRejects: Error | null = null;
  private listeners = new Map<string, Set<() => void>>();

  get currentTime(): number {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    // Before metadata a browser just remembers the start position; afterwards it seeks.
    if (this.readyState > 0) this.seeking = true;
  }
  get src(): string {
    return this.srcValue;
  }
  set src(v: string) {
    this.srcValue = v;
    this.readyState = 0;
    this.seeking = false;
    this.t = 0;
  }
  play(): Promise<void> {
    if (this.playRejects) return Promise.reject(this.playRejects);
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  /** The file finished loading (the start position, possibly 0, is already in place). */
  finishLoad(): void {
    this.readyState = 4;
    this.emit("loadeddata");
  }
  /** The browser finished a seek. */
  finishSeek(): void {
    this.seeking = false;
    this.readyState = 4;
    this.emit("seeked");
  }
  /** Load (if needed) and finish whatever is pending, as a fast browser would. */
  settle(): void {
    if (this.readyState === 0) this.finishLoad();
    if (this.seeking) this.finishSeek();
  }
  /** Playback reached this media time (not a seek, so no `seeking` state). */
  jump(t: number): void {
    this.t = t;
  }
  /** Let `seconds` of media time pass if playing. */
  run(seconds: number): void {
    if (!this.paused) this.t += seconds * this.playbackRate;
  }
}

interface Harness {
  engine: PlaybackEngine;
  a: FakeMedia;
  b: FakeMedia;
  host: { [K in keyof EngineHost]: ReturnType<typeof vi.fn> };
  /** Active element's index as last reported to onVisual. */
  active(): 0 | 1;
  playhead(): number;
}

// Two distinct files: X (clips 1 and 3) and Y (clip 2). Clip 1: X 0..4 at 0; clip 2: Y 1..3 at 4; clip 3: X 6..8 at 6.
const clips = (extra: Partial<EngineClip>[] = []): EngineClip[] =>
  [
    {
      id: "c1",
      assetId: "x",
      url: "x.mp4",
      start: 0,
      in: 0,
      out: 4,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: "c2",
      assetId: "y",
      url: "y.mp4",
      start: 4,
      in: 1,
      out: 3,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: "c3",
      assetId: "x",
      url: "x.mp4",
      start: 6,
      in: 6,
      out: 8,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    },
  ].map((c, i) => ({ ...c, ...(extra[i] ?? {}) }));

function setup(list: EngineClip[] = clips()): Harness {
  const a = new FakeMedia();
  const b = new FakeMedia();
  const host = {
    onPlayhead: vi.fn(),
    onEnded: vi.fn(),
    onVisual: vi.fn(),
    onBlocked: vi.fn(),
    onBuffering: vi.fn(),
    onMediaError: vi.fn(),
  };
  const engine = new PlaybackEngine([a, b], host);
  engine.setClips(list, 0);
  return {
    engine,
    a,
    b,
    host,
    active: () => (host.onVisual.mock.calls.at(-1)?.[0] ?? 0) as 0 | 1,
    playhead: () => (host.onPlayhead.mock.calls.at(-1)?.[0] ?? 0) as number,
  };
}

/** Both elements finish loading/seeking, as they would within a few hundred milliseconds. */
const settleAll = (h: Harness) => {
  h.a.settle();
  h.b.settle();
};

describe("PlaybackEngine loading and seeking", () => {
  it("loads the current clip and seeks to its source time", () => {
    const h = setup();
    h.engine.seek(5); // 1 s into clip 2 -> source time 2
    const shown = h.active() === 0 ? h.a : h.b;
    expect(shown.src).toBe("y.mp4");
    expect(shown.currentTime).toBe(2);
    expect(h.host.onPlayhead).toHaveBeenLastCalledWith(5);
  });

  it("preloads the next clip into the other element, seeked to its in-point", () => {
    const h = setup();
    h.engine.seek(1);
    expect(h.a.src).toBe("x.mp4");
    expect(h.b.src).toBe("y.mp4");
    expect(h.b.currentTime).toBe(1);
    expect(h.b.paused).toBe(true);
    expect(h.b.volume).toBe(0);
  });

  it("does not preload a continuation of the same file (it just keeps playing)", () => {
    const list = clips([{}, {}, {}]);
    // Split clip: second half continues exactly where the first stopped.
    list[1] = { ...list[1], url: "x.mp4", assetId: "x", in: 4, out: 6 } as EngineClip;
    const h = setup(list);
    h.engine.seek(1);
    expect(h.b.src).toBe("");
  });

  it("coalesces rapid seeks while one is running: only the newest target is applied", () => {
    const h = setup();
    h.engine.seek(1);
    h.a.settle(); // loaded at 1
    h.engine.seek(2);
    expect(h.a.currentTime).toBe(2);
    h.engine.seek(2.5); // a seek is in flight
    h.engine.seek(3);
    expect(h.a.currentTime).toBe(2); // not touched yet
    h.a.finishSeek();
    expect(h.a.currentTime).toBe(3);
  });

  it("an element that starts at source time 0 becomes ready without any seek event", () => {
    // Regression: a freshly loaded file at its default position 0 never fires `seeked`.
    const h = setup();
    h.engine.seek(0);
    h.a.finishLoad();
    h.engine.setPlaying(true);
    expect(h.a.paused).toBe(false);
  });

  it("shows the fade level at the playhead while paused", () => {
    const list = clips([{ fadeIn: 2 }]);
    const h = setup(list);
    h.engine.seek(1);
    expect(h.host.onVisual).toHaveBeenLastCalledWith(0, 0.5);
    h.engine.seek(3);
    expect(h.host.onVisual).toHaveBeenLastCalledWith(0, 1);
  });

  it("an empty timeline shows nothing and does not throw", () => {
    const h = setup([]);
    h.engine.seek(3);
    h.engine.setPlaying(true);
    h.engine.tick(0);
    expect(h.host.onVisual).toHaveBeenLastCalledWith(0, 0);
  });
});

describe("PlaybackEngine playing", () => {
  it("starts playing the current element once it is ready and drives the playhead from its clock", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    expect(h.a.paused).toBe(false);
    h.a.run(0.5);
    h.engine.tick(100);
    expect(h.playhead()).toBeCloseTo(1.5);
  });

  it("waits for the seek to finish before playing after a jump while playing", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    h.engine.seek(3);
    expect(h.a.paused).toBe(true);
    h.engine.tick(10);
    expect(h.host.onBuffering).toHaveBeenLastCalledWith(true);
    h.a.finishSeek();
    expect(h.a.paused).toBe(false);
  });

  it("switches to the preloaded element at the cut and keeps going (gap-free)", () => {
    const h = setup();
    h.engine.seek(3.5);
    settleAll(h);
    h.engine.setPlaying(true);
    h.a.run(0.4);
    h.engine.tick(1);
    expect(h.active()).toBe(0);
    h.a.jump(3.99); // within one frame of the cut: the engine switches a frame early
    h.engine.tick(2);
    expect(h.active()).toBe(1);
    expect(h.b.paused).toBe(false);
    expect(h.a.paused).toBe(true);
    expect(h.playhead()).toBe(4);
    // Time now comes from the second element: source 1 -> timeline 4.
    h.b.run(0.25);
    h.engine.tick(3);
    expect(h.playhead()).toBeCloseTo(4.25);
    // And the first element has been re-armed for the third clip (file X at 6).
    expect(h.a.currentTime).toBe(6);
  });

  it("holds at the cut until the next clip is ready, then continues", () => {
    const h = setup();
    h.engine.seek(3.9);
    h.a.settle(); // b has not finished its seek
    h.engine.setPlaying(true);
    h.a.jump(3.995);
    h.engine.tick(1);
    expect(h.a.paused).toBe(true);
    expect(h.host.onBuffering).toHaveBeenLastCalledWith(true);
    expect(h.playhead()).toBe(4);
    h.b.settle();
    h.engine.tick(2);
    expect(h.b.paused).toBe(false);
    expect(h.host.onBuffering).toHaveBeenLastCalledWith(false);
  });

  it("continues through a split of the same file without switching elements", () => {
    const list = clips();
    list[1] = { ...list[1], url: "x.mp4", assetId: "x", in: 4, out: 6 } as EngineClip;
    const h = setup(list);
    h.engine.seek(3.5);
    settleAll(h);
    h.engine.setPlaying(true);
    h.a.jump(3.995);
    h.engine.tick(1);
    expect(h.active()).toBe(0);
    expect(h.a.paused).toBe(false);
    h.a.run(0.5);
    h.engine.tick(2);
    expect(h.playhead()).toBeCloseTo(4.5 + 0.0, 0);
  });

  it("stops at the end of the last clip and reports it", () => {
    const h = setup();
    h.engine.seek(7.5);
    settleAll(h);
    h.engine.setPlaying(true);
    h.a.jump(7.995);
    h.engine.tick(1);
    expect(h.host.onEnded).toHaveBeenCalledTimes(1);
    expect(h.playhead()).toBe(8);
    expect(h.a.paused).toBe(true);
    expect(h.engine.playing).toBe(false);
  });

  it("loops back to the start when loop is on", () => {
    const h = setup();
    h.engine.setLoop(true);
    h.engine.seek(7.5);
    settleAll(h);
    h.engine.setPlaying(true);
    h.a.jump(7.995);
    h.engine.tick(1);
    expect(h.host.onEnded).not.toHaveBeenCalled();
    expect(h.engine.playing).toBe(true);
    expect(h.playhead()).toBe(0);
  });

  it("reports blocked autoplay instead of pretending to play", async () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.a.playRejects = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    h.engine.setPlaying(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.host.onBlocked).toHaveBeenLastCalledWith(true);
    expect(h.engine.playing).toBe(false);
  });

  it("ignores a play() interrupted by a newer load (AbortError)", async () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.a.playRejects = Object.assign(new Error("interrupted"), { name: "AbortError" });
    h.engine.setPlaying(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.host.onBlocked).not.toHaveBeenCalledWith(true);
    expect(h.engine.playing).toBe(true);
  });

  it("applies clip volume, fades and mute to the playing element", () => {
    const list = clips([{ volume: 0.5, fadeOut: 2 }]);
    const h = setup(list);
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    h.engine.tick(1);
    expect(h.a.volume).toBe(0.5);
    h.a.jump(3); // 1 s into a 2 s fade-out -> half
    h.engine.tick(2);
    expect(h.a.volume).toBeCloseTo(0.25);
    expect(h.host.onVisual).toHaveBeenLastCalledWith(0, expect.closeTo(0.5, 5));
    h.engine.setMuted(true);
    expect(h.a.volume).toBe(0);
  });

  it("clamps gain above 1 (an element cannot be louder than 1)", () => {
    const h = setup(clips([{ volume: 3 }]));
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    h.engine.tick(1);
    expect(h.a.volume).toBe(1);
  });

  it("fast forward sets the playback rate on the element", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setRate(2);
    h.engine.setPlaying(true);
    expect(h.a.playbackRate).toBe(2);
  });

  it("pausing stops both elements", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    h.engine.setPlaying(false);
    expect(h.a.paused).toBe(true);
    expect(h.b.paused).toBe(true);
  });
});

describe("PlaybackEngine reverse and edits", () => {
  it("steps backwards by wall-clock time and stops at the start", () => {
    const h = setup();
    h.engine.seek(2);
    settleAll(h);
    h.engine.setRate(-1);
    h.engine.setPlaying(true);
    h.engine.tick(0);
    h.engine.tick(500);
    expect(h.playhead()).toBeCloseTo(1.5);
    expect(h.a.paused).toBe(true);
    h.engine.tick(3000);
    expect(h.playhead()).toBe(0);
    expect(h.host.onEnded).toHaveBeenCalled();
  });

  it("keeps playing when the clips change but the position is still right", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    const before = h.a.currentTime;
    // A state push with identical clips (for example a job update) must not disturb playback.
    h.engine.setClips(clips(), 1);
    expect(h.a.paused).toBe(false);
    expect(h.a.currentTime).toBe(before);
  });

  it("re-seeks when the clip under the playhead changes source position", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    const list = clips([{ in: 2, out: 6 }]); // trimmed start: playhead 1 now means source 3
    h.engine.setClips(list, 1);
    expect(h.a.currentTime).toBe(3);
  });

  it("reload() reloads the files (for proxies that were still being made)", () => {
    const h = setup();
    h.engine.seek(1);
    h.a.src = "";
    h.engine.reload();
    expect(h.a.src).toBe("x.mp4");
  });

  it("reports media errors by asset", () => {
    const h = setup();
    h.engine.seek(1);
    h.a.emit("error");
    expect(h.host.onMediaError).toHaveBeenCalledWith("x");
  });

  it("dispose pauses and detaches", () => {
    const h = setup();
    h.engine.seek(1);
    settleAll(h);
    h.engine.setPlaying(true);
    h.engine.dispose();
    expect(h.a.paused).toBe(true);
    h.a.emit("error");
    expect(h.host.onMediaError).not.toHaveBeenCalled();
  });
});
