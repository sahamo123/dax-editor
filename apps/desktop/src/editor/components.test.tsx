// Component tests for the toolbar, shortcuts, presets panel, inspector, preview and the provider hooks,
// using a fake EditorApi that records every command.

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorProvider, useEditor } from "./context";
import { Inspector } from "./inspector/Inspector";
import { groupPresets, PresetsPanel } from "./presets/PresetsPanel";
import { partStyle, rgba } from "./preview/OverlayLayer";
import { buildEngineClips, PreviewPane } from "./preview/PreviewPane";
import { useEditorShortcuts } from "./shortcuts";
import {
  clip,
  defaultProject,
  makeApi,
  makeProject,
  makeState,
  overlay,
  PRESETS,
  renderEditor,
} from "./test-utils";
import { EditorToolbar } from "./toolbar/EditorToolbar";
import type { EditorApi, EditorUi } from "./types";

let ed: (EditorApi & EditorUi) | null = null;
/** Exposes useEditor() to the test and binds the keyboard shortcuts, like the app shell would. */
function Probe() {
  ed = useEditor();
  useEditorShortcuts();
  return null;
}
const editor = (): EditorApi & EditorUi => {
  if (!ed) throw new Error("probe not rendered");
  return ed;
};

beforeEach(() => {
  ed = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const withProbe = (el: ReactElement): ReactElement => (
  <>
    <Probe />
    {el}
  </>
);

describe("useEditor / EditorProvider", () => {
  it("exposes the api plus the editor UI state", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(<Probe />, api);
    const e = editor();
    expect(e.state).toBe(api.state);
    expect(e.serverUrl).toBe("http://server.test");
    expect(e.token).toBe("tok");
    expect(e.playhead).toBe(0);
    expect(e.playing).toBe(false);
    expect(e.selection).toBeNull();
    expect(e.zoom).toBe(80);
  });

  it("updates when UI state changes", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    act(() => editor().setPlayhead(5));
    expect(editor().playhead).toBe(5);
    act(() => editor().select({ kind: "clip", id: "c1" }));
    expect(editor().selection).toEqual({ kind: "clip", id: "c1" });
    act(() => editor().setZoom(200));
    expect(editor().zoom).toBe(200);
    act(() => editor().setPlaying(true));
    expect(editor().playing).toBe(true);
  });

  it("clamps the playhead to the video length", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    act(() => editor().setPlayhead(99));
    expect(editor().playhead).toBe(12);
  });

  it("drops a selection whose item has disappeared, and pulls the playhead back inside a shorter video", () => {
    const api = makeApi(makeState(defaultProject()));
    const r = renderEditor(<Probe />, api);
    act(() => {
      editor().select({ kind: "clip", id: "c3" });
      editor().setPlayhead(11);
    });
    r.setApi(makeApi(makeState(makeProject([clip("c1", "a", 0, 4), clip("c2", "a", 2, 5)]))));
    expect(editor().selection).toBeNull();
    expect(editor().playhead).toBe(7);
  });

  it("throws a clear error when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/EditorProvider/);
    spy.mockRestore();
  });

  it("runs a silent clock when playing with no preview mounted", () => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb) =>
        setTimeout(() => {
          clock += 16;
          cb(clock);
        }, 16) as unknown as number,
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    act(() => editor().setPlaying(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(editor().playhead).toBeGreaterThan(0.5);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(editor().playing).toBe(false);
    expect(editor().playhead).toBe(12);
  });
});

