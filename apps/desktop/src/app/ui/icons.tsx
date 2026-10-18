// A tiny inline icon set (24x24, stroke based) so the app needs no icon library. Decorative by default
// (`aria-hidden`); buttons carry their own accessible name.

import type { ReactElement } from "react";

const PATHS = {
  import: "M12 4v12 M7 11l5 5 5-5 M4 20h16",
  export: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  history: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  media: "M4 4h16v16H4z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4",
  presets: "M5 6V4h14v2 M12 4v16 M9 20h6",
  inspector: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6",
  send: "M12 19V5 M6 11l6-6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  alert: "M12 3l10 18H2z M12 10v5 M12 18v.01",
  sparkle:
    "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z",
  cursor: "M5 3l14 7-6 2-2 6z",
  template: "M4 4h16v6H4z M4 14h7v6H4z M15 14h5v6h-5z",
  flag: "M5 21V4 M5 4h12l-2 4 2 4H5",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  cpu: "M7 7h10v10H7z M10 10h4v4h-4z M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3",
  key: "M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M10.8 12.2L20 3 M16 7l3 3 M13 10l2 2",
  terminal: "M4 5h16v14H4z M7 10l3 2-3 2 M12 15h5",
  plus: "M12 5v14 M5 12h14",
  refresh: "M20 11a8 8 0 0 0-14-4L4 9 M4 4v5h5 M4 13a8 8 0 0 0 14 4l2-2 M20 20v-5h-5",
  panelRight: "M3 5h18v14H3z M15 5v14",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  play: "M7 5v14l12-7z",
  cloud: "M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5 3.8 3.8 0 0 1 17 18z",
  film: "M4 5h16v14H4z M10 9.5v5l4-2.5z",
  plug: "M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
} as const;

/** Names of the available icons. */
export type IconName = keyof typeof PATHS | "stop";

/** Props of {@link Icon}. */
export interface IconProps {
  name: IconName;
  /** Pixel size (square). Default 16. */
  size?: number;
}

/** A decorative inline SVG icon that inherits the text colour. */
export function Icon({ name, size = 16 }: IconProps): ReactElement {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (name === "stop") {
    return (
      <svg {...common} aria-hidden="true" fill="currentColor" focusable="false">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    );
  }
  return (
    <svg
      {...common}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
