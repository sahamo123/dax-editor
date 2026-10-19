// Template packs: data-only edit recipes (creator styles, industries) plus a deterministic applier that turns one
// into a project edit with no AI involved. A template names a format, a cut preset, overlays with timing rules and
// the things the engine cannot do yet; it never carries file paths or FFmpeg arguments. The applier composes the
// existing commands (set_format, smart_cut, add_overlay, set_fades) on a scratch Session and commits the result as
// ONE history entry. Design: docs/research/industry-video-templates.md and creator-editing-styles.md.

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CommandContext } from "./commands.js";
import {
  analyzeAudio,
  CUT_PRESET_NAMES,
  CUT_PRESETS,
  type CutParams,
  detectSpeechSpans,
  planCuts,
} from "./cuts.js";
import { getPreset } from "./presets.js";
import { HexColorSchema, type Overlay, POSITIONS, type Project } from "./schema.js";
import { Session } from "./session.js";
import { clipDuration, FORMAT_PRESETS, mainClips, ownAsset, timelineDuration } from "./timeline.js";

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

/** Said to the user next to every list of compliance notes. Templates never replace professional advice. */
export const TEMPLATE_NOTES_DISCLAIMER =
  "These are general notes, not legal advice. Rules differ by country, state and platform; check with a qualified professional before you publish.";

/**
 * Engine capabilities that do not exist yet, with a plain-language description. A template step that needs one
 * is recorded under `deferred` with `requires: [...]` and reported as skipped, never faked. When the engine
 * gains a feature, remove it here, teach {@link applyTemplate} to run it, and update the templates.
 */
export const ENGINE_FEATURES = {
  captions: "Word-timed captions (needs a speech-to-text adapter and a caption track)",
  "music-bed": "A music track under the video",
  "audio-ducking": "Lowering music automatically under speech",
  "sound-effects": "Sound effects placed on cuts or emphasis points",
  broll: "A second video layer for B-roll inserts",
  "zoom-keyframes": "Punch-in and zoom moves that change over time",
  "cursor-zoom": "Zoom that follows the cursor and clicks in a screen recording",
  "speed-change": "Per-clip speed changes and speed ramps",
  transitions: "Transitions other than fade to black",
  "color-grade": "Colour grading or LUTs",
  reframe: "Re-framing wide footage around the speaker for a vertical or square frame",
  "image-overlays": "Image, logo, shape and full-frame card overlays",
  waveform: "An audio waveform or audiogram visual",
  "beat-matching":
    "Finding which part of the footage is which beat (needs shot or scene understanding)",
} as const;

/** One of the keys of {@link ENGINE_FEATURES}. */
export type EngineFeature = keyof typeof ENGINE_FEATURES;

const FEATURE_KEYS = Object.keys(ENGINE_FEATURES) as [EngineFeature, ...EngineFeature[]];

/** Aspect ratios a template can output, each mapped to a `set_format` preset. */
export const TEMPLATE_ASPECTS = {
  "16:9": "landscape-1080p",
  "9:16": "portrait-1080x1920",
  "1:1": "square-1080",
  "4:5": "portrait-4x5",
} as const satisfies Record<string, keyof typeof FORMAT_PRESETS>;

/** One of the keys of {@link TEMPLATE_ASPECTS}. */
export type TemplateAspect = keyof typeof TEMPLATE_ASPECTS;

const ASPECT_KEYS = Object.keys(TEMPLATE_ASPECTS) as [TemplateAspect, ...TemplateAspect[]];

/** Places a video is published, used to state a length target per platform. */
export const TEMPLATE_PLATFORMS = [
  "youtube",
  "youtube-shorts",
  "tiktok",
  "instagram-reels",
  "instagram-feed",
  "facebook-feed",
  "linkedin",
  "website",
  "email",
  "learning-platform",
] as const;

/** Topics for compliance notes shown to the user. */
export const NOTE_CATEGORIES = [
  "health",
  "finance",
  "real-estate",
  "testimonials",
  "advertising",
  "music",
  "copyright",
  "privacy",
  "ai-disclosure",
  "safety",
  "general",
] as const;

/** Licences a template file may declare. Mirrors the allow-list in docs/research/open-source-radar.md. */
export const TEMPLATE_LICENSES = [
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC0-1.0",
  "CC-BY-4.0",
] as const;

/** Ids of the steps every run reports on its own; template steps may not reuse them. */
const RESERVED_STEP_IDS = ["format", "framing", "cleanup", "fades", "length", "structure"];

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VAR_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

const Kebab = z.string().regex(KEBAB, "expected kebab-case such as my-template");
const VarName = z.string().regex(VAR_NAME, "expected snake_case such as speaker_name");

const SecRange = z
  .object({ min: z.number().min(0).max(7200), max: z.number().min(0).max(7200) })
  .strict()
  .refine((r) => r.min <= r.max, "min must not be more than max");

// ---------------------------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------------------------

const VariableSchema = z
  .object({
    name: VarName,
    label: z.string().min(1).max(60),
    description: z.string().max(200).optional(),
    type: z.enum(["text", "name", "phone", "url"]),
    required: z.boolean().default(false),
    /** Used when the caller gives no value. Must itself pass the variable's validation. */
    default: z.string().optional(),
    /** Longest accepted value in characters. Longer values are rejected, never silently cut. */
    maxLength: z.number().int().min(1).max(140).optional(),
    /** A realistic sample value; shown to users and used by the tests. */
    example: z.string().min(1),
  })
  .strict();

