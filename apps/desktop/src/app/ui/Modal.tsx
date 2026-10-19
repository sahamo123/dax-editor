// An accessible modal dialog: labelled, closes on Escape, keeps Tab inside, and gives focus back to whatever
// opened it. Used for Settings, Import and Export.

import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Icon } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Props of {@link Modal}. */
export interface ModalProps {
  /** Dialog title; also its accessible name. */
  title: string;
  /** Called on Escape, on the close button and on a click outside the dialog. */
  onClose(): void;
  children: ReactNode;
  /** Buttons for the bottom bar. */
  footer?: ReactNode;
  /** `lg` is for Settings. Default `md`. */
  size?: "md" | "lg";
}

/** A centred dialog over a dimmed backdrop. Put `data-autofocus` on the element that should get focus first. */
export function Modal({ title, onClose, children, footer, size = "md" }: ModalProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const target =
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    // Wrap around so Tab never leaves the dialog.
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the dimmed backdrop closes the dialog; Escape is the keyboard route
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
