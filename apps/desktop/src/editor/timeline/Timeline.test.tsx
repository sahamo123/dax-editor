// Component tests for the timeline: rendering, selection, every drag gesture (previewed live, then sent through
// run()), virtualisation, the optimistic hold, errors, and preset drops. Geometry is jsdom's (all zeros), so tests
// drive gestures with pointer coordinates and rely on the default zoom of 80 px per second.

import type { Clip } from "@dax/core";
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../context";
import { PresetsPanel } from "../presets/PresetsPanel";
import type { EditorStore } from "../store";
import {
  clip,
  defaultProject,
  makeApi,
  makeProject,
  makeState,
  overlay,
  renderEditor,
} from "../test-utils";
import { Timeline } from "./Timeline";

const Z = 80; // default zoom, pixels per second

let store: EditorStore | null = null;
function Grab() {
  store = useEditorStore();
  return null;
}
const ui = (): ReactElement => (
  <>
    <Grab />
    <Timeline />
  </>
);

const pointer = (
  type: "pointerDown" | "pointerMove" | "pointerUp",
  target: Element | Window,
  x: number,
  y = 0,
) => fireEvent[type](target, { clientX: x, clientY: y, pointerId: 1, button: 0 });

/** Press on `el`, move to x + dx in a few steps, and (optionally) release. */
function drag(
  el: Element,
  dx: number,
  opts: { release?: boolean; x?: number; y?: number; dy?: number } = {},
) {
  const x = opts.x ?? 300;
  const y = opts.y ?? 50;
  pointer("pointerDown", el, x, y);
  for (const f of [0.25, 0.5, 1])
    pointer("pointerMove", window, x + dx * f, y + (opts.dy ?? 0) * f);
  if (opts.release !== false) pointer("pointerUp", window, x + dx, y + (opts.dy ?? 0));
}

const clipEl = (id: string) => {
  const el = document.querySelector(`[data-clip-id="${id}"]`);
  if (!el) throw new Error(`no clip ${id}`);
  return el as HTMLElement;
};
const overlayEl = (id: string) => {
  const el = document.querySelector(`[data-overlay-id="${id}"][data-testid="overlay"]`);
  if (!el) throw new Error(`no overlay ${id}`);
  return el as HTMLElement;
};

beforeEach(() => {
  store = null;
  // jsdom reports zero-size layout; give the scroller a realistic width so "follow the playhead" behaves.
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1000);
});
afterEach(() => vi.restoreAllMocks());

describe("Timeline rendering", () => {
  it("shows every clip with its file name and duration, in order", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject())));
    const clips = screen.getAllByTestId("clip");
    expect(clips).toHaveLength(3);
    expect(clips.map((c) => c.getAttribute("data-clip-id"))).toEqual(["c1", "c2", "c3"]);
    expect(clips.map((c) => c.getAttribute("data-start"))).toEqual(["0.000", "4.000", "7.000"]);
    expect(within(clips[0] as HTMLElement).getByText("a.mp4")).toBeInTheDocument();
    expect(clips[0]).toHaveAttribute("aria-label", expect.stringContaining("4"));
  });

  it("sizes blocks by zoom", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject())));
    expect(clipEl("c1").style.width).toBe(`${4 * Z}px`);
    act(() => store?.setZoom(160));
    expect(clipEl("c1").style.width).toBe(`${4 * 160}px`);
  });

  it("shows a hint when there is nothing on the timeline", () => {
    renderEditor(ui(), makeApi(makeState(makeProject([]))));
    expect(screen.getByText(/Import a video/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("clip")).toHaveLength(0);
  });

  it("draws overlays on their own lanes, stacking ones that overlap", () => {
    const p = defaultProject([overlay("o1", 0, 3), overlay("o2", 1, 3), overlay("o3", 5, 1)]);
    renderEditor(ui(), makeApi(makeState(p)));
    expect(screen.getAllByTestId("overlay")).toHaveLength(3);
    const top = (id: string) => Number.parseFloat(overlayEl(id).style.top);
    expect(top("o1")).not.toBe(top("o2")); // overlapping: different rows
    expect(top("o1")).toBe(top("o3")); // free again: same row
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("T2")).toBeInTheDocument();
  });

  it("only renders blocks near the visible window (virtualised)", () => {
    const many: Clip[] = Array.from({ length: 400 }, (_, i) => clip(`k${i}`, "a", 0, 1));
    renderEditor(ui(), makeApi(makeState(makeProject(many))));
    const rendered = screen.getAllByTestId("clip").length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(60);
  });
});

