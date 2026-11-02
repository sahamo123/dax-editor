// Short messages in the corner ("Video imported.", an error from a failed edit). Each fades after a few seconds
// and can be dismissed. A polite live region so screen readers announce them without stealing focus.

import { type ReactElement, useEffect, useState } from "react";
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
  const pending = useApp((s) => s.pendingAnnouncements);
  const consumeAnnouncements = useApp((s) => s.consumeAnnouncements);
  const [polite, setPolite] = useState<Toast | null>(null);
  const [error, setError] = useState<Toast | null>(null);

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
      <div className="toasts" aria-live="off">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}
