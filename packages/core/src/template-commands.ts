// The two registry commands for template packs (list_templates, apply_template). Kept out of commands.ts so the
// template work does not touch the registry file; the lead appends TEMPLATE_COMMANDS to COMMANDS. This file imports
// only TYPES from commands.ts, so wiring it in creates no import cycle.

import { z } from "zod";
import type { CommandContext, CommandDef, CommandResult } from "./commands.js";
import { resolveMediaAsset } from "./effect-commands.js";
import {
  applyTemplate,
  findTemplate,
  getTemplates,
  TEMPLATE_ASPECTS,
  TEMPLATE_NOTES_DISCLAIMER,
  TemplateError,
  templateRequirements,
} from "./templates.js";

const aspects = Object.keys(TEMPLATE_ASPECTS) as [
  keyof typeof TEMPLATE_ASPECTS,
  ...(keyof typeof TEMPLATE_ASPECTS)[],
];

const listSchema = z.object({
  kind: z.enum(["style", "industry"]).optional().describe("Only creator styles or only industries"),
  query: z
    .string()
    .max(80)
    .optional()
    .describe(
      "Words to look for in the name, description, id and tags, e.g. 'real estate' or 'tiktok'",
    ),
});

const applySchema = z.object({
  templateId: z.string().min(1).max(80).describe("A template id from list_templates"),
  variables: z
    .record(z.string().max(32), z.union([z.string().max(300), z.number()]))
    .default({})
    .describe(
      "Values for the template's variables, by name (title, speaker_name, cta_text, phone, url, ...). Leave out what you do not know; the matching overlay is skipped. Never invent a phone number, price or licence number.",
    ),
  aspect: z
    .enum(aspects)
    .optional()
    .describe("Output aspect ratio; defaults to the template's main one"),
  music: z
    .string()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      "For templates with a music step: the full path of a music file, or the asset id of one already imported. Music is never bundled. Leave out to use music already on the timeline.",
    ),
  logo: z
    .string()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      "For templates with a logo step: the full path of a PNG or JPG, or the asset id of one already imported. Leave out to skip the logo.",
    ),
  existing: z
    .enum(["replace", "skip", "add"])
    .default("replace")
    .describe(
      "If this template was applied before: replace its overlays (default), skip them, or add a second copy",
    ),
});

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The template commands: `list_templates` (read-only) and `apply_template` (one undo step). Append them to `COMMANDS`. */
export const TEMPLATE_COMMANDS: readonly CommandDef[] = [
  {
    name: "list_templates",
    description:
      "List the ready-made templates: creator editing styles (Hormozi-style captions, short-form hooks, screen tutorial, ...) and industry recipes (real estate, restaurant, clinic, ...). Each entry shows its variables, formats and the steps this build cannot do yet. Use before apply_template to pick one.",
    schema: listSchema,
    readOnly: true,
    irreversible: false,
    async run(_ctx: CommandContext, args: never): Promise<CommandResult> {
      const a = listSchema.parse(args);
      const need = words(a.query ?? "");
      const all = await getTemplates();
      const hits = all
        .filter((t) => !a.kind || t.kind === a.kind)
        .filter((t) => {
          const hay = new Set(words(`${t.id} ${t.name} ${t.description} ${t.tags.join(" ")}`));
          return need.every((w) => [...hay].some((h) => h.startsWith(w)));
        });
      return {
        summary: `${hits.length} template(s)${a.query ? ` matching "${a.query}"` : ""}.`,
        data: hits.map((t) => ({
          id: t.id,
          kind: t.kind,
          name: t.name,
          description: t.description,
          tags: t.tags,
          defaultAspect: t.defaultAspect,
          aspects: t.formats.map((f) => ({
            aspect: f.aspect,
            lengthSec: f.lengthSec,
            platforms: f.platforms.map((p) => p.platform),
          })),
          variables: t.variables.map((v) => ({
            name: v.name,
            label: v.label,
            type: v.type,
            required: v.required,
            default: v.default,
            example: v.example,
          })),
          cutPreset: "preset" in t.cleanup ? t.cleanup.preset : null,
          effects: t.effects.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
          stepsNotAvailableYet: templateRequirements(t),
        })),
      };
    },
  },
  {
    name: "apply_template",
    description:
      "Apply a template to the video on the timeline: sets the output format, cuts pauses and fillers with the template's preset, adds the titles, lower-thirds and end card with the right timing, adds the template's zoom moves, music bed (ducked under speech) and logo when it has them, and sets fades. No AI is involved in the edit; you only choose the template and fill its variables. One undo step reverts everything. Returns a report of what was done, skipped (with the reason) and needs review, plus compliance notes. Always tell the user the skipped and needs-review items and the notes, which are general information and not legal advice.",
    schema: applySchema,
    readOnly: false,
    irreversible: false,
    async run(ctx: CommandContext, args: never): Promise<CommandResult> {
      const a = applySchema.parse(args);
      const template = findTemplate(await getTemplates(), a.templateId);
      if (!template) {
        throw new TemplateError(
          `Unknown template "${a.templateId}". Call list_templates to see the choices.`,
        );
      }
      // A value that names a known asset is an asset id; anything else is a file path.
      const media = async (value: string | undefined, accept: "audio" | "image") => {
        if (!value) return undefined;
        const known = ctx.session.project.assets[value];
        const { asset } = await resolveMediaAsset(
          ctx,
          known ? { assetId: value } : { path: value },
          accept,
        );
        return asset;
      };
      const music = await media(a.music, "audio");
      const logo = await media(a.logo, "image");
      const report = await applyTemplate(ctx, template, a.variables, {
        existing: a.existing,
        ...(a.aspect ? { aspect: a.aspect } : {}),
        ...(music ? { music } : {}),
        ...(logo ? { logo } : {}),
      });
      return {
        summary: `${report.summary} ${report.notes.length ? TEMPLATE_NOTES_DISCLAIMER : ""}`.trim(),
        data: report,
      };
    },
  },
];
