// Short messages in the corner ("Video imported.", an error from a failed edit). Each fades after a few seconds
// and can be dismissed. A polite live region so screen readers announce them without stealing focus.

import { type ReactElement, useEffect } from "react";
import { useApp } from "../context";
import type { Toast } from "../store";
import { Icon } from "./icons";

const LIFETIME_MS = 6000;

function ToastItem({ toast }: { toast: Toast }): ReactElement {
  const dismiss = useApp((s) => s.dismissToast);
  useEffect(() => {
    // Errors stay a little longer; they are the ones people need to read.
    const t = setTimeout(
      () => dismiss(toast.id),
      toast.tone === "error" ? LIFETIME_MS * 1.5 : LIFETIME_MS,
    );
    return () => clearTimeout(t);
  }, [dismiss, toast.id, toast.tone]);
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

/** The stack of current toasts, bottom right. */
export function Toasts(): ReactElement {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