describe("selection", () => {
  it("selects a clip on pointer down and shows the selected state", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject([overlay("o1", 0, 2)]))));
    pointer("pointerDown", clipEl("c2"), 300);
    pointer("pointerUp", window, 300);
    expect(store?.getState().selection).toEqual({ kind: "clip", id: "c2" });
    expect(clipEl("c2")).toHaveAttribute("aria-selected", "true");
    expect(clipEl("c1")).toHaveAttribute("aria-selected", "false");
    expect(clipEl("c2")).toHaveClass("is-selected");
  });

  it("selects an overlay, and clicking the empty lane clears the selection", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject([overlay("o1", 0, 2)]))));
    pointer("pointerDown", overlayEl("o1"), 100);
    pointer("pointerUp", window, 100);
    expect(overlayEl("o1")).toHaveAttribute("aria-selected", "true");
    const lane = document.querySelector(".dx-lane-video");
    if (!lane) throw new Error("no lane");
    pointer("pointerDown", lane, 600);
    expect(store?.getState().selection).toBeNull();
    expect(overlayEl("o1")).toHaveAttribute("aria-selected", "false");
  });

  it("a click without movement does not send any command", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    pointer("pointerDown", clipEl("c1"), 300);
    pointer("pointerUp", window, 300);
    expect(api.run).not.toHaveBeenCalled();
  });
});

describe("scrubbing", () => {
  it("clicking and dragging the ruler moves the playhead", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject())));
    const hit = screen.getByTestId("ruler-hit");
    // time origin is at x = 64 (the gutter): x 64 + 240 -> 3 s.
    pointer("pointerDown", hit, 64 + 3 * Z);
    expect(store?.getState().playhead).toBeCloseTo(3, 1);
    pointer("pointerMove", window, 64 + 5.5 * Z);
    expect(store?.getState().playhead).toBeCloseTo(5.5, 1);
    pointer("pointerUp", window, 64 + 5.5 * Z);
    expect(screen.getByTestId("playhead")).toHaveAttribute(
      "data-time",
      store?.getState().playhead.toFixed(3),
    );
  });

  it("snaps the playhead to a clip edge when within a few pixels", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject())));
    pointer("pointerDown", screen.getByTestId("ruler-hit"), 64 + 4 * Z + 3); // 3 px past the 4 s cut
    expect(store?.getState().playhead).toBe(4);
    pointer("pointerUp", window, 0);
  });

  it("does not snap when snapping is off", () => {
    renderEditor(ui(), makeApi(makeState(defaultProject())));
    act(() => store?.setSnapping(false));
    pointer("pointerDown", screen.getByTestId("ruler-hit"), 64 + 4 * Z + 3);
    expect(store?.getState().playhead).toBeCloseTo(4 + 3 / Z, 3);
    pointer("pointerUp", window, 0);
  });
});

