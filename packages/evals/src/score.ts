// Evaluates a task's checks against a finished edit.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectSilence,
  exportProject,
  mainClips,
  type Project,
  probe,
  timelineDuration,
} from "@dax/core";
import type { Check } from "./task.js";

/** Outcome of running a task's checks. */
export interface ScoreResult {
  /** True only if every check passed. */
  pass: boolean;
  /** One human-readable line per failed check. */
  failures: string[];
}

/**
 * Evaluate `checks` against the finished edit. Checks that need the actual
 * picture or sound (such as silence) render the project to a temporary file
 * first, so they are slower than pure timeline checks.
 */
export async function runChecks(project: Project, checks: Check[]): Promise<ScoreResult> {
  const failures: string[] = [];

  for (const check of checks) {
    switch (check.type) {
      case "duration": {
        const d = timelineDuration(project);
        if (d < check.min || d > check.max) {
          failures.push(`duration ${d.toFixed(2)}s is outside [${check.min}, ${check.max}]`);
        }
        break;
      }
      case "clipCount": {
        const n = mainClips(project).length;
        if (check.min !== undefined && n < check.min)
          failures.push(`${n} clips, wanted >= ${check.min}`);
        if (check.max !== undefined && n > check.max)
          failures.push(`${n} clips, wanted <= ${check.max}`);
        break;
      }
      case "noSilenceLongerThan": {
        const found = await silencesInRender(project, check.seconds);
        if (found > 0) {
          failures.push(
            `output still has ${found} silent stretch(es) of ${check.seconds}s or more`,
          );
        }
        break;
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Render to a temp file and count silences of at least `minSeconds`. */
async function silencesInRender(project: Project, minSeconds: number): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "dax-eval-"));
  try {
    const out = join(dir, "out.mp4");
    await exportProject(project, out);
    const asset = await probe(out);
    const silences = await detectSilence(out, asset.duration, { minDuration: minSeconds });
    return silences.length;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
