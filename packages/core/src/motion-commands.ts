// Generated motion assets enter the same registry/history as other media, with regeneration metadata.
import { z } from "zod";
import type { CommandDef } from "./commands.js";
import { checkAllowedPath } from "./connector.js";
import { probe } from "./media.js";
import { MotionRequestSchema } from "./motion.js";
import { addAsset, appendClip, ownAsset } from "./timeline.js";

/** Bounded motion templates, shared by all editor front doors. */
export const MOTION_COMMANDS: readonly CommandDef[] = [
  {
    name: "list_motion_templates",
    description:
      "Check optional Blender availability and list title-card, logo-intro and text-3d templates. These render an asset; FFmpeg still exports the final edit.",
    schema: z.object({}),
    readOnly: true,
    irreversible: false,
    async run(ctx) {
      const status = ctx.motion
        ? await ctx.motion.status()
        : { available: false, detail: "Blender rendering is unavailable in this build." };
      return {
        summary: status.detail,
        data: {
          templates: ["title-card", "logo-intro", "text-3d"],
          ...status,
        },
      };
    },
  },
  {
    name: "render_motion_template",
    description:
      "Render a controlled Blender title-card, logo-intro or text-3d animation and add its video to the timeline. Requires installed Blender. Text and colors are data; no custom scripts. Keep defaults for a low-resource preview. replaceAssetId regenerates a previous Blender asset with matching duration.",
    schema: MotionRequestSchema,
    readOnly: false,
    irreversible: false,
    async run(ctx, raw) {
      const a = MotionRequestSchema.parse(raw);
      if (!ctx.motion)
        throw new Error("Blender rendering is unavailable. Install Blender and check its setup.");
      if (a.template === "logo-intro") {
        if (!a.logoPath) throw new Error("Choose a PNG or JPG logo first.");
        await checkAllowedPath(a.logoPath, ctx);
        const image = await probe(a.logoPath, ctx.signal ? { signal: ctx.signal } : {});
        if (image.kind !== "image" || (image.width ?? 0) > 4096 || (image.height ?? 0) > 4096)
          throw new Error("Choose a PNG/JPG image no larger than 4096 pixels per side.");
      }
      const path = await ctx.motion.render(a, {
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(ctx.onProgress ? { onProgress: ctx.onProgress } : {}),
      });
      await checkAllowedPath(path, ctx);
      const asset = await probe(path, ctx.signal ? { signal: ctx.signal } : {});
      if (ctx.signal?.aborted) throw new Error("Cancelled. Nothing was changed.");
      if (asset.kind !== "video") throw new Error("Blender did not produce a video asset.");
      const { replaceAssetId, ...parameters } = a;
      asset.generation = { kind: "blender", parameters };
      await ctx.session.apply(
        (project) => {
          if (!replaceAssetId) return appendClip(addAsset(project, asset), asset.id);
          const old = ownAsset(project, replaceAssetId);
          if (
            old?.generation?.kind !== "blender" ||
            Math.abs(old.duration - asset.duration) > 1 / a.fps
          )
            throw new Error(
              "Regeneration requires an existing Blender asset with matching duration.",
            );
          const updated = structuredClone(project);
          updated.assets[replaceAssetId] = { ...asset, id: replaceAssetId };
          return updated;
        },
        {
          label: replaceAssetId ? "Regenerate Blender template" : "Add Blender template",
          source: ctx.source ?? "manual",
        },
      );
      return {
        summary: "Blender template rendered and added to the project.",
        data: { assetId: replaceAssetId ?? asset.id },
      };
    },
  },
];
