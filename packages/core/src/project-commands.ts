// Source recovery and word correction are registry edits, shared by manual UI, AI, CLI and MCP.
import { z } from "zod";
import type { CommandDef } from "./commands.js";
import { checkAllowedPath } from "./connector.js";
import { probe } from "./media.js";
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
