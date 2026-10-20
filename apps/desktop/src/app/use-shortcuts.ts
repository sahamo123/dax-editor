// Global undo/redo keys (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y). The app shell owns these so the buttons and the
// keys can never disagree. Typing in a text box keeps the browser's own text undo.

import { useEffect } from "react";
import { useController } from "./context";

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    (target.tagName === "INPUT" &&
      !["checkbox", "radio", "button", "range"].includes((target as HTMLInputElement).type))
  );
}

/** Bind the undo/redo shortcuts for the lifetime of the component that calls it. */
export function useUndoRedoKeys(): void {
  const controller = useController();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Another handler (for example a dialog or the editor) already used this key press.
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isTextTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        void controller.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        void controller.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller]);
}
