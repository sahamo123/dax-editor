// Source recovery and word correction are registry edits, shared by manual UI, AI, CLI and MCP.
import { z } from "zod";
import type { CommandDef } from "./commands.js";
import { checkAllowedPath } from "./connector.js";
import { probe } from "./media.js";
import { Session } from "./session.js";
import { ownAsset } from "./timeline.js";

const relink = z.object({
  assetId: z.string().min(1),
  path: z.string().min(1).describe("Replacement source file's absolute local path"),
});
const correction = z.object({
  assetId: z.string().min(1),
  wordIndex: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(120),
});

/** Undoable source relinking and source-time-preserving transcript correction. */
export const PROJECT_COMMANDS: readonly CommandDef[] = [
  {
    name: "apply_edit_batch",
    description:
      "Apply a bounded list of reversible timeline edits atomically as one undo step. Inspect the current project first. No imports, exports, shell, scripts or nested batches. A failed operation changes nothing.",
    schema: z.object({
      operations: z
        .array(
          z.object({
            name: z.enum([
              "set_format",
              "trim_clip",
              "split",
              "delete_range",
              "keep_only",
              "move_clip",
              "remove_clip",
              "set_volume",
              "set_fades",
              "add_overlay",
              "update_overlay",
              "move_overlay",
              "remove_overlay",
              "set_captions",
              "add_zoom",
              "update_zoom",
              "remove_zoom",
            ]),
            args: z.record(z.unknown()),
          }),
        )
        .min(1)
        .max(12),
      label: z.string().min(1).max(120).default("Apply edit batch"),
    }),
    readOnly: false,
    irreversible: false,
    async run(ctx, raw) {
      const schema = z.object({
        operations: z
          .array(z.object({ name: z.string(), args: z.record(z.unknown()) }))
          .min(1)
          .max(12),
        label: z.string(),
      });
      const a = schema.parse(raw);
      const before = ctx.session.project;
      const draft = new Session(structuredClone(before));
      const { tryRunCommand } = await import("./commands.js");
      for (const operation of a.operations) {
        if (ctx.signal?.aborted) throw new Error("Cancelled. Nothing was changed.");
        const result = await tryRunCommand(
          { ...ctx, session: draft },
          operation.name,
          operation.args,
        );
        if (!result.ok)
          throw new Error(`${operation.name}: ${result.error}. Batch was not applied.`);
      }
      if (ctx.signal?.aborted || ctx.session.project !== before)
        throw new Error("The project changed or the request stopped. Batch was not applied.");
      await ctx.session.apply(() => draft.project, {
        label: a.label,
        source: ctx.source ?? "manual",
      });
      return { summary: `Applied ${a.operations.length} edit(s) as one undo step.` };
    },
  },
  {
    name: "relink_media",
    description:
      "Relink a missing source to its replacement local file. Preserves clip IDs, cuts and transcript; replacement must match media kind, video dimensions, audio presence and duration within one frame. Choose the original source, not different footage.",
    schema: relink,
    readOnly: false,
    irreversible: false,
    async run(ctx, raw) {
      const a = relink.parse(raw);
      const old = ownAsset(ctx.session.project, a.assetId);
      if (!old) throw new Error("Unknown media asset.");
      const path = await checkAllowedPath(a.path, ctx);
      const next = await probe(path, ctx.signal ? { signal: ctx.signal } : {});
      if (
        next.kind !== old.kind ||
        next.width !== old.width ||
        next.height !== old.height ||
        next.hasAudio !== old.hasAudio ||
        Math.abs(next.duration - old.duration) > 1 / (old.fps ?? 30)
      )
        throw new Error(
          "Choose the original media: replacement kind, dimensions, audio and duration must match.",
        );
      if (ctx.signal?.aborted) throw new Error("Cancelled. Nothing was changed.");
      await ctx.session.apply(
        (project) => {
          const updated = structuredClone(project);
          const asset = ownAsset(updated, a.assetId);
          if (!asset) throw new Error("Media changed before relinking.");
          asset.path = next.path;
          return updated;
        },
        { source: ctx.source ?? "manual", label: "Relink media" },
      );
      return { summary: "Media relinked. Existing edits and transcript preserved." };
    },
  },
  {
    name: "correct_transcript_word",
    description:
      "Correct one transcript word without changing source-time boundaries. Captions follow the correction. Read the transcript first and preserve the user's wording.",
    schema: correction,
    readOnly: false,
    irreversible: false,
    async run(ctx, raw) {
      const a = correction.parse(raw);
      if (ctx.signal?.aborted) throw new Error("Cancelled. Nothing was changed.");
      await ctx.session.apply(
        (project) => {
          const updated = structuredClone(project);
          const word = ownAsset(updated, a.assetId)?.transcript?.words[a.wordIndex];
          if (!word)
            throw new Error("Transcript word not found. Generate or reload the transcript first.");
          word.text = a.text;
          return updated;
        },
        { source: ctx.source ?? "manual", label: "Correct transcript word" },
      );
      return { summary: "Transcript corrected; source timing preserved." };
    },
  },
];