describe("EditorToolbar", () => {
  it("enables undo/redo from the server state and runs the commands", () => {
    const api = makeApi(makeState(defaultProject(), { canUndo: true, canRedo: false }));
    renderEditor(<EditorToolbar />, api);
    expect(screen.getByTestId("undo")).toBeEnabled();
    expect(screen.getByTestId("redo")).toBeDisabled();
    fireEvent.click(screen.getByTestId("undo"));
    expect(api.run).toHaveBeenCalledWith("undo", undefined);
  });

  it("splits at the playhead only when it is strictly inside a clip", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(withProbe(<EditorToolbar />), api);
    expect(screen.getByTestId("split")).toBeDisabled(); // at 0: on a clip edge
    act(() => editor().setPlayhead(4)); // exactly on the cut
    expect(screen.getByTestId("split")).toBeDisabled();
    act(() => editor().setPlayhead(2));
    expect(screen.getByTestId("split")).toBeEnabled();
    fireEvent.click(screen.getByTestId("split"));
    expect(api.run).toHaveBeenCalledWith("split", { at: 2 });
  });

  it("deletes the selected clip with remove_clip and the selected overlay with remove_overlay", async () => {
    const api = makeApi(makeState(defaultProject([overlay("o1", 0, 2)])));
    renderEditor(withProbe(<EditorToolbar />), api);
    expect(screen.getByTestId("delete")).toBeDisabled();
    act(() => editor().select({ kind: "clip", id: "c2" }));
    fireEvent.click(screen.getByTestId("delete"));
    await act(async () => {});
    expect(api.run).toHaveBeenCalledWith("remove_clip", { clipId: "c2" });
    expect(editor().selection).toBeNull();
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    fireEvent.click(screen.getByTestId("delete"));
    await act(async () => {});
    expect(api.run).toHaveBeenCalledWith("remove_overlay", { overlayId: "o1" });
  });

  it("play toggles playback and the label follows", () => {
    renderEditor(withProbe(<EditorToolbar />), makeApi(makeState(defaultProject())));
    const play = screen.getByTestId("play");
    expect(play).toHaveAttribute("aria-label", "Play");
    fireEvent.click(play);
    expect(editor().playing).toBe(true);
    expect(play).toHaveAttribute("aria-label", "Pause");
    fireEvent.click(play);
    expect(editor().playing).toBe(false);
  });

  it("disables transport on an empty timeline", () => {
    renderEditor(<EditorToolbar />, makeApi(makeState(makeProject([]))));
    expect(screen.getByTestId("play")).toBeDisabled();
  });

  it("zoom buttons, slider and fit change the zoom", () => {
    renderEditor(withProbe(<EditorToolbar />), makeApi(makeState(defaultProject())));
    fireEvent.click(screen.getByTestId("zoom-in"));
    expect(editor().zoom).toBeGreaterThan(80);
    fireEvent.click(screen.getByTestId("zoom-out"));
    fireEvent.click(screen.getByTestId("zoom-out"));
    expect(editor().zoom).toBeLessThan(80);
    fireEvent.change(screen.getByTestId("zoom-slider"), {
      target: { value: String(Math.log(500)) },
    });
    expect(editor().zoom).toBeCloseTo(500, 0);
  });

  it("shows the playhead and total time as timecode, loop/snap/mute as toggles", () => {
    renderEditor(withProbe(<EditorToolbar />), makeApi(makeState(defaultProject())));
    expect(screen.getByTestId("timecode")).toHaveTextContent("00:00:00 / 00:12:00");
    act(() => editor().setPlayhead(1.5));
    expect(screen.getByTestId("timecode")).toHaveTextContent("00:01:15 / 00:12:00");
    for (const id of ["loop", "snapping", "mute"]) {
      const before = screen.getByTestId(id).getAttribute("aria-pressed");
      fireEvent.click(screen.getByTestId(id));
      expect(screen.getByTestId(id).getAttribute("aria-pressed")).not.toBe(before);
    }
  });
});

