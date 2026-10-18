// Small, pure text helpers for showing times, sizes, file names and command names to people.

/** `83.4` -> `1:23`; under an hour. Hours are shown when needed (`1:02:03`). Negative or NaN shows `0:00`. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** `2147483648` -> `2.0 GB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Last path segment of a Windows or POSIX path. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Folder part of a Windows or POSIX path, keeping its own separator; empty when there is none. */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : "";
}

/** `remove_silences` -> `Remove silences`. */
export function humanizeCommand(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words ? words[0]?.toUpperCase() + words.slice(1) : name;
}

/** Clock time of an ISO timestamp for the history list (`14:03:22`); empty if it is not a date. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** A file-name-safe version of a project name for the default export file. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "").trim();
  return cleaned || "export";
}

/** Short one-line preview of a tool's arguments, like `at: 4, text: "Hello"`. Keeps it under `max` characters. */
export function summarizeArgs(args: unknown, max = 60): string {
  if (typeof args !== "object" || args === null) return "";
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([k, v]) =>
      `${k}: ${typeof v === "string" ? JSON.stringify(v) : (JSON.stringify(v) ?? String(v))}`,
  );
  const joined = parts.join(", ");
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}
