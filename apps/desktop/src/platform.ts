// The only place that knows whether the UI runs in a plain browser or inside the Tauri shell.
// Everything else asks this module for server info, file dialogs and dropped files. Tauri code is imported
// lazily so the web build (dev server, tests, CI) never needs it.

/** Where the engine server lives and the token that authorises calls to it. */
export interface ServerConnection {
  /** Base URL such as `http://127.0.0.1:43111`. */
  url: string;
  /** The per-launch token (`Authorization: Bearer` and `?token=`). */
  token: string;
}

/** True when running inside the Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** File extensions offered in the open dialog. */
const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpg", "mpeg"] as const;

const STORAGE_KEY = "dax.server";

function readStored(): ServerConnection | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "url" in parsed &&
      "token" in parsed &&
      typeof parsed.url === "string" &&
      typeof parsed.token === "string"
    ) {
      return { url: parsed.url, token: parsed.token };
    }
  } catch {
    // Storage may be blocked; the typed connection form is the fallback.
  }
  return null;
}

/** Remember a connection for this browser tab so a reload does not lose it (web build only). */
export function rememberServer(conn: ServerConnection): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  } catch {
    // Not fatal: the user can reconnect from the form.
  }
}

/**
 * Where is the engine? Tauri: asks the shell (`get_server_info` command). Web: reads `?server=&token=` from
 * the page URL, else the connection remembered for this tab. Resolves to `null` when nothing is known, so
 * the app can show a "Connect" form.
 */
export async function getServerInfo(): Promise<ServerConnection | null> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<{ url: string; token: string }>("get_server_info");
    return { url: info.url, token: info.token };
  }
  const params = new URLSearchParams(window.location.search);
  const url = params.get("server");
  const token = params.get("token");
  if (url && token) {
    const conn = { url: url.replace(/\/$/, ""), token };
    rememberServer(conn);
    return conn;
  }
  return readStored();
}

/**
 * Ask the user for video files and resolve to their absolute paths (empty if they cancel).
 * Tauri: the native open dialog. Web: resolves to `null` because browsers never expose real paths;
 * the caller then shows a typed-path box.
 */
export async function pickFiles(): Promise<string[] | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const picked = await invoke<string[] | string | null>("plugin:dialog|open", {
    options: {
      multiple: true,
      title: "Import video",
      filters: [{ name: "Video", extensions: [...VIDEO_EXTENSIONS] }],
    },
  });
  if (picked === null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

/** Open the browser's video picker in the current user gesture. Resolves to selected files, or [] on cancel. */
export function pickBrowserFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mp4,.mov,.mkv,.webm,.avi,.m4v,.mpg,.mpeg";
    input.multiple = true;
    input.hidden = true;
    input.setAttribute("aria-label", "Choose videos");
    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * Ask where to save an export. Tauri: the native save dialog. Web: `null` (the caller shows a typed-path box).
 * Resolves to `""` if the user cancels.
 */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const picked = await invoke<string | null>("plugin:dialog|save", {
    options: {
      title: "Export video",
      defaultPath: defaultName,
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    },
  });
  return picked ?? "";
}

/** Callbacks for {@link onFileDrop}. */
export interface FileDropHandlers {
  /** Browser-selected bytes for local upload; native drops continue to use absolute paths. */
  onFiles?(files: File[]): void;
  /** Files were dropped; `paths` are absolute paths and may be empty if the source gave none (web). */
  onDrop(paths: string[]): void;
  /** A drag entered (true) or left (false) the window, for highlighting a drop zone. */
  onHover?(over: boolean): void;
}

/** Turn dropped text or `file://` URIs into plain paths; anything else is ignored. */
export function pathsFromDropText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      if (!line.startsWith("file://")) return line;
      try {
        // Windows file URIs look like file:///C:/x.mp4, so drop the leading slash before a drive letter.
        return decodeURIComponent(new URL(line).pathname).replace(/^\/([A-Za-z]:)/, "$1");
      } catch {
        return "";
      }
    })
    .filter((p) => p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p));
}

function onWebDrop(handlers: FileDropHandlers): () => void {
  // dragenter/dragleave fire for every child element, so count to know when the drag really left.
  let depth = 0;
  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).some((t) => t === "Files" || t.startsWith("text/"));
  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    handlers.onHover?.(true);
  };
  const over = (e: DragEvent) => {
    if (hasFiles(e)) e.preventDefault();
  };
  const leave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) handlers.onHover?.(false);
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    handlers.onHover?.(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length && handlers.onFiles) {
      handlers.onFiles(files);
      return;
    }
    const text =
      e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain") || "";
    handlers.onDrop(pathsFromDropText(text));
  };
  window.addEventListener("dragenter", enter);
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  return () => {
    window.removeEventListener("dragenter", enter);
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
  };
}

/**
 * Listen for files dropped on the window. Tauri: real paths from the webview's drag-and-drop event.
 * Web: selected bytes go to `onFiles` for local upload; dropped text or file links still produce paths.
 * Returns a function that stops listening.
 */
export function onFileDrop(handlers: FileDropHandlers): () => void {
  if (!isTauri()) return onWebDrop(handlers);
  let stopped = false;
  let unlisten: (() => void) | null = null;
  void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
    const off = await getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") handlers.onHover?.(true);
      else if (p.type === "leave") handlers.onHover?.(false);
      else if (p.type === "drop") {
        handlers.onHover?.(false);
        handlers.onDrop(p.paths);
      }
    });
    if (stopped) off();
    else unlisten = off;
  });
  return () => {
    stopped = true;
    unlisten?.();
  };
}
