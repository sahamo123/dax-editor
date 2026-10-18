// Small inline SVG icon set for the editor toolbar (hand-drawn paths, no icon library). Icons inherit the text colour.

import type { ReactElement, ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg(props: IconProps & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const filled = { fill: "currentColor", stroke: "none" } as const;

/** Name of every icon in {@link ICONS}. */
export type IconName =
  | "play"
  | "pause"
  | "skipStart"
  | "skipEnd"
  | "stepBack"
  | "stepForward"
  | "undo"
  | "redo"
  | "split"
  | "trash"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "loop"
  | "magnet"
  | "volume"
  | "mute";

/** The icon components by name. */
const ICONS: Record<IconName, (p: IconProps) => ReactElement> = {
  play: (p) => (
    <Svg {...p}>
      <path d="M8 5.5v13l11-6.5z" {...filled} />
    </Svg>
  ),
  pause: (p) => (
    <Svg {...p}>
      <rect x="6.5" y="5" width="3.8" height="14" rx="1" {...filled} />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1" {...filled} />
    </Svg>
  ),
  skipStart: (p) => (
    <Svg {...p}>
      <path d="M6 5v14" />
      <path d="M18 6v12l-9-6z" {...filled} />
    </Svg>
  ),
  skipEnd: (p) => (
    <Svg {...p}>
      <path d="M18 5v14" />
      <path d="M6 6v12l9-6z" {...filled} />
    </Svg>
  ),
  stepBack: (p) => (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  ),
  stepForward: (p) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  undo: (p) => (
    <Svg {...p}>
      <path d="M9 7L4.5 11.5 9 16" />
      <path d="M5 11.5h9a5 5 0 0 1 0 10h-3" transform="translate(0 -4)" />
    </Svg>
  ),
  redo: (p) => (
    <Svg {...p}>
      <path d="M15 7l4.5 4.5L15 16" />
      <path d="M19 11.5h-9a5 5 0 0 0 0 10h3" transform="translate(0 -4)" />
    </Svg>
  ),
  split: (p) => (
    <Svg {...p}>
      <path d="M12 3v18" strokeDasharray="2.5 2.5" />
      <path d="M8 7L4 12l4 5" />
      <path d="M16 7l4 5-4 5" />
    </Svg>
  ),
  trash: (p) => (
    <Svg {...p}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.8 12.5h9.4L17.5 7" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  ),
  zoomIn: (p) => (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5M10.5 8v5" />
    </Svg>
  ),
  zoomOut: (p) => (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5" />
    </Svg>
  ),
  fit: (p) => (
    <Svg {...p}>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <path d="M9 12h6" />
    </Svg>
  ),
  loop: (p) => (
    <Svg {...p}>
      <path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H19" />
      <path d="M16 3l3 3-3 3" />
      <path d="M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5" />
      <path d="M8 21l-3-3 3-3" />
    </Svg>
  ),
  magnet: (p) => (
    <Svg {...p}>
      <path d="M5 4v8a7 7 0 0 0 14 0V4h-4.5v8a2.5 2.5 0 0 1-5 0V4z" />
      <path d="M5 8h4.5M14.5 8H19" />
    </Svg>
  ),
  volume: (p) => (
    <Svg {...p}>
      <path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5z" {...filled} />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  ),
  mute: (p) => (
    <Svg {...p}>
      <path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5z" {...filled} />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </Svg>
  ),
};

/** Render an icon by name. */
export function Icon({ name, ...rest }: { name: IconName } & IconProps) {
  const Component = ICONS[name];
  return <Component {...rest} />;
}
