// Turns a PresetInfo (what the server lists) into an overlay sample for the animated chips. The protocol's PresetInfo
// has no style, so look and position come from the preset's category unless the server provides a `style` field.

import type { Overlay, OverlayStyle } from "@dax/core";
import type { PresetInfo } from "@dax/protocol";
import type { OverlayView } from "../preview/OverlayLayer";

/** Defaults matching the core `OverlayStyleSchema`. */
const BASE_STYLE: OverlayStyle = {
  fontSize: 64,
  color: "#ffffff",
  bold: false,
  accent: "#3b82f6",
  position: "center",
};

/** Typical look of each built-in category (mirrors packages/core/src/presets.ts). */
const CATEGORY_STYLE: Record<string, Partial<OverlayStyle>> = {
  title: { fontSize: 96, bold: true, position: "center" },
  "lower-third": {
    fontSize: 54,
    bold: true,
    position: "lower-third",
    box: { color: "#000000", opacity: 0.55 },
    accent: "#3b82f6",
  },
  caption: { fontSize: 48, position: "bottom", box: { color: "#000000", opacity: 0.6 } },
  callout: {
    fontSize: 64,
    bold: true,
    color: "#111111",
    position: "top",
    box: { color: "#facc15", opacity: 1 },
  },
};

/** A preset as the server may send it: the protocol fields plus an optional `style`. */
export type PresetWithStyle = PresetInfo & { style?: Partial<OverlayStyle> };

/** Resolve the style used to draw a preset's sample. */
export function presetStyle(preset: PresetWithStyle): OverlayStyle {
  return { ...BASE_STYLE, ...(CATEGORY_STYLE[preset.category] ?? {}), ...(preset.style ?? {}) };
}

/** Longest a chip animates before looping, in seconds. */
const CHIP_MAX_DURATION = 2.6;
/** Delay before the sample appears in each loop, so the entrance animation is visible. */
const CHIP_LEAD = 0.25;
/** Pause after the sample leaves before the loop restarts. */
const CHIP_TAIL = 0.7;

/** An overlay sample for a preset, starting at {@link CHIP_LEAD}, short enough to loop quickly. */
export function presetSample(preset: PresetWithStyle): OverlayView & Pick<Overlay, "id"> {
  return {
    id: `chip-${preset.id}`,
    start: CHIP_LEAD,
    duration: Math.min(preset.defaultDuration, CHIP_MAX_DURATION),
    text: preset.defaultText,
    ...(preset.defaultSubtitle ? { subtitle: preset.defaultSubtitle } : {}),
    animation: preset.animation as Overlay["animation"],
    style: presetStyle(preset),
  };
}

/** Length of one chip loop in seconds. */
export function chipLoopLength(sample: Pick<OverlayView, "start" | "duration">): number {
  return sample.start + sample.duration + CHIP_TAIL;
}
