// A deterministic solver used to validate the harness. It is not a model.

import {
  analyzeAudio,
  applyCutPlan,
  deleteRange,
  detectSilence,
  keepRanges,
  ownAsset,
  padSilences,
  planCuts,
  probe,
  removeAssetRanges,
} from "@dax/core";
import type { AgentContext, AgentResult, ModelAdapter } from "./runner.js";

/**
 * A hand-written solver that knows each task by id. It involves no language
 * model, so it measures nothing about intelligence. Its job is to prove the
 * harness works (fixtures, scoring, reporting) and to show the best score any
 * model could reach. If the oracle fails a task, the task or checker is broken.
 */
export class OracleAdapter implements ModelAdapter {
  readonly id = "oracle";

  /** Apply the known-good edit for `ctx.task.id`; throws for ids it does not know. */
  async run(ctx: AgentContext): Promise<AgentResult> {
    const { session, assetId, fixturePath, task } = ctx;
    const asset = await probe(fixturePath);

    switch (task.id) {
      case "remove-silences":
      case "drift-sixty-joins": {
        // Every pause is silence here, so cutting them all is right; 60 pauses make 60 joins.
        const silences = padSilences(await detectSilence(fixturePath, asset.duration), 0.1);
        await session.apply((p) => removeAssetRanges(p, assetId, silences));
        break;
      }
      case "keep-first-3-seconds":
        await session.apply((p) => keepRanges(p, [{ start: 0, end: 3 }]));
        break;
      case "delete-middle-2s":
        await session.apply((p) => deleteRange(p, 2, 4));
        break;
      case "music-bed-gap-preserved":
        // Nothing to do. The gaps hold only the music bed, which is not silence, so the right edit keeps them.
        break;
      case "word-tails-kept":
      case "retake-proposal-only": {
        // The planner's approved cuts: pauses shortened with each word's tail kept, and retakes left as proposals
        // (applyCutPlan applies only approved decisions by default).
        const levels = await analyzeAudio(fixturePath);
        const words = ownAsset(session.project, assetId)?.transcript?.words ?? [];
        const plan = planCuts({
          assetId,
          duration: asset.duration,
          words,
          levels,
          preset: "standard",
        });
        await session.apply((p) => applyCutPlan(p, plan));
        break;
      }
      default:
        throw new Error(`oracle has no solution for task "${task.id}"`);
    }
    return { turns: 1, toolCalls: { total: 1, invalid: 0 } };
  }
}
