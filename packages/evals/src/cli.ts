#!/usr/bin/env node
/**
 * Command-line entry for the evaluation harness.
 *
 *   pnpm eval --adapter oracle
 *
 * Exits non-zero if any task fails, so it can gate CI.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatSummary, summarize } from "./metrics.js";
import { OracleAdapter } from "./oracle.js";
import { type ModelAdapter, runSuite } from "./runner.js";
import { type EvalTask, EvalTaskSchema } from "./task.js";

/** Load and validate every `*.json` task file in `dir`, sorted by name. */
async function loadTasks(dir: string): Promise<EvalTask[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const tasks: EvalTask[] = [];
  for (const f of files) {
    tasks.push(EvalTaskSchema.parse(JSON.parse(await readFile(join(dir, f), "utf8"))));
  }
  return tasks;
}

/** Resolve an adapter by name. Real model adapters are added here as they are written. */
function makeAdapter(name: string): ModelAdapter {
  if (name === "oracle") return new OracleAdapter();
  throw new Error(`Unknown adapter "${name}". Available: oracle`);
}

const { values } = parseArgs({
  options: {
    adapter: { type: "string", default: "oracle" },
    tasks: { type: "string", default: "tasks" },
    out: { type: "string" },
    fixtures: { type: "string", default: ".dax-cache/fixtures" },
  },
});

const tasks = await loadTasks(resolve(values.tasks ?? "tasks"));
const adapter = makeAdapter(values.adapter ?? "oracle");
const records = await runSuite(adapter, tasks, { fixtureDir: resolve(values.fixtures ?? ".") });

for (const r of records) {
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.taskId}${r.failures.length ? `  -- ${r.failures.join("; ")}` : ""}`);
}
console.log(`\n${formatSummary(summarize(records))}`);

if (values.out) await writeFile(resolve(values.out), JSON.stringify(records, null, 2));
process.exit(records.every((r) => r.pass) ? 0 : 1);