describe("useEditorShortcuts", () => {
  const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
    fireEvent.keyDown(target, { key: k, ...init });

  it("Space and K play/pause; L and J set direction and speed", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    key(" ");
    expect(editor().playing).toBe(true);
    key(" ");
    expect(editor().playing).toBe(false);
    key("l");
    expect(editor().playing).toBe(true);
    key("k");
    expect(editor().playing).toBe(false);
    key("j");
    expect(editor().playing).toBe(true);
  });

  it("S splits at the playhead", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(<Probe />, api);
    act(() => editor().setPlayhead(2.5));
    key("s");
    expect(api.run).toHaveBeenCalledWith("split", { at: 2.5 });
  });

  it("Delete and Backspace ripple-delete the selection", async () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(<Probe />, api);
    key("Delete"); // nothing selected: no command
    expect(api.run).not.toHaveBeenCalled();
    act(() => editor().select({ kind: "clip", id: "c1" }));
    key("Backspace");
    await act(async () => {});
    expect(api.run).toHaveBeenCalledWith("remove_clip", { clipId: "c1" });
  });

  it("Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z and Ctrl+Y redo, only when available", () => {
    const api = makeApi(makeState(defaultProject(), { canUndo: true, canRedo: true }));
    renderEditor(<Probe />, api);
    key("z", { ctrlKey: true });
    expect(api.run).toHaveBeenLastCalledWith("undo", undefined);
    key("z", { metaKey: true });
    expect(api.run).toHaveBeenCalledTimes(2);
    key("z", { ctrlKey: true, shiftKey: true });
    expect(api.run).toHaveBeenLastCalledWith("redo", undefined);
    key("y", { ctrlKey: true });
    expect(api.run).toHaveBeenCalledTimes(4);

    const none = makeApi(makeState(defaultProject()));
    const r = renderEditor(<Probe />, none);
    key("z", { ctrlKey: true });
    expect(none.run).not.toHaveBeenCalled();
    r.unmount();
  });

  it("arrows step a frame, Shift+arrows a second, Home/End jump", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    act(() => editor().setPlayhead(5));
    key("ArrowRight");
    expect(editor().playhead).toBeCloseTo(5 + 1 / 30, 5);
    key("ArrowLeft");
    key("ArrowLeft");
    expect(editor().playhead).toBeCloseTo(5 - 1 / 30, 5);
    key("ArrowRight", { shiftKey: true });
    expect(editor().playhead).toBeCloseTo(6 - 1 / 30, 5);
    key("Home");
    expect(editor().playhead).toBe(0);
    key("End");
    expect(editor().playhead).toBe(12);
  });

  it("+ and - zoom, Shift+Z fits, Escape clears the selection", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    key("=");
    expect(editor().zoom).toBeGreaterThan(80);
    key("-");
    key("-");
    expect(editor().zoom).toBeLessThan(80);
    act(() => editor().select({ kind: "clip", id: "c1" }));
    key("Escape");
    expect(editor().selection).toBeNull();
  });

  it("leaves keys alone while typing in a field", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(
      <>
        <Probe />
        <input data-testid="field" />
        <button type="button" data-testid="btn">
          b
        </button>
      </>,
      api,
    );
    const input = screen.getByTestId("field");
    key(" ", {}, input);
    key("s", {}, input);
    key("Delete", {}, input);
    expect(editor().playing).toBe(false);
    expect(api.run).not.toHaveBeenCalled();
    // A focused button keeps Space for itself (it clicks), but other keys still work.
    key(" ", {}, screen.getByTestId("btn"));
    expect(editor().playing).toBe(false);
    key("l", {}, screen.getByTestId("btn"));
    expect(editor().playing).toBe(true);
  });

  it("ignores unknown keys and keys with Alt held", () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(<Probe />, api);
    key("q");
    key("s", { altKey: true });
    expect(api.run).not.toHaveBeenCalled();
  });

  it("prevents the browser default for keys it handles", () => {
    renderEditor(<Probe />, makeApi(makeState(defaultProject())));
    const notPrevented = fireEvent.keyDown(window, { key: " " });
    expect(notPrevented).toBe(false);
  });
});