describe("clip gestures", () => {
  it("drag-reorder: previews a drop slot, then sends move_clip with the new index", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(clipEl("c1").querySelector(".dx-clip-media") as Element, 5 * Z, { release: false });
    expect(document.querySelector(".dx-slot")).toBeInTheDocument();
    // c2 slid left to make room (it now starts at 0) while c1 follows the pointer.
    expect(clipEl("c2").dataset.start).toBe("0.000");
    expect(clipEl("c1")).toHaveClass("is-dragging");
    pointer("pointerUp", window, 300 + 5 * Z);
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(api.run).toHaveBeenCalledWith("move_clip", { clipId: "c1", index: 1 });
  });

  it("holds the dropped order on screen until the server state arrives", () => {
    const api = makeApi(makeState(defaultProject()), () => new Promise(() => {}));
    renderEditor(ui(), api);
    drag(clipEl("c1"), 5 * Z);
    const order = screen.getAllByTestId("clip").map((c) => c.getAttribute("data-clip-id"));
    expect(order).toEqual(["c2", "c1", "c3"]);
    expect(clipEl("c2").dataset.start).toBe("0.000");
    expect(clipEl("c1").dataset.start).toBe("3.000");
  });

  it("drops the held order if the command fails, and shows why", async () => {
    const api = makeApi(makeState(defaultProject()), async () => ({ ok: false, error: "Nope" }));
    renderEditor(ui(), api);
    drag(clipEl("c1"), 5 * Z);
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(clipEl("c1").dataset.start).toBe("0.000");
  });

  it("dropping a clip back where it was sends nothing", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(clipEl("c2"), 30);
    expect(api.run).not.toHaveBeenCalled();
  });

  it("Escape cancels a drag", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(clipEl("c1"), 5 * Z, { release: false });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".dx-slot")).not.toBeInTheDocument();
    pointer("pointerUp", window, 700);
    expect(api.run).not.toHaveBeenCalled();
  });

  it("trim: dragging the end handle ripples later clips live, then sends trim_clip with out", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    const handle = within(clipEl("c2")).getByTestId("trim-end");
    drag(handle, -1 * Z, { release: false });
    // c2 is source 2..5 -> 2..4; c3 slides from 7 to 6, and c2 now lasts 2 s.
    expect(clipEl("c3").dataset.start).toBe("6.000");
    expect(clipEl("c2").dataset.duration).toBe("2.000");
    pointer("pointerUp", window, 300 - Z);
    expect(api.run).toHaveBeenCalledWith("trim_clip", { clipId: "c2", out: 4 });
  });

  it("trim: dragging the start handle sends the new in-point", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(within(clipEl("c2")).getByTestId("trim-start"), 1 * Z);
    expect(api.run).toHaveBeenCalledWith("trim_clip", { clipId: "c2", in: 3 });
  });

  it("trim: cannot be dragged past the end of the source file", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(within(clipEl("c3")).getByTestId("trim-end"), 20 * Z); // asset is 10 s long, c3 ends at source 6
    expect(api.run).toHaveBeenCalledWith("trim_clip", { clipId: "c3", out: 10 });
  });

  it("trim: snaps the end to the playhead and shows the snap guide", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    act(() => {
      store?.reportPlayhead(0);
      store?.setPlayhead(5.5);
    });
    // c1 ends at 4 s; drag its end 1.45 s right: 5.45 s, which is within 8 px (0.1 s) of the playhead at 5.5.
    drag(within(clipEl("c1")).getByTestId("trim-end"), 1.45 * Z, { release: false });
    expect(screen.getByTestId("snap-line")).toBeInTheDocument();
    pointer("pointerUp", window, 300 + 1.45 * Z);
    expect(api.run).toHaveBeenCalledWith("trim_clip", { clipId: "c1", out: 5.5 });
  });

  it("fade handle: drag sets fadeIn (and fadeOut from the right side)", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    drag(within(clipEl("c1")).getByTestId("fade-in-handle"), 1 * Z);
    expect(api.run).toHaveBeenLastCalledWith("set_fades", { clipId: "c1", fadeIn: 1 });
    drag(within(clipEl("c2")).getByTestId("fade-out-handle"), -0.5 * Z);
    expect(api.run).toHaveBeenLastCalledWith("set_fades", { clipId: "c2", fadeOut: 0.5 });
  });

  it("fade handle: cannot exceed the clip length minus the other fade", () => {
    const p = makeProject([clip("c1", "a", 0, 4, { fadeOut: 3 })]);
    const api = makeApi(makeState(p));
    renderEditor(ui(), api);
    drag(within(clipEl("c1")).getByTestId("fade-in-handle"), 10 * Z);
    expect(api.run).toHaveBeenCalledWith("set_fades", { clipId: "c1", fadeIn: 1 });
  });

  it("volume line: dragging down lowers the volume (set_volume), with a snap to 100%", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(ui(), api);
    const line = within(clipEl("c1")).getByTestId("volume-line");
    drag(line, 0, { dy: 17 });
    const call = api.run.mock.calls.at(-1);
    expect(call?.[0]).toBe("set_volume");
    expect(call?.[1].clipId).toBe("c1");
    expect(call?.[1].volume).toBeLessThan(0.9);
    // A tiny nudge stays at exactly 100% and sends nothing.
    api.run.mockClear();
    drag(line, 0, { dy: 0.5 });
    expect(api.run).not.toHaveBeenCalled();
  });
});

