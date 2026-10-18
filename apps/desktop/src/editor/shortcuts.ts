// Keyboard shortcuts for the editor, bound on `window`. Keys that would type text (inputs, textareas, selects,
// contenteditable) or activate a focused button are left alone, so forms and buttons keep working.

import { useEffect } from "react";
import { useEditActions } from "./actions";
import { useEditorStore } from "./context";

const NON_TEXT_INPUTS = [
  "range",
  "checkbox",
  "radio",
  "button",
  "color",
  "submit",
  "reset",
  "file",
  "image",
];

/** True if the event came from something that should keep the key for itself (typing, or button activation). */
export function isEditableTarget(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    const textual = !NON_TEXT_INPUTS.includes(type);
    // Text fields keep every key. Sliders, checkboxes and colour pickers only keep the keys they use themselves,
    // so Ctrl+Z still undoes after dragging a slider.
    return textual || key.startsWith("Arrow") || key === " " || key === "Home" || key === "End";
  }
  if (tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  // A focused button/link is activated by Space and Enter; do not also play/pause.
  if (
    (key === " " || key === "Enter") &&
    (tag === "BUTTON" || tag === "A" || target.getAttribute("role") === "button")
  ) {
    return true;
  }
  return false;
}

/**
 * Bind the editor's keyboard shortcuts. Call once, inside an `EditorProvider` (the app shell does this).
 *
 * | Key | Action |
 * |---|---|
 * | Space, K | play / pause |
 * | L, J | play forward / reverse (press again for 2x, 4x) |
 * | S | split at playhead |
 * | Delete, Backspace | ripple-delete the selection |
 * | Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl+Y) | undo, redo |
 * | Left, Right | step one frame (Shift: one second) |
 * | Home, End | jump to start, end |
 * | + / - (or =), Shift+Z | zoom in / out, fit |
 * | Escape | clear the selection |
 */
export function useEditorShortcuts(): void {
  const store = useEditorStore();
  const actions = useEditActions();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (isEditableTarget(e.target, e.key)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let handled = true;

      if (mod) {
        if (key === "z") void (e.shiftKey ? actions.redo() : actions.undo());
        else if (key === "y") void actions.redo();
        else handled = false;
      } else if (e.altKey) {
        handled = false;
      } else {
        switch (key) {
          case " ":
            store.togglePlay();
            break;
          case "k":
            store.setPlaying(false);
            break;
          case "l":
            store.playForward();
            break;
          case "j":
            store.playReverse();
            break;
          case "s":
            void actions.split();
            break;
          case "Delete":
          case "Backspace":
            void actions.deleteSelected();
            break;
          case "ArrowLeft":
            if (e.shiftKey) {
              store.setPlaying(false);
              store.setPlayhead(store.getState().playhead - 1);
            } else store.stepFrames(-1);
            break;
          case "ArrowRight":
            if (e.shiftKey) {
              store.setPlaying(false);
              store.setPlayhead(store.getState().playhead + 1);
            } else store.stepFrames(1);
            break;
          case "Home":
            store.setPlayhead(0);
            break;
          case "End":
            store.setPlayhead(store.duration);
            break;
          case "+":
          case "=":
            store.zoomBy(1.35);
            break;
          case "-":
          case "_":
            store.zoomBy(1 / 1.35);
            break;
          case "z":
            if (e.shiftKey) store.zoomToFit();
            else handled = false;
            break;
          case "Escape":
            store.select(null);
            break;
          default:
            handled = false;
        }
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, actions]);
}