describe("PresetsPanel", () => {
  it("groups presets by category in a fixed order with readable headings", () => {
    const g = groupPresets([...PRESETS].reverse());
    expect(g.map((x) => x.category)).toEqual(["title", "lower-third", "caption"]);
    expect(g.map((x) => x.label)).toEqual(["Titles", "Lower thirds", "Captions"]);
    expect(groupPresets([{ ...PRESETS[0], category: "x-custom-thing" } as never])[0]?.label).toBe(
      "X custom thing",
    );
  });

  it("lists every preset with a live chip", () => {
    renderEditor(<PresetsPanel />, makeApi(makeState(defaultProject())));
    expect(screen.getAllByTestId("preset")).toHaveLength(PRESETS.length);
    expect(screen.getAllByTestId("preset-chip")).toHaveLength(PRESETS.length);
    expect(screen.getByText("Lower thirds")).toBeInTheDocument();
  });

  it("clicking a preset adds it at the playhead and selects the new overlay", async () => {
    const api = makeApi(makeState(defaultProject()), async () => ({
      ok: true,
      summary: "Added",
      data: { overlayId: "new1" },
    }));
    renderEditor(withProbe(<PresetsPanel />), api);
    act(() => editor().setPlayhead(3.25));
    const card = document.querySelector('[data-preset-id="title-fade"]') as Element;
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10, pointerId: 1 });
    await act(async () => {});
    expect(api.run).toHaveBeenCalledWith("add_overlay", { preset: "title-fade", start: 3.25 });
    expect(editor().selection).toEqual({ kind: "overlay", id: "new1" });
  });

  it("keyboard activation adds it too (once)", async () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(<PresetsPanel />, api);
    fireEvent.click(document.querySelector('[data-preset-id="title-pop"]') as Element, {
      detail: 0,
    });
    await act(async () => {});
    expect(api.run).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('[data-preset-id="title-pop"]') as Element, {
      detail: 1,
    }); // pointer click: handled by the drag session
    expect(api.run).toHaveBeenCalledTimes(1);
  });

  it("says so when there are no presets", () => {
    renderEditor(<PresetsPanel />, makeApi(makeState(defaultProject(), { presets: [] })));
    expect(screen.getByText(/No presets/)).toBeInTheDocument();
  });
});

