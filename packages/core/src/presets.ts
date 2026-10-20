// The built-in, drag-and-drop animation presets. Pure data: the UI lists them, the agent can pick them, and
// overlayFromPreset turns one into a concrete overlay. No rendering code lives here.

import { newId } from "./ids.js";
import type { Animation, Overlay, OverlayStyle } from "./schema.js";
import { OverlaySchema } from "./schema.js";

/** Broad grouping used to organise presets in the UI. */
export type PresetCategory = "title" | "lower-third" | "caption" | "callout";

/** A ready-made look and motion for a text overlay. */
export interface OverlayPreset {
  /** Stable id, e.g. `title-fade`. Saved into overlays as `preset`. */
  id: string;
  /** Name shown in the UI. */
  label: string;
  category: PresetCategory;
  /** One sentence for tooltips and for the AI to understand when to use it. */
  description: string;
  animation: Animation;
  /** Length in seconds when first dropped on the timeline. */
  defaultDuration: number;
  /** Placeholder text inserted when dropped. */
  defaultText: string;
  /** Placeholder second line, for presets that have one. */
  defaultSubtitle?: string;
  style: Partial<OverlayStyle>;
}

/** All built-in presets, in the order the UI shows them. */
export const OVERLAY_PRESETS: readonly OverlayPreset[] = [
  {
    id: "title-fade",
    label: "Title: fade",
    category: "title",
    description: "Large centred title that fades in and out. Good for opening and chapter titles.",
    animation: "fade",
    defaultDuration: 3,
    defaultText: "Your title",
    style: { fontSize: 96, bold: true, position: "center" },
  },
  {
    id: "title-pop",
    label: "Title: pop",
    category: "title",
    description: "Centred title that pops in with a quick zoom. Punchy for short-form video.",
    animation: "pop",
    defaultDuration: 2.5,
    defaultText: "Big idea",
    style: { fontSize: 110, bold: true, position: "center" },
  },
  {
    id: "title-typewriter",
    label: "Title: typewriter",
    category: "title",
    description: "Text appears one letter at a time, left aligned.",
    animation: "typewriter",
    defaultDuration: 3.5,
    defaultText: "Typing this out...",
    style: { fontSize: 72, position: "center" },
  },
  {
    id: "lower-third-slide",
    label: "Lower third: slide",
    category: "lower-third",
    description: "Name and role in the bottom-left that slides in. Use when introducing a speaker.",
    animation: "slide-left",
    defaultDuration: 4,
    defaultText: "Speaker name",
    defaultSubtitle: "Role or company",
    style: {
      fontSize: 54,
      bold: true,
      position: "lower-third",
      box: { color: "#000000", opacity: 0.55 },
      accent: "#3b82f6",
    },
  },
  {
    id: "caption-bottom",
    label: "Caption: bottom",
    category: "caption",
    description: "Subtitle-style line at the bottom on a dark box.",
    animation: "fade",
    defaultDuration: 3,
    defaultText: "Caption text",
    style: { fontSize: 48, position: "bottom", box: { color: "#000000", opacity: 0.6 } },
  },
  {
    id: "callout-slide-up",
    label: "Callout: slide up",
    category: "callout",
    description:
      "Highlighted note that slides up from below. Use to point out a key step or number.",
    animation: "slide-up",
    defaultDuration: 3,
    defaultText: "Key point",
    style: {
      fontSize: 64,
      bold: true,
      color: "#111111",
      position: "top",
      box: { color: "#facc15", opacity: 1 },
    },
  },
];

/** Look up a preset by id, or undefined if there is no such preset. */
export function getPreset(id: string): OverlayPreset | undefined {
  return OVERLAY_PRESETS.find((p) => p.id === id);
}

/** Options for {@link overlayFromPreset}. Anything omitted falls back to the preset's defaults. */
export interface OverlayFromPresetOptions {
  /** Timeline time, in seconds, where the overlay starts. */
  start: number;
  text?: string;
  subtitle?: string;
  duration?: number;
  lane?: number;
  /** Style fields that override the preset's style. */
  style?: Partial<OverlayStyle>;
}

/**
 * Build a concrete overlay from a preset. Throws for an unknown preset id.
 * The result is validated, so every style field has a value.
 */
export function overlayFromPreset(presetId: string, opts: OverlayFromPresetOptions): Overlay {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`Unknown overlay preset "${presetId}"`);
  const subtitle = opts.subtitle ?? preset.defaultSubtitle;
  return OverlaySchema.parse({
    id: newId("ovl"),
    kind: "text",
    start: opts.start,
    duration: opts.duration ?? preset.defaultDuration,
    text: opts.text ?? preset.defaultText,
    ...(subtitle ? { subtitle } : {}),
    preset: preset.id,
    animation: preset.animation,
    style: { ...preset.style, ...opts.style },
    lane: opts.lane ?? 0,
  });
}
