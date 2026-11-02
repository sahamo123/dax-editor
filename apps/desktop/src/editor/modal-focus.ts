// Preserve focus in the topmost application dialog without taking it from another application.
import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex], video[controls], audio[controls]';

function visible(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (
      current.hidden ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return false;
  }
  return true;
}

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && visible(element),
  );
}

function ownsFocus(root: HTMLElement): boolean {
  if (!root.isConnected || !visible(root) || !document.hasFocus()) return false;
  const modals = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
  ).filter(visible);
  if (modals[modals.length - 1] !== root) return false;
  try {
    const nativeModal = document.querySelector("dialog:modal");
    if (nativeModal && nativeModal !== root && !nativeModal.contains(root)) return false;
  } catch {
    // Older webviews need not support :modal; the OS file picker also removes document focus.
  }
  return true;
}

/** Keep keyboard focus in the visible topmost dialog and recover when its focused control disappears. */
export function useModalFocusRecovery(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onEscape: () => void,
): void {
  const close = useRef(onEscape);
  close.current = onEscape;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const recover = (last = false) => {
      const items = focusable(root);
      (last ? items[items.length - 1] : items[0])?.focus();
      if (!root.contains(document.activeElement)) root.focus();
    };
    const onFocus = (event: FocusEvent) => {
      if (ownsFocus(root) && event.target instanceof Node && !root.contains(event.target))
        recover();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!ownsFocus(root)) return;
      const current = document.activeElement;
      if (!root.contains(current)) {
        if (event.key === "Tab") {
          event.preventDefault();
          recover(event.shiftKey);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable(root);
      if (items.length === 0 || !items.includes(current as HTMLElement)) {
        event.preventDefault();
        recover(event.shiftKey);
      } else if (event.shiftKey && current === items[0]) {
        event.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!event.shiftKey && current === items[items.length - 1]) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    const observer = new MutationObserver(() => {
      if (!ownsFocus(root)) return;
      const current = document.activeElement;
      if (
        !root.contains(current) ||
        (current instanceof HTMLElement && (current.matches(":disabled") || !visible(current)))
      )
        recover();
    });
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("keydown", onKey, true);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden", "inert", "tabindex", "style", "class", "aria-hidden"],
    });
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [active, ref]);
}
