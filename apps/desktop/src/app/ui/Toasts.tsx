// Short messages in the corner ("Video imported.", an error from a failed edit). Each fades after a few seconds
// and can be dismissed. A polite live region so screen readers announce them without stealing focus.

import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNoticeHost } from "../../editor";
import { useApp } from "../context";
import type { Toast } from "../store";
import { Icon } from "./icons";

const LIFETIME_MS = 6000;

function ToastItem({ toast, paused }: { toast: Toast; paused: boolean }): ReactElement {
  const dismiss = useApp((s) => s.dismissToast);
  const remaining = useRef(toast.tone === "error" ? LIFETIME_MS * 1.5 : LIFETIME_MS);
  useLayoutEffect(() => {
    if (paused) return;
    const started = performance.now();
    const timer = setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [dismiss, paused, toast.id]);
  return (
    <div className={`toast toast--${toast.tone}`}>
      <Icon
        name={toast.tone === "error" ? "alert" : toast.tone === "success" ? "check" : "sparkle"}
      />
      <span className="toast__text">{toast.text}</span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label="Dismiss message"
        onClick={() => dismiss(toast.id)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function useNoticeInteraction(container: HTMLElement, host: HTMLElement | null): boolean {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  useLayoutEffect(() => {
    const area = host ?? container;
    const syncFocus = () =>
      setFocused(document.hasFocus() && area.contains(document.activeElement));
    const onFocus = () => setFocused(true);
    const onBlur = (event: FocusEvent) =>
      setFocused(event.relatedTarget instanceof Node && area.contains(event.relatedTarget));
    const onWindowBlur = () => {
      setFocused(false);
      setHovered(false);
    };
    const onWindowFocus = () => {
      syncFocus();
      setHovered(area.matches(":hover"));
    };
    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    syncFocus();
    setHovered(area.matches(":hover"));
    area.addEventListener("focusin", onFocus);
    area.addEventListener("focusout", onBlur);
    area.addEventListener("pointerenter", onEnter);
    area.addEventListener("pointerleave", onLeave);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      area.removeEventListener("focusin", onFocus);
      area.removeEventListener("focusout", onBlur);
      area.removeEventListener("pointerenter", onEnter);
      area.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [container, host]);
  return focused || hovered;
}

/** The stack of current toasts, bottom right. */
export function Toasts(): ReactElement {
  const toasts = useApp((s) => s.toasts);
  const pending = useApp((s) => s.pendingAnnouncements);
  const consumeAnnouncements = useApp((s) => s.consumeAnnouncements);
  const [polite, setPolite] = useState<Toast | null>(null);
  const [error, setError] = useState<Toast | null>(null);
  const host = useNoticeHost();
  const fallback = useRef<HTMLDivElement>(null);
  const [container] = useState(() => document.createElement("div"));

  useLayoutEffect(() => {
    container.className = host ? "toasts toasts--dialog" : "toasts";
    (host ?? fallback.current)?.appendChild(container);
    return () => container.remove();
  }, [container, host]);
  const paused = useNoticeInteraction(container, host);

  useLayoutEffect(() => {
    container.hidden = toasts.length === 0;
  }, [container, toasts.length]);

  useLayoutEffect(() => {
    if (!host || toasts.length === 0) return;
    host.tabIndex = 0;
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Task notifications");
    return () => {
      host.removeAttribute("tabindex");
      host.removeAttribute("role");
      host.removeAttribute("aria-label");
    };
  }, [host, toasts.length]);

  useEffect(() => {
    if (!pending.polite.length && !pending.urgent.length) return;
    // Consume independently of the visible stack: batched updates may already have pruned it.
    const batch = consumeAnnouncements();
    const lastPolite = batch.polite.at(-1);
    const lastUrgent = batch.urgent.at(-1);
    if (lastPolite) {
      const messages = batch.polite.map((notice) => notice.text);
      if (batch.politeOverflow) messages.push("Additional notifications occurred.");
      setPolite({ ...lastPolite, text: messages.join(" ") });
    }
    if (lastUrgent) {
      const messages = batch.urgent.map((notice) => notice.text);
      if (batch.urgentOverflow) messages.push("Additional errors occurred.");
      setError({ ...lastUrgent, text: messages.join(" ") });
    }
  }, [pending, consumeAnnouncements]);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite ? <span key={polite.id}>{polite.text}</span> : null}
      </div>
      <div className="sr-only" role="alert" aria-atomic="true">
        {error ? <span key={error.id}>{error.text}</span> : null}
      </div>
      <div ref={fallback} />
      {createPortal(
        <div aria-live="off">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} paused={paused} />
          ))}
        </div>,
        container,
      )}
    </>
  );
}