describe("overlay gestures", () => {
  const withOverlay = () => defaultProject([overlay("o1", 1, 2)]);

  it("drag moves the overlay (move_overlay) and never below zero", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(ui(), api);
    drag(overlayEl("o1"), 0.5 * Z);
    expect(api.run).toHaveBeenLastCalledWith("move_overlay", { overlayId: "o1", start: 1.5 });
    drag(overlayEl("o1"), -10 * Z);
    expect(api.run).toHaveBeenLastCalledWith("move_overlay", { overlayId: "o1", start: 0 });
  });

  it("snaps a moved overlay to a clip edge and shows the guide while dragging", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(ui(), api);
    // Overlay 1..3 moved by +0.97 s: its end (3.97 s) is within 0.1 s of the cut at 4 s.
    drag(overlayEl("o1"), 0.97 * Z, { release: false });
    expect(screen.getByTestId("snap-line")).toBeInTheDocument();
    pointer("pointerUp", window, 300 + 0.97 * Z);
    expect(api.run).toHaveBeenLastCalledWith("move_overlay", { overlayId: "o1", start: 2 });
  });

  it("resizing the right edge changes only the duration (update_overlay)", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(ui(), api);
    drag(within(overlayEl("o1")).getByTestId("overlay-trim-end"), 0.5 * Z);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", { overlayId: "o1", duration: 2.5 });
  });

  it("resizing the left edge changes start and duration, keeping the end", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(ui(), api);
    drag(within(overlayEl("o1")).getByTestId("overlay-trim-start"), 0.5 * Z);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", {
      overlayId: "o1",
      start: 1.5,
      duration: 1.5,
    });
  });

  it("will not shrink an overlay below the minimum length", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(ui(), api);
    drag(within(overlayEl("o1")).getByTestId("overlay-trim-end"), -10 * Z);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", { overlayId: "o1", duration: 0.2 });
  });

  it("shows the live position while dragging", () => {
    renderEditor(ui(), makeApi(makeState(withOverlay())));
    drag(overlayEl("o1"), 1 * Z, { release: false });
    expect(overlayEl("o1").dataset.start).toBe("2.000");
    expect(overlayEl("o1")).toHaveClass("is-dragging");
    pointer("pointerUp", window, 0);
  });
});

describe("dropping a preset", () => {
  it("adds the overlay at the drop time through add_overlay and selects it", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 400,
      width: 1000,
      height: 400,
      toJSON: () => ({}),
    });
    const api = makeApi(makeState(defaultProject()), async (name) =>
      name === "add_overlay"
        ? { ok: true, summary: "Added", data: { overlayId: "new1" } }
        : { ok: true, summary: "ok" },
    );
    renderEditor(
      <>
        <Grab />
        <PresetsPanel />
        <Timeline />
      </>,
      api,
    );
    const card = document.querySelector('[data-preset-id="title-pop"]') as Element;
    pointer("pointerDown", card, 900, 500);
    pointer("pointerMove", window, 800, 200); // starts the drag
    expect(screen.getByTestId("drag-ghost")).toBeInTheDocument();
    pointer("pointerMove", window, 64 + 2 * Z, 100); // over the timeline: time 2 s
    expect(screen.getByTestId("drop-ghost")).toBeInTheDocument();
    expect(store?.getState().presetDrag?.hoverTime).toBeCloseTo(2, 1);
    pointer("pointerUp", window, 64 + 2 * Z, 100);
    await act(async () => {});
    expect(api.run).toHaveBeenCalledWith("add_overlay", { preset: "title-pop", start: 2 });
    expect(store?.getState().selection).toEqual({ kind: "overlay", id: "new1" });
    expect(screen.queryByTestId("drag-ghost")).not.toBeInTheDocument();
  });

  it("does nothing when released away from the timeline", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 400,
      width: 1000,
      height: 400,
      toJSON: () => ({}),
    });
    const api = makeApi(makeState(defaultProject()));
    renderEditor(
      <>
        <PresetsPanel />
        <Timeline />
      </>,
      api,
    );
    const card = document.querySelector('[data-preset-id="title-pop"]') as Element;
    pointer("pointerDown", card, 900, 500);
    pointer("pointerMove", window, 1200, 600); // right of the timeline
    pointer("pointerUp", window, 1200, 600);
    await act(async () => {});
    expect(api.run).not.toHaveBeenCalled();
  });
});
