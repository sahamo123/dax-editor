// The platform layer: web server discovery and drop parsing, and the Tauri branch with the Tauri API mocked
// (it is imported lazily, so the web path never loads it).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServerInfo, onFileDrop, pathsFromDropText, pickFiles, pickSavePath } from "./platform";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const dragHandlers: { cb: ((e: { payload: unknown }) => void) | null } = { cb: null };
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (cb: (e: { payload: unknown }) => void) => {
      dragHandlers.cb = cb;
      return () => {
        dragHandlers.cb = null;
      };
    },
  }),
}));

function setUrl(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("web platform", () => {
  beforeEach(() => {
    invoke.mockReset();
    setUrl("");
  });

  it("reads ?server and ?token, and remembers them for a reload", async () => {
    setUrl("?server=http://127.0.0.1:4321/&token=abc");
    expect(await getServerInfo()).toEqual({ url: "http://127.0.0.1:4321", token: "abc" });
    setUrl("");
    expect(await getServerInfo()).toEqual({ url: "http://127.0.0.1:4321", token: "abc" });
  });

  it("resolves to null when nothing is known", async () => {
    expect(await getServerInfo()).toBeNull();
  });

  it("has no native dialogs, so callers fall back to typed paths, and never loads Tauri", async () => {
    expect(await pickFiles()).toBeNull();
    expect(await pickSavePath("x.mp4")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("turns dropped text and file links into paths and ignores the rest", () => {
    expect(pathsFromDropText("/a/b.mp4\nfile:///c/d%20e.mp4\n# comment\nhello")).toEqual([
      "/a/b.mp4",
      "/c/d e.mp4",
    ]);
    expect(pathsFromDropText("file:///C:/Videos/x.mp4")).toEqual(["C:/Videos/x.mp4"]);
    expect(pathsFromDropText("")).toEqual([]);
  });

  it("reports drops and hover through window events and stops when unsubscribed", () => {
    const onDrop = vi.fn();
    const onHover = vi.fn();
    const off = onFileDrop({ onDrop, onHover });
    // jsdom has no DataTransfer, so attach a minimal stand-in to plain events.
    const fire = (type: string) => {
      const e = new Event(type, { cancelable: true });
      Object.defineProperty(e, "dataTransfer", {
        value: { types: ["text/plain"], getData: () => "/v/a.mp4" },
      });
      window.dispatchEvent(e);
    };
    fire("dragenter");
    expect(onHover).toHaveBeenLastCalledWith(true);
    fire("drop");
    expect(onDrop).toHaveBeenCalledWith(["/v/a.mp4"]);
    expect(onHover).toHaveBeenLastCalledWith(false);
    off();
    fire("drop");
    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});

describe("tauri platform", () => {
  beforeEach(() => {
    invoke.mockReset();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("asks the shell for the server", async () => {
    invoke.mockResolvedValue({ url: "http://127.0.0.1:1", token: "tok", port: 1, version: "1" });
    expect(await getServerInfo()).toEqual({ url: "http://127.0.0.1:1", token: "tok" });
    expect(invoke).toHaveBeenCalledWith("get_server_info");
  });

  it("uses the native open and save dialogs", async () => {
    invoke.mockResolvedValueOnce(["/a.mp4", "/b.mp4"]);
    expect(await pickFiles()).toEqual(["/a.mp4", "/b.mp4"]);
    invoke.mockResolvedValueOnce(null);
    expect(await pickFiles()).toEqual([]);
    invoke.mockResolvedValueOnce("/out.mp4");
    expect(await pickSavePath("out.mp4")).toBe("/out.mp4");
    expect(invoke.mock.calls[0]?.[0]).toBe("plugin:dialog|open");
  });

  it("delivers real dropped paths from the webview", async () => {
    const onDrop = vi.fn();
    const onHover = vi.fn();
    const off = onFileDrop({ onDrop, onHover });
    await vi.waitFor(() => expect(dragHandlers.cb).not.toBeNull());
    dragHandlers.cb?.({ payload: { type: "over" } });
    dragHandlers.cb?.({ payload: { type: "drop", paths: ["/real/path.mp4"] } });
    expect(onHover).toHaveBeenCalledWith(true);
    expect(onDrop).toHaveBeenCalledWith(["/real/path.mp4"]);
    off();
    expect(dragHandlers.cb).toBeNull();
  });
});