describe("Inspector", () => {
  const withOverlay = () => defaultProject([overlay("o1", 1, 3, { subtitle: "Role" })]);

  it("asks for a selection when there is none", () => {
    renderEditor(<Inspector />, makeApi(makeState(withOverlay())));
    expect(screen.getByText(/Select a clip or a text overlay/)).toBeInTheDocument();
  });

  it("shows the selected overlay's fields", () => {
    renderEditor(withProbe(<Inspector />), makeApi(makeState(withOverlay())));
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    expect(screen.getByTestId("overlay-text")).toHaveValue("Overlay o1");
    expect(screen.getByTestId("overlay-subtitle")).toHaveValue("Role");
    expect(screen.getByTestId("overlay-animation")).toHaveValue("fade");
    expect(screen.getByTestId("overlay-size")).toHaveValue(96);
    expect(screen.getByTestId("overlay-start")).toHaveValue(1);
    expect(screen.getByTestId("overlay-duration")).toHaveValue(3);
    expect(screen.getByTestId("position-center")).toHaveAttribute("aria-pressed", "true");
  });

  it("debounces text edits into a single update_overlay", async () => {
    vi.useFakeTimers();
    const api = makeApi(makeState(withOverlay()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    const text = screen.getByTestId("overlay-text");
    fireEvent.change(text, { target: { value: "H" } });
    fireEvent.change(text, { target: { value: "He" } });
    fireEvent.change(text, { target: { value: "Hel" } });
    expect(api.run).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(api.run).toHaveBeenCalledWith("update_overlay", { overlayId: "o1", text: "Hel" });
  });

  it("blur sends a pending edit immediately", () => {
    vi.useFakeTimers();
    const api = makeApi(makeState(withOverlay()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    const text = screen.getByTestId("overlay-text");
    fireEvent.change(text, { target: { value: "Quick" } });
    fireEvent.blur(text);
    expect(api.run).toHaveBeenCalledWith("update_overlay", { overlayId: "o1", text: "Quick" });
  });

  it("flushes a pending edit to the right overlay when the selection changes", () => {
    vi.useFakeTimers();
    const p = defaultProject([overlay("o1", 0, 2), overlay("o2", 3, 2)]);
    const api = makeApi(makeState(p));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    fireEvent.change(screen.getByTestId("overlay-text"), { target: { value: "Changed" } });
    act(() => editor().select({ kind: "overlay", id: "o2" }));
    expect(api.run).toHaveBeenCalledWith("update_overlay", { overlayId: "o1", text: "Changed" });
    expect(screen.getByTestId("overlay-text")).toHaveValue("Overlay o2");
  });

  it("does not send empty text and says why", () => {
    vi.useFakeTimers();
    const api = makeApi(makeState(withOverlay()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    const text = screen.getByTestId("overlay-text");
    fireEvent.change(text, { target: { value: "  " } });
    fireEvent.blur(text);
    expect(api.run).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be empty/)).toBeInTheDocument();
  });

  it("clearing the second line sends null", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    const sub = screen.getByTestId("overlay-subtitle");
    fireEvent.change(sub, { target: { value: "" } });
    fireEvent.blur(sub);
    expect(api.run).toHaveBeenCalledWith("update_overlay", { overlayId: "o1", subtitle: null });
  });

  it("animation, position, colour, size and timing go through update_overlay", () => {
    const api = makeApi(makeState(withOverlay()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    fireEvent.change(screen.getByTestId("overlay-animation"), { target: { value: "pop" } });
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", {
      overlayId: "o1",
      animation: "pop",
    });
    fireEvent.click(screen.getByTestId("position-bottom"));
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", {
      overlayId: "o1",
      position: "bottom",
    });
    const size = screen.getByTestId("overlay-size");
    fireEvent.change(size, { target: { value: "120" } });
    fireEvent.blur(size);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", { overlayId: "o1", fontSize: 120 });
    const dur = screen.getByTestId("overlay-duration");
    fireEvent.change(dur, { target: { value: "0.05" } }); // below the minimum: clamped
    fireEvent.blur(dur);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", { overlayId: "o1", duration: 0.2 });
    const start = screen.getByTestId("overlay-start");
    fireEvent.change(start, { target: { value: "2.5" } });
    fireEvent.keyDown(start, { key: "Enter" });
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", { overlayId: "o1", start: 2.5 });
    const color = screen.getByTestId("overlay-color");
    fireEvent.change(color, { target: { value: "#ff0000" } });
    fireEvent.blur(color);
    expect(api.run).toHaveBeenLastCalledWith("update_overlay", {
      overlayId: "o1",
      color: "#ff0000",
    });
  });

  it("snaps a field back if the server refuses the value", async () => {
    const api = makeApi(makeState(withOverlay()), async () => ({ ok: false, error: "bad" }));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "overlay", id: "o1" }));
    const size = screen.getByTestId("overlay-size");
    fireEvent.change(size, { target: { value: "300" } });
    fireEvent.blur(size);
    await act(async () => {});
    expect(screen.getByTestId("overlay-size")).toHaveValue(96);
  });

  it("clip properties: volume as a percentage, fades in seconds, split and delete buttons", async () => {
    const api = makeApi(makeState(defaultProject()));
    renderEditor(withProbe(<Inspector />), api);
    act(() => editor().select({ kind: "clip", id: "c1" }));
    expect(screen.getByTestId("inspector-clip")).toBeInTheDocument();
    expect(screen.getByText("a.mp4")).toBeInTheDocument();
    const vol = screen.getByTestId("clip-volume");
    expect(vol).toHaveValue(100);
    fireEvent.change(vol, { target: { value: "50" } });
    fireEvent.blur(vol);
    expect(api.run).toHaveBeenLastCalledWith("set_volume", { clipId: "c1", volume: 0.5 });
    const fo = screen.getByTestId("clip-fade-out");
    fireEvent.change(fo, { target: { value: "1.5" } });
    fireEvent.blur(fo);
    expect(api.run).toHaveBeenLastCalledWith("set_fades", { clipId: "c1", fadeOut: 1.5 });
    act(() => editor().setPlayhead(2));
    fireEvent.click(screen.getByText("Split at playhead"));
    expect(api.run).toHaveBeenLastCalledWith("split", { at: 2 });
    fireEvent.click(screen.getByText("Delete clip"));
    await act(async () => {});
    expect(api.run).toHaveBeenLastCalledWith("remove_clip", { clipId: "c1" });
  });
});