const PlatformSchema = z
  .object({
    platform: z.enum(TEMPLATE_PLATFORMS),
    /** Length guidance for this platform; defaults to the format's. */
    lengthSec: SecRange.optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

const FormatSchema = z
  .object({
    aspect: z.enum(ASPECT_KEYS),
    fps: z.number().min(1).max(120).optional(),
    /** Target length of the finished video in seconds. */
    lengthSec: SecRange,
    platforms: z.array(PlatformSchema).min(1),
  })
  .strict();

const CleanupOverridesSchema = z
  .object({
    pauseMin: z.number().min(0.1).max(5),
    keepPause: z.number().min(0).max(3),
    padPre: z.number().min(0).max(1),
    padPost: z.number().min(0).max(1),
    fillers: z.enum(["off", "standalone", "isolated"]),
    retakes: z.boolean(),
  })
  .partial()
  .strict();

const CleanupSchema = z.union([
  z
    .object({
      /** A cut preset name from `CUT_PRESET_NAMES`. */
      preset: z.enum(CUT_PRESET_NAMES),
      overrides: CleanupOverridesSchema.optional(),
    })
    .strict(),
  z.object({ skip: z.literal(true), reason: z.string().min(1).max(300) }).strict(),
]);

const BeatSchema = z
  .object({
    id: Kebab,
    name: z.string().min(1).max(60),
    durationSec: SecRange,
    guidance: z.string().min(1).max(400),
    /** What to film or choose for this beat. */
    footage: z.string().max(240).optional(),
    /** Id of the overlay step that belongs to this beat (documentation only). */
    overlay: Kebab.optional(),
  })
  .strict();

const OverlayStepSchema = z
  .object({
    id: Kebab,
    /** An id from `OVERLAY_PRESETS`. */
    preset: z.string().refine(
      (p) => getPreset(p) !== undefined,
      (p) => ({
        message: `Unknown overlay preset "${p}"`,
      }),
    ),
    /** Main text; `{{name}}` is replaced by a variable. */
    text: z.string().min(1).max(280),
    subtitle: z.string().max(280).optional(),
    /** Skip the overlay when this variable has no value. */
    when: VarName.optional(),
    /**
     * `start`: begins `offset` seconds after the start. `end`: finishes `offset` seconds before the end.
     * `full`: covers from `offset` to the end, split into pieces the add_overlay command accepts.
     */
    anchor: z.enum(["start", "end", "full"]),
    offset: z.number().min(0).max(600).default(0),
    duration: z.number().min(0.2).max(3600).optional(),
    /** Shorter than this and the overlay is skipped instead of squeezed. */
    minDuration: z.number().min(0.2).max(60).default(1),
    /** The overlay never takes more than this fraction of the video. */
    maxFraction: z.number().min(0.05).max(1).default(1),
    /** On a clash between overlays at the same position, the higher priority keeps its time. */
    priority: z.number().int().min(0).max(10).default(0),
    style: z
      .object({
        fontSize: z.number().min(8).max(400).optional(),
        color: HexColorSchema.optional(),
        position: z.enum(POSITIONS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const DeferredSchema = z
  .object({
    id: Kebab,
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    /** The missing engine features this step needs. Always at least one: a step without one is not deferred. */
    requires: z.array(z.enum(FEATURE_KEYS)).min(1),
  })
  .strict();

const NoteSchema = z
  .object({ category: z.enum(NOTE_CATEGORIES), text: z.string().min(1).max(500) })
  .strict();

const ConfirmationSchema = z.object({ id: Kebab, ask: z.string().min(1).max(300) }).strict();

/**
 * A template file. Strict: unknown keys are errors, so a step the engine cannot run cannot hide under an
 * invented field. Cross-checks (unique ids, known variables, valid defaults, a real default aspect) run
 * after the shape check.
 */
export const TemplateSchema = z
  .object({
    id: Kebab,
    version: z.number().int().min(1),
    kind: z.enum(["style", "industry"]),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    tags: z.array(Kebab).min(1).max(16),
    license: z.enum(TEMPLATE_LICENSES),
    author: z.string().min(1).max(80),
    /** Where the numbers come from, e.g. a docs/research file. */
    source: z.string().min(1).max(200),
    variables: z.array(VariableSchema).max(12),
    formats: z.array(FormatSchema).min(1),
    defaultAspect: z.enum(ASPECT_KEYS),
    cleanup: CleanupSchema,
    beats: z.array(BeatSchema).min(1).max(16),
    overlays: z.array(OverlayStepSchema).max(10),
    /** Seconds of fade from black at the start and to black at the end. */
    fades: z
      .object({ in: z.number().min(0).max(3).optional(), out: z.number().min(0).max(3).optional() })
      .strict()
      .optional(),
    deferred: z.array(DeferredSchema).max(12),
    notes: z.array(NoteSchema).max(12),
    confirmations: z.array(ConfirmationSchema).max(8),
  })
  .strict()
  .superRefine((t, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const unique = (key: string, ids: string[]) => {
      ids.forEach((id, i) => {
        if (ids.indexOf(id) !== i) fail([key, i], `Duplicate id "${id}"`);
      });
    };
    unique(
      "variables",
      t.variables.map((v) => v.name),
    );
    unique(
      "formats",
      t.formats.map((f) => f.aspect),
    );
    unique(
      "beats",
      t.beats.map((b) => b.id),
    );
    unique(
      "overlays",
      t.overlays.map((o) => o.id),
    );
    unique(
      "deferred",
      t.deferred.map((d) => d.id),
    );
    unique(
      "confirmations",
      t.confirmations.map((c) => c.id),
    );
    // The report lists overlays, deferred steps and confirmations by id, so an id must mean one thing.
    const stepIds = [...t.overlays, ...t.deferred, ...t.confirmations].map((s) => s.id);
    stepIds.forEach((id, i) => {
      if (stepIds.indexOf(id) !== i)
        fail(
          ["overlays"],
          `Id "${id}" is used by more than one overlay, deferred step or confirmation`,
        );
      if (RESERVED_STEP_IDS.includes(id))
        fail(["overlays"], `Id "${id}" is reserved for a built-in step`);
    });

    if (!t.formats.some((f) => f.aspect === t.defaultAspect)) {
      fail(
        ["defaultAspect"],
        `defaultAspect ${t.defaultAspect} is not one of the template's formats`,
      );
    }
    const vars = new Map(t.variables.map((v) => [v.name, v]));
    for (const [i, v] of t.variables.entries()) {
      if (v.default !== undefined) {
        const problem = checkVariableValue(v, v.default);
        if (problem) fail(["variables", i, "default"], problem);
      }
      const example = checkVariableValue(v, v.example);
      if (example) fail(["variables", i, "example"], example);
    }
    const overlayIds = new Set(t.overlays.map((o) => o.id));
    for (const [i, b] of t.beats.entries()) {
      if (b.overlay && !overlayIds.has(b.overlay))
        fail(["beats", i, "overlay"], `Unknown overlay step "${b.overlay}"`);
    }
    for (const [i, o] of t.overlays.entries()) {
      if (o.anchor !== "full" && o.duration === undefined) {
        fail(
          ["overlays", i, "duration"],
          `Overlay "${o.id}" needs a duration unless anchor is "full"`,
        );
      }
      if (o.when && !vars.has(o.when))
        fail(["overlays", i, "when"], `Unknown variable "${o.when}"`);
      for (const field of ["text", "subtitle"] as const) {
        for (const m of (o[field] ?? "").matchAll(TOKEN)) {
          if (!vars.has(m[1] ?? "")) fail(["overlays", i, field], `Unknown variable "${m[1]}"`);
        }
      }
    }
    if ("preset" in t.cleanup && t.cleanup.overrides) {
      const merged = { ...CUT_PRESETS[t.cleanup.preset], ...t.cleanup.overrides };
      if (merged.keepPause > merged.pauseMin) {
        fail(["cleanup", "overrides"], "keepPause cannot be longer than pauseMin");
      }
    }
  });

/** A validated template. */
export type Template = z.infer<typeof TemplateSchema>;
/** One user-supplied value a template asks for. */
export type TemplateVariable = Template["variables"][number];
/** One output format (aspect ratio and length target) of a template. */
export type TemplateFormat = Template["formats"][number];
/** A timed text overlay a template adds. */
export type TemplateOverlayStep = Template["overlays"][number];
/** A step that needs engine features that do not exist yet. */
export type TemplateDeferredStep = Template["deferred"][number];
/** A compliance reminder shown to the user. */
export type TemplateNote = Template["notes"][number];

/** Thrown for invalid template files, unknown templates and invalid variables. The message is safe to show to a model. */
export class TemplateError extends Error {}

// ---------------------------------------------------------------------------------------------
// Variables: validation and sanitising
// ---------------------------------------------------------------------------------------------

const DEFAULT_MAX_LENGTH = { text: 80, name: 60, phone: 25, url: 100 } as const;

/**
 * Clean text that will be drawn on screen: normalise Unicode, turn control characters into spaces, drop
 * invisible formatting characters (zero-width, bidi overrides), collapse whitespace and trim.
 */
export function sanitizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&()/-]*$/u;
const PHONE_RE = /^\+?[\d][\d ().-]*$/;
const URL_RE =
  /^(https?:\/\/)?[\p{L}\p{N}]([\p{L}\p{N}-]*[\p{L}\p{N}])?(\.[\p{L}\p{N}-]+)+(:\d{1,5})?([/?#]\S*)?$/u;

/** Returns a problem description, or undefined when `value` (already sanitised) is acceptable. */
function checkVariableValue(def: TemplateVariable, raw: string): string | undefined {
  const value = sanitizeText(raw);
  const max = def.maxLength ?? DEFAULT_MAX_LENGTH[def.type];
  const length = [...value].length;
  if (length === 0) return `Variable "${def.name}" is empty`;
  if (length > max) return `Variable "${def.name}" is ${length} characters; the limit is ${max}`;
  if (def.type === "name" && !NAME_RE.test(value)) {
    return `Variable "${def.name}" may only contain letters, digits, spaces and . , ' & ( ) / -`;
  }
  if (def.type === "phone") {
    const digits = value.replace(/\D/g, "").length;
    if (!PHONE_RE.test(value) || digits < 7 || digits > 15) {
      return `Variable "${def.name}" must be a phone number with 7 to 15 digits`;
    }
  }
  if (def.type === "url" && !URL_RE.test(value)) {
    return `Variable "${def.name}" must be a web address such as example.com/book (http or https only)`;
  }
  return undefined;
}

/** Text as shown on screen: web addresses lose the scheme and a trailing slash. */
function displayValue(def: TemplateVariable, value: string): string {
  return def.type === "url" ? value.replace(/^https?:\/\//, "").replace(/\/$/, "") : value;
}

/**
 * Validate the values a caller supplied and fill in defaults. Values are sanitised with {@link sanitizeText}
 * and checked against the variable's type and length limit; too-long values are rejected, not cut. An empty
 * value counts as not supplied. Returns the final value of every variable that has one.
 * Throws {@link TemplateError} for an unknown variable name, a non-text value, an invalid value or a
 * missing required variable.
 */
export function resolveVariables(
  template: Template,
  supplied: Record<string, unknown> = {},
): Record<string, string> {
  const defs = new Map(template.variables.map((v) => [v.name, v]));
  for (const key of Object.keys(supplied)) {
    if (!defs.has(key)) {
      const known = template.variables.map((v) => v.name).join(", ") || "none";
      throw new TemplateError(
        `Unknown variable "${key}" for template "${template.id}". Known variables: ${known}.`,
      );
    }
  }
  const out: Record<string, string> = {};
  for (const def of template.variables) {
    const raw = Object.hasOwn(supplied, def.name) ? supplied[def.name] : undefined;
    if (raw !== undefined && raw !== null && typeof raw !== "string" && typeof raw !== "number") {
      throw new TemplateError(`Variable "${def.name}" must be text.`);
    }
    const given = raw === undefined || raw === null ? "" : sanitizeText(String(raw));
    if (given) {
      const problem = checkVariableValue(def, given);
      if (problem) throw new TemplateError(problem);
      out[def.name] = displayValue(def, sanitizeText(given));
    } else if (def.default !== undefined) {
      out[def.name] = displayValue(def, sanitizeText(def.default));
    } else if (def.required) {
      throw new TemplateError(
        `Template "${template.id}" needs a value for "${def.name}" (${def.label}).`,
      );
    }
  }
  return out;
}

/** Separators trimmed from the ends of rendered text, so "{{phone}} · {{url}}" with no phone is just the address. */
const EDGE_SEPARATORS = /^[\s,;·•|–—]+|[\s,;·•|–—]+$/g;

function renderText(tpl: string, vars: Record<string, string>): string {
  const filled = tpl.replace(TOKEN, (_all, name: string) => vars[name] ?? "");
  return filled
    .replace(/(?:\s*[·•|]\s*){2,}/g, " · ")
    .replace(/\s+/g, " ")
    .replace(EDGE_SEPARATORS, "");
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

const MAX_TEMPLATE_BYTES = 256 * 1024;

async function jsonFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // Symlinks are skipped on purpose: a template folder must not lead outside itself.
    if (entry.isDirectory()) found.push(...(await jsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_")) {
      found.push(path);
    }
  }
  return found.sort();
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "template"}: ${i.message}`).join("; ");
}

/**
 * Read every `*.json` template under `dir` (subfolders included; files starting with `_` and symlinks are
 * ignored). Each file must validate against {@link TemplateSchema} and be named `<id>.json`; ids must be unique.
 * Returns the templates sorted by id. Throws {@link TemplateError} listing every problem found.
 */
export async function loadTemplates(dir: string): Promise<Template[]> {
  const root = resolve(dir);
  const templates: Template[] = [];
  const problems: string[] = [];
  for (const file of await jsonFiles(root)) {
    const name = relative(root, file);
    try {
      if ((await stat(file)).size > MAX_TEMPLATE_BYTES) {
        problems.push(`${name}: larger than ${MAX_TEMPLATE_BYTES} bytes`);
        continue;
      }
      const parsed = TemplateSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
      if (!parsed.success) {
        problems.push(`${name}: ${describeIssues(parsed.error)}`);
        continue;
      }
      if (!file.endsWith(`${parsed.data.id}.json`)) {
        problems.push(`${name}: file name must be "${parsed.data.id}.json"`);
        continue;
      }
      templates.push(parsed.data);
    } catch (err) {
      problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const seen = new Set<string>();
  for (const t of templates) {
    if (seen.has(t.id)) problems.push(`Duplicate template id "${t.id}"`);
    seen.add(t.id);
  }
  if (problems.length) throw new TemplateError(`Invalid template file(s):\n${problems.join("\n")}`);
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Where the shipped templates live: `$DAX_TEMPLATES_DIR` when set, else the nearest `templates/` folder
 * (containing a README.md) above this file. Throws {@link TemplateError} when none is found, which
 * means a packaged build must call {@link configureTemplates} or set the variable.
 */
export function defaultTemplatesDir(): string {
  const fromEnv = process.env.DAX_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    // A README alone is not enough: any ancestor folder may have one. The shipped catalogue always has `styles/`.
    const candidate = join(dir, "templates");
    if (existsSync(join(candidate, "README.md")) && existsSync(join(candidate, "styles"))) {
      return candidate;
    }
    dir = dirname(dir);
  }
  throw new TemplateError(
    "Template folder not found. Set DAX_TEMPLATES_DIR or call configureTemplates({ dir }).",
  );
}

let catalogue: Promise<Template[]> | undefined;
let source: { dir: string } | { templates: Template[] } | undefined;

/**
 * Choose where {@link getTemplates} reads from: a folder, or an already loaded list (for apps that bundle
 * templates). Resets the cache.
 */
export function configureTemplates(next: { dir: string } | { templates: Template[] }): void {
  source = next;
  catalogue = undefined;
}

/** The active template list, loaded once and cached. Uses {@link configureTemplates} or {@link defaultTemplatesDir}. */
export function getTemplates(): Promise<Template[]> {
  if (!catalogue) {
    const chosen = source ?? { dir: defaultTemplatesDir() };
    catalogue =
      "templates" in chosen ? Promise.resolve(chosen.templates) : loadTemplates(chosen.dir);
    // A failed load must not stick: the next call tries again.
    catalogue.catch(() => {
      catalogue = undefined;
    });
  }
  return catalogue;
}

/** Find a template by id, or undefined. */
export function findTemplate(list: readonly Template[], id: string): Template | undefined {
  return list.find((t) => t.id === id);
}

/** The engine features a template needs that are missing, without repeats. */
export function templateRequirements(t: Template): EngineFeature[] {
  return [...new Set(t.deferred.flatMap((d) => d.requires))];
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

/** What happened to one step. `needs-review` means the step ran or applies, but a person should look. */
export type TemplateStepStatus = "done" | "skipped" | "needs-review";

/** What a step is about. */
export type TemplateStepKind =
  | "format"
  | "framing"
  | "cleanup"
  | "overlay"
  | "fades"
  | "length"
  | "structure"
  | "deferred"
  | "confirmation";

/** One line of the step-by-step report. `detail` is plain text for a person; for a skipped step it is the reason. */
export interface TemplateStepReport {
  id: string;
  kind: TemplateStepKind;
  status: TemplateStepStatus;
  detail: string;
}

/** The result of {@link applyTemplate}. */
export interface TemplateReport {
  templateId: string;
  templateName: string;
  /** The aspect ratio that was applied, e.g. `9:16`. */
  aspect: TemplateAspect;
  /** Every step in the order it ran or was considered. */
  steps: TemplateStepReport[];
  /** Final value of each variable after defaults and sanitising. */
  variables: Record<string, string>;
  /** Optional variables that have no value, so the overlays that need them were skipped. */
  missingVariables: string[];
  /** Compliance reminders to show the user. */
  notes: TemplateNote[];
  /** Always {@link TEMPLATE_NOTES_DISCLAIMER}. */
  disclaimer: string;
  /** Timeline length in seconds before and after. */
  durationBefore: number;
  durationAfter: number;
  /** Whether the project changed. When false, no history entry was added. */
  changed: boolean;
  /** Id of the single history state this created (undo reverts the whole template), if `changed`. */
  historyId?: number;
  /** One or two sentences for a person or a model. */
  summary: string;
}

/** Options for {@link applyTemplate}. */
export interface ApplyTemplateOptions {
  /** Which of the template's formats to use. Defaults to the template's `defaultAspect`. */
  aspect?: TemplateAspect;
  /**
   * What to do when this template's overlays are already on the timeline (it was applied before).
   * `replace` (default) removes and re-adds them, so applying twice never stacks duplicates;
   * `skip` leaves them untouched; `add` stacks a second copy.
   */
  existing?: "replace" | "skip" | "add";
}

// ---------------------------------------------------------------------------------------------
// Overlay planning (pure)
// ---------------------------------------------------------------------------------------------

const EPS = 1e-6;
/** Longest piece of a `full` overlay. The add_overlay command accepts up to 120 s. */
const MAX_PIECE = 100;
const ms = (x: number) => Math.round(x * 1000) / 1000;
const fmtSec = (x: number) => `${Number(x.toFixed(2))}s`;

interface Planned {
  step: TemplateOverlayStep;
  text: string;
  subtitle?: string;
  position: string;
  start: number;
  end: number;
  note?: string;
}

function positionOf(step: TemplateOverlayStep): string {
  return step.style?.position ?? getPreset(step.preset)?.style.position ?? "center";
}

/** The time window an overlay wants in a video `total` seconds long, or null if it cannot fit at all. */
function wantedWindow(
  step: TemplateOverlayStep,
  total: number,
): { start: number; end: number } | null {
  if (step.anchor === "full") {
    return step.offset < total ? { start: step.offset, end: total } : null;
  }
  const length = Math.min(step.duration ?? 0, total * step.maxFraction);
  if (step.anchor === "start") {
    return { start: step.offset, end: Math.min(step.offset + length, total) };
  }
  const end = total - step.offset;
  return { start: Math.max(0, end - length), end };
}

/**
 * Place overlays on a timeline `total` seconds long. Windows come from each overlay's anchor, offset,
 * duration and `maxFraction`, never run past the end, and never overlap another overlay at the same
 * position: the lower priority one is shortened, or dropped when less than its `minDuration` is left.
 * Returns what was placed and why anything was dropped, both in the template's order.
 */
function planWindows(
  items: { step: TemplateOverlayStep; text: string; subtitle?: string }[],
  total: number,
): { placed: Planned[]; dropped: Map<string, string> } {
  const dropped = new Map<string, string>();
  const candidates: Planned[] = [];
  for (const it of items) {
    const w = wantedWindow(it.step, total);
    if (!w || w.end - w.start < it.step.minDuration - EPS) {
      dropped.set(
        it.step.id,
        `The video is ${fmtSec(total)} long, too short for this overlay (it needs at least ${fmtSec(it.step.minDuration)}).`,
      );
      continue;
    }
    // Rounding to milliseconds can push an end past the video length (43.06667 becomes 43.067), so clamp it.
    candidates.push({
      ...it,
      position: positionOf(it.step),
      start: ms(w.start),
      end: Math.min(ms(w.end), total),
    });
  }
  const byPriority = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.step.priority - a.c.step.priority || a.i - b.i);
  const kept: Planned[] = [];
  for (const { c } of byPriority) {
    for (const p of kept) {
      if (p.position !== c.position || !(c.start < p.end - EPS && p.start < c.end - EPS)) continue;
      // Keep the larger piece that survives next to the overlay that holds this time.
      const before = p.start - c.start;
      const after = c.end - p.end;
      if (before >= after && before > 0) c.end = p.start;
      else if (after > 0) c.start = p.end;
      else c.end = c.start;
      c.note = `shortened so it does not overlap "${p.step.id}"`;
    }
    if (c.end - c.start < c.step.minDuration - EPS) {
      const why = c.note ? ` (${c.note})` : "";
      dropped.set(c.step.id, `No room left for it without overlapping another overlay${why}.`);
      continue;
    }
    kept.push(c);
  }
  const order = new Map(items.map((it, i) => [it.step.id, i]));
  kept.sort((a, b) => (order.get(a.step.id) ?? 0) - (order.get(b.step.id) ?? 0));
  return { placed: kept, dropped };
}

/** Split [start, end) into pieces no longer than {@link MAX_PIECE}, near-equal so no sliver is left. */
function pieces(start: number, end: number): { start: number; end: number }[] {
  const n = Math.max(1, Math.ceil((end - start) / MAX_PIECE - EPS));
  const len = (end - start) / n;
  return Array.from({ length: n }, (_, i) => ({
    start: ms(start + i * len),
    end: i === n - 1 ? ms(end) : ms(start + (i + 1) * len),
  }));
}

/**
 * Pick a font size (in the overlay style's 1080-high units) that keeps the text inside the frame. The
 * renderer scales sizes by frame height and does not wrap, so a vertical frame needs smaller type. The
 * glyph-width factors are estimates; `fits` is false when even the smallest size would overflow.
 */
function fitFontSize(opts: {
  base: number;
  text: string;
  subtitle?: string;
  width: number;
  height: number;
  position: string;
  bold: boolean;
  typewriter: boolean;
}): { size: number; fits: boolean } {
  const scale = opts.height / 1080;
  const room = (opts.position === "lower-third" ? 0.8 : opts.typewriter ? 0.78 : 0.84) * opts.width;
  const glyph = opts.bold ? 0.6 : 0.54;
  let cap = room / ([...opts.text].length * glyph) / scale;
  if (opts.subtitle) {
    const ratio = opts.position === "lower-third" ? 0.6 : 0.55;
    cap = Math.min(cap, room / ([...opts.subtitle].length * 0.54 * ratio) / scale);
  }
  const floor = 24;
  return { size: Math.max(floor, Math.min(opts.base, Math.floor(cap))), fits: cap >= floor };
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

function overlayBaseId(template: Template, step: TemplateOverlayStep): string {
  return `tpl-${template.id}-${step.id}`;
}

function ownedBy(id: string, base: string): boolean {
  return (
    id === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_p\\d+$`).test(id)
  );
}

/** Give an overlay a chosen id. Template overlays carry a predictable id so a second run can find them. */
function renameOverlay(p: Project, from: string, to: string): Project {
  const next = structuredClone(p);
  // Overlay ids must stay unique; a rename onto an existing id would make two overlays answer to one name.
  if (next.timeline.overlays.some((x: Overlay) => x.id === to)) {
    throw new Error(`Overlay "${to}" already exists`);
  }
  const o = next.timeline.overlays.find((x: Overlay) => x.id === from);
  if (!o) throw new Error(`Unknown overlay "${from}"`);
  o.id = to;
  return next;
}

function pickMainAsset(p: Project) {
  const first = mainClips(p)[0];
  const asset = first ? ownAsset(p, first.assetId) : undefined;
  if (!asset) throw new TemplateError("There is no video on the timeline. Import a video first.");
  return asset;
}

function aspectOf(w: number, h: number): number {
  return w / h;
}

const ASPECT_VALUE: Record<TemplateAspect, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

/**
 * Apply a template to the project in `ctx.session`, deterministically and without any model.
 *
 * Order: set the output format, check the framing, clean up with the template's cut preset, add overlays
 * (positions come from the cut video's final length), set the first/last fades, then report on length,
 * the beat structure, steps the engine cannot do yet (skipped, with the missing feature named) and the
 * confirmations the user should give. Existing commands do all the editing.
 *
 * **One undo step.** The commands run on a scratch {@link Session} that starts as a copy of the project; when
 * they finish, the whole result is committed to the real session with a single `apply` (source `template`).
 * The scratch history is thrown away, so `session.undo()` restores the project from before the template.
 * Cut plans made along the way are copied to `ctx.session.plans` so the cuts held back for review can still
 * be applied with `apply_cut_plan`. If nothing changed, no history entry is added. If `ctx.session.project`
 * changes while the template runs, the commit is refused and nothing is applied.
 *
 * Throws {@link TemplateError} before changing anything for invalid variables, an unknown aspect or an
 * empty timeline. An individual step that fails is reported as skipped with the error as the reason.
 * Needs ffmpeg only when the video has no transcript (the cut step then analyses the audio).
 */
export async function applyTemplate(
  ctx: CommandContext,
  template: Template,
  variables: Record<string, unknown> = {},
  options: ApplyTemplateOptions = {},
): Promise<TemplateReport> {
  const vars = resolveVariables(template, variables);
  const aspect = options.aspect ?? template.defaultAspect;
  const format = template.formats.find((f) => f.aspect === aspect);
  if (!format) {
    const known = template.formats.map((f) => f.aspect).join(", ");
    throw new TemplateError(
      `Template "${template.id}" has no ${aspect} format. Available: ${known}.`,
    );
  }
  const base = ctx.session.project;
  pickMainAsset(base);

  // Loaded here, not at the top of the file, so commands.ts can import the template commands without a cycle.
  const { runCommand } = await import("./commands.js");

  const scratch = new Session(structuredClone(base));
  const sctx: CommandContext = { ...ctx, session: scratch, source: "template" };
  const steps: TemplateStepReport[] = [];
  const add = (id: string, kind: TemplateStepKind, status: TemplateStepStatus, detail: string) =>
    steps.push({ id, kind, status, detail });
  /** Run one step; an error becomes a skipped step instead of aborting the template. */
  const guarded = async (id: string, kind: TemplateStepKind, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      add(id, kind, "skipped", `Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const durationBefore = timelineDuration(base);

  await guarded("format", "format", async () => {
    const t = scratch.project.timeline;
    const target = FORMAT_PRESETS[TEMPLATE_ASPECTS[aspect]];
    const fps = format.fps ?? t.fps;
    if (t.width === target.width && t.height === target.height && t.fps === fps) {
      add(
        "format",
        "format",
        "done",
        `Already ${target.width}x${target.height} at ${fps} fps (${aspect}).`,
      );
      return;
    }
    await runCommand(sctx, "set_format", {
      preset: TEMPLATE_ASPECTS[aspect],
      ...(format.fps ? { fps: format.fps } : {}),
    });
    const n = scratch.project.timeline;
    add(
      "format",
      "format",
      "done",
      `Output is now ${n.width}x${n.height} at ${n.fps} fps (${aspect}).`,
    );
  });

  framingStep(scratch.project, aspect, add);
  await guarded("cleanup", "cleanup", () => cleanupStep(sctx, runCommand, template, add));
  const overlayFrom = steps.length;
  await overlaySteps({ template, vars, sctx, runCommand, options, add, guarded });
  // Overlay reports are produced skipped-first; put them back in the template's order.
  const overlayOrder = new Map(template.overlays.map((o, i) => [o.id, i]));
  const overlayReports = steps
    .splice(overlayFrom)
    .sort((x, y) => (overlayOrder.get(x.id) ?? 0) - (overlayOrder.get(y.id) ?? 0));
  steps.push(...overlayReports);
  await guarded("fades", "fades", () => fadesStep(sctx, runCommand, template, add));

  const durationAfter = timelineDuration(scratch.project);
  lengthStep(format, aspect, durationAfter, add);
  structureStep(template, add);
  for (const d of template.deferred) {
    const needs = d.requires.map((f) => `${f} (${ENGINE_FEATURES[f]})`).join("; ");
    add(
      d.id,
      "deferred",
      "skipped",
      `${d.title}: ${d.description} Not done: this build lacks ${needs}.`,
    );
  }
  for (const c of template.confirmations) {
    add(c.id, "confirmation", "needs-review", `Confirm before publishing: ${c.ask}`);
  }

  // Compare content, not history length: a second run that re-creates identical overlays changes nothing.
  const changed = JSON.stringify(scratch.project) !== JSON.stringify(base);
  let historyId: number | undefined;
  if (changed) {
    await ctx.session.apply(
      (p) => {
        if (p !== base)
          throw new TemplateError(
            "The project changed while the template was being applied. Nothing was applied; try again.",
          );
        return scratch.project;
      },
      { label: `Template: ${template.name}`, source: "template" },
    );
    for (const [id, plan] of scratch.plans) ctx.session.plans.set(id, plan);
    historyId = ctx.session.history().at(-1)?.id;
  }

  const missingVariables = template.variables
    .filter((v) => vars[v.name] === undefined)
    .map((v) => v.name);
  const count = (s: TemplateStepStatus) => steps.filter((x) => x.status === s).length;
  const report: TemplateReport = {
    templateId: template.id,
    templateName: template.name,
    aspect,
    steps,
    variables: vars,
    missingVariables,
    notes: template.notes,
    disclaimer: TEMPLATE_NOTES_DISCLAIMER,
    durationBefore,
    durationAfter,
    changed,
    summary: `${template.name} (${aspect}): ${count("done")} done, ${count("needs-review")} to review, ${count("skipped")} skipped.${changed ? " One undo reverts it all." : " Nothing changed."}${missingVariables.length ? ` No value for: ${missingVariables.join(", ")}.` : ""}`,
  };
  if (historyId !== undefined) report.historyId = historyId;
  return report;
}

type Add = (id: string, kind: TemplateStepKind, status: TemplateStepStatus, detail: string) => void;
type Run = (
  ctx: CommandContext,
  name: string,
  args: unknown,
) => Promise<{ summary: string; data?: unknown }>;

/** Wide footage in a tall frame (or the reverse) is letterboxed. Say so: there is no reframe yet. */
function framingStep(p: Project, aspect: TemplateAspect, add: Add): void {
  const asset = pickMainAsset(p);
  if (!asset.width || !asset.height) {
    add(
      "framing",
      "framing",
      "skipped",
      "The size of the source video is unknown, so the framing was not checked.",
    );
    return;
  }
  const src = aspectOf(asset.width, asset.height);
  const want = ASPECT_VALUE[aspect];
  if (Math.abs(src - want) / want > 0.05) {
    add(
      "framing",
      "framing",
      "needs-review",
      `The footage is ${asset.width}x${asset.height} but the output is ${aspect}, so it is fitted inside the frame with bars. Automatic re-framing around the speaker is not available yet (needs: reframe). Shoot for ${aspect} or accept the bars.`,
    );
  } else {
    add("framing", "framing", "done", `The footage already matches the ${aspect} frame.`);
  }
}

async function cleanupStep(
  sctx: CommandContext,
  run: Run,
  template: Template,
  add: Add,
): Promise<void> {
  const c = template.cleanup;
  if ("skip" in c) {
    add("cleanup", "cleanup", "skipped", `No cuts made: ${c.reason}`);
    return;
  }
  const overrides = c.overrides ?? {};
  if (Object.keys(overrides).length === 0) {
    const r = await run(sctx, "smart_cut", { preset: c.preset });
    const review = (r.data as { forReview?: number } | undefined)?.forReview ?? 0;
    add(
      "cleanup",
      "cleanup",
      review > 0 ? "needs-review" : "done",
      `Cut preset "${c.preset}": ${r.summary}`,
    );
    return;
  }
  // smart_cut takes no overrides, so make the plan here and apply it with apply_cut_plan.
  const asset = pickMainAsset(sctx.session.project);
  const words = asset.transcript?.words;
  const speech = words
    ? undefined
    : detectSpeechSpans(await analyzeAudio(asset.path, sctx.signal ? { signal: sctx.signal } : {}));
  const params: Partial<CutParams> = overrides;
  const plan = planCuts({
    assetId: asset.id,
    duration: asset.duration,
    preset: c.preset,
    overrides: params,
    ...(words ? { words } : {}),
    ...(speech ? { speech } : {}),
  });
  sctx.session.plans.set(plan.id, plan);
  const review = plan.decisions.filter((d) => d.status === "proposed").length;
  const r = await run(sctx, "apply_cut_plan", { planId: plan.id });
  const tail = review ? ` ${review} more cut(s) need review (plan ${plan.id}).` : "";
  add(
    "cleanup",
    "cleanup",
    review > 0 ? "needs-review" : "done",
    `Cut preset "${c.preset}" with ${Object.keys(overrides).join(", ")} adjusted: ${r.summary}${tail}`,
  );
}

async function overlaySteps(a: {
  template: Template;
  vars: Record<string, string>;
  sctx: CommandContext;
  runCommand: Run;
  options: ApplyTemplateOptions;
  add: Add;
  guarded: (id: string, kind: TemplateStepKind, fn: () => Promise<void>) => Promise<void>;
}): Promise<void> {
  const { template, vars, sctx, add } = a;
  const mode = a.options.existing ?? "replace";
  const total = timelineDuration(sctx.session.project);
  const { width, height } = sctx.session.project.timeline;
  const existingIds = () => sctx.session.project.timeline.overlays.map((o) => o.id);

  const wanted: { step: TemplateOverlayStep; text: string; subtitle?: string }[] = [];
  for (const step of template.overlays) {
    if (step.when && vars[step.when] === undefined) {
      add(
        step.id,
        "overlay",
        "skipped",
        `No value for "${step.when}", so this overlay was left out. Supply it to add it.`,
      );
      continue;
    }
    const text = renderText(step.text, vars);
    const subtitle = step.subtitle ? renderText(step.subtitle, vars) : "";
    if (!text) {
      add(
        step.id,
        "overlay",
        "skipped",
        "Its text is empty because the variables it uses have no value.",
      );
      continue;
    }
    if (mode === "skip" && existingIds().some((id) => ownedBy(id, overlayBaseId(template, step)))) {
      add(
        step.id,
        "overlay",
        "skipped",
        "Already on the timeline from an earlier run; left as it is.",
      );
      continue;
    }
    wanted.push({ step, text, ...(subtitle ? { subtitle } : {}) });
  }

  const { placed, dropped } = planWindows(wanted, total);
  for (const [id, reason] of dropped) add(id, "overlay", "skipped", reason);

  for (const item of placed) {
    await a.guarded(item.step.id, "overlay", async () => {
      const base = overlayBaseId(template, item.step);
      const before = existingIds();
      // Old copies are only removed once the new ones exist, so a failed add leaves the earlier copy in place.
      const oldCopies = mode === "replace" ? before.filter((x) => ownedBy(x, base)) : [];
      const replaced = oldCopies.length;
      const preset = getPreset(item.step.preset);
      const fit = fitFontSize({
        base: item.step.style?.fontSize ?? preset?.style.fontSize ?? 64,
        text: item.text,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        width,
        height,
        position: item.position,
        bold: preset?.style.bold === true,
        typewriter: preset?.animation === "typewriter",
      });
      const parts =
        item.step.anchor === "full"
          ? pieces(item.start, item.end)
          : [{ start: item.start, end: item.end }];
      // Add mode: the first suffix no existing overlay starts with, so a new copy never reuses an id.
      let suffix = "";
      if (mode === "add") {
        let k = 1;
        while (before.some((x) => x.startsWith(`${base}_a${k}`))) k++;
        suffix = `_a${k}`;
      }
      // New copies get generated ids first; they are renamed to their final names only after the old copies are
      // gone, because a final name may equal an old one.
      const added: string[] = [];
      try {
        for (const w of parts) {
          const r = await a.runCommand(sctx, "add_overlay", {
            preset: item.step.preset,
            start: w.start,
            // Round down against the video length, so start + duration never runs past it after rounding.
            duration: Math.min(ms(w.end - w.start), Math.floor((total - w.start) * 1000) / 1000),
            text: item.text,
            ...(item.subtitle ? { subtitle: item.subtitle } : {}),
            fontSize: fit.size,
            ...(item.step.style?.color ? { color: item.step.style.color } : {}),
            ...(item.step.style?.position ? { position: item.step.style.position } : {}),
          });
          const made = (r.data as { overlayId?: string } | undefined)?.overlayId;
          if (!made) throw new Error("add_overlay did not return an overlay id");
          added.push(made);
        }
      } catch (err) {
        // Roll back the copies that were added, so the step leaves the timeline as it found it.
        for (const id of added) {
          await a.runCommand(sctx, "remove_overlay", { overlayId: id }).catch(() => undefined);
        }
        throw err;
      }
      for (const id of oldCopies) {
        await a.runCommand(sctx, "remove_overlay", { overlayId: id });
      }
      for (const [i, made] of added.entries()) {
        const id = `${base}${suffix}${parts.length > 1 ? `_p${i + 1}` : ""}`;
        await sctx.session.apply((p) => renameOverlay(p, made, id), {
          label: "Name template overlay",
          source: "template",
        });
      }
      const when = `${fmtSec(item.start)} to ${fmtSec(item.end)}`;
      const bits = [`"${item.text}"${item.subtitle ? ` / "${item.subtitle}"` : ""} at ${when}`];
      if (parts.length > 1) bits.push(`in ${parts.length} pieces`);
      if (item.note) bits.push(item.note);
      if (replaced) bits.push("replaced the earlier copy");
      if (!fit.fits)
        bits.push("the text is long for this frame and may run off the edge; shorten it");
      add(item.step.id, "overlay", fit.fits ? "done" : "needs-review", `Added ${bits.join("; ")}.`);
    });
  }
}

async function fadesStep(
  sctx: CommandContext,
  run: Run,
  template: Template,
  add: Add,
): Promise<void> {
  const f = template.fades;
  if (!f || (!f.in && !f.out)) return;
  const clips = mainClips(sctx.session.project);
  const first = clips[0];
  const last = clips[clips.length - 1];
  if (!first || !last) return;
  // Fades never take more than 40% of a clip, so a very short clip is not swallowed by them.
  const cap = (c: typeof first) => Math.round(clipDuration(c) * 0.4 * 100) / 100;
  const fadeIn = f.in ? Math.min(f.in, cap(first)) : undefined;
  const fadeOut = f.out ? Math.min(f.out, cap(last)) : undefined;
  if (first.id === last.id) {
    await run(sctx, "set_fades", {
      clipId: first.id,
      ...(fadeIn !== undefined ? { fadeIn } : {}),
      ...(fadeOut !== undefined ? { fadeOut } : {}),
    });
  } else {
    if (fadeIn !== undefined) await run(sctx, "set_fades", { clipId: first.id, fadeIn });
    if (fadeOut !== undefined) await run(sctx, "set_fades", { clipId: last.id, fadeOut });
  }
  const said = [
    fadeIn !== undefined ? `fade in ${fmtSec(fadeIn)}` : "",
    fadeOut !== undefined ? `fade out ${fmtSec(fadeOut)}` : "",
  ];
  add("fades", "fades", "done", `Set ${said.filter(Boolean).join(" and ")}.`);
}

function lengthStep(
  format: TemplateFormat,
  aspect: TemplateAspect,
  duration: number,
  add: Add,
): void {
  const { min, max } = format.lengthSec;
  const platforms = format.platforms
    .map(
      (p) =>
        `${p.platform} ${p.lengthSec ? `${p.lengthSec.min}-${p.lengthSec.max}` : `${min}-${max}`}s`,
    )
    .join(", ");
  if (duration > max + EPS) {
    add(
      "length",
      "length",
      "needs-review",
      `The video is ${fmtSec(duration)}, longer than the ${min}-${max}s target for ${aspect}. Templates do not choose highlights; trim to the best moments (keep_only). Targets: ${platforms}.`,
    );
  } else if (duration < min - EPS) {
    add(
      "length",
      "length",
      "needs-review",
      `The video is ${fmtSec(duration)}, shorter than the ${min}-${max}s target for ${aspect}. That is fine if the message is complete. Targets: ${platforms}.`,
    );
  } else {
    add(
      "length",
      "length",
      "done",
      `The video is ${fmtSec(duration)}, inside the ${min}-${max}s target for ${aspect}. Targets: ${platforms}.`,
    );
  }
}

function structureStep(template: Template, add: Add): void {
  const list = template.beats
    .map((b) => `${b.name} ${b.durationSec.min}-${b.durationSec.max}s`)
    .join("; ");
  add(
    "structure",
    "structure",
    "needs-review",
    `Shot list: ${list}. The editor does not re-order footage into this structure (needs: beat-matching); check that your video follows it.`,
  );
}