describe("PreviewPane and overlay drawing", () => {
  it("builds engine clips with proxy URLs, and plays unknown assets as black", () => {
    const p = makeProject([clip("c1", "a", 0, 4), clip("c2", "ghost", 0, 2)]);
    const clips = buildEngineClips(p, (id) => `http://x/${id}/proxy.mp4`);
    expect(clips[0]).toMatchObject({
      id: "c1",
      url: "http://x/a/proxy.mp4",
      start: 0,
      in: 0,
      out: 4,
    });
    expect(clips[1]).toMatchObject({ id: "c2", url: null, start: 4 });
  });

  it("shows an empty-state note without clips", () => {
    renderEditor(<PreviewPane />, makeApi(makeState(makeProject([]))));
    expect(screen.getByTestId("preview-empty")).toBeInTheDocument();
  });

  it("renders two video elements sized to the project's aspect ratio", () => {
    renderEditor(<PreviewPane />, makeApi(makeState(defaultProject())));
    expect(screen.getByTestId("video-a")).toBeInTheDocument();
    expect(screen.getByTestId("video-b")).toBeInTheDocument();
    expect(screen.getByTestId("stage").style.aspectRatio).toBe("1920 / 1080");
  });

  it("draws an overlay only while the playhead is inside it, with the typewriter revealing letters", () => {
    const p = defaultProject([
      overlay("o1", 2, 4, { text: "Hello there", animation: "typewriter" }),
      overlay("o2", 8, 2, { text: "Later" }),
    ]);
    renderEditor(withProbe(<PreviewPane />), makeApi(makeState(p)));
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
    act(() => editor().setPlayhead(2.2)); // 0.2 s in at 0.08 s per letter: 3 letters
    expect(document.querySelector('[data-overlay-id="o1"]')?.textContent).toBe("Hel");
    act(() => editor().setPlayhead(5));
    expect(document.querySelector('[data-overlay-id="o1"]')?.textContent).toBe("Hello there");
    act(() => editor().setPlayhead(7));
    expect(document.querySelector('[data-overlay-id="o1"]')).toBeNull();
    act(() => editor().setPlayhead(8.5));
    expect(screen.getByText("Later")).toBeInTheDocument();
  });

  it("partStyle scales with the frame through container units and animates opacity and position", () => {
    const style = partStyle(
      {
        key: "main",
        text: "x",
        typed: false,
        sizeCqh: 10,
        bold: true,
        color: "#ffffff",
        box: { color: "#000000", opacity: 0.5 },
        padCqh: 3,
        hAlign: "left",
        leftCqw: 8,
        topCqh: 72,
        originX: "left",
        originY: "top",
      },
      {
        visible: true,
        opacity: 0.5,
        offsetX: -0.3,
        offsetY: 0.06,
        scale: 0.75,
        visibleChars: null,
      },
    );
    expect(style.fontSize).toBe("10cqh");
    expect(style.left).toBe("calc(8cqw - 3cqh)");
    expect(style.top).toBe("calc(72cqh - 3cqh)");
    expect(style.fontWeight).toBe(700);
    expect(style.opacity).toBe(0.5);
    expect(style.transform).toBe("translate(-30cqw, 6cqh) translateX(0) scale(0.75)");
    expect(style.background).toBe("rgba(0, 0, 0, 0.5)");
    expect(rgba("#ff8000", 1)).toBe("rgba(255, 128, 0, 1)");
  });

  it("shows a click-to-play prompt when the browser blocks autoplay", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      Object.assign(new Error("no"), { name: "NotAllowedError" }),
    );
    renderEditor(withProbe(<PreviewPane />), makeApi(makeState(defaultProject())));
    // jsdom never loads media, so make the element "ready" by firing the events a browser would.
    const video = screen.getByTestId("video-a") as HTMLVideoElement;
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });
    fireEvent(video, new Event("loadeddata"));
    act(() => editor().setPlaying(true));
    await act(async () => {});
    expect(await screen.findByText(/Click to play/)).toBeInTheDocument();
    expect(editor().playing).toBe(false);
  });
});

describe("EditorProvider api updates", () => {
  it("renders from the latest api.state", () => {
    const first = makeApi(makeState(defaultProject()));
    const r = render(
      <EditorProvider api={first}>
        <EditorToolbar />
      </EditorProvider>,
    );
    expect(screen.getByTestId("undo")).toBeDisabled();
    r.rerender(
      <EditorProvider api={makeApi(makeState(defaultProject(), { canUndo: true }))}>
        <EditorToolbar />
      </EditorProvider>,
    );
    expect(screen.getByTestId("undo")).toBeEnabled();
  });
});
