#!/usr/bin/env node
/**
 * Command-line entry for the evaluation harness.
 *
 *   pnpm eval --adapter oracle
 *   pnpm eval --adapter openai --base-url http://127.0.0.1:8080/v1 --model qwen2.5-7b-instruct
 *   pnpm eval --adapter openai --base-url https://openrouter.ai/api/v1 --model some/model --api-key-env OPENROUTER_API_KEY
 *   pnpm eval --adapter anthropic --model <model-id>          (key from ANTHROPIC_API_KEY)
 *
 * Exits 1 if any task fails, 2 if the options are wrong, so it can gate CI.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type AdapterOptions, makeAdapter } from "./adapters.js";
import { formatSummary, type RunRecord, summarize } from "./metrics.js";
import { runSuite } from "./runner.js";
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

/** One line per task: verdict plus what the model cost and how well it called tools. */
function describeRecord(r: RunRecord): string {
  const mark = r.pass ? "PASS" : "FAIL";
  const calls = r.toolCalls;
  const parts = [`${r.turns} turn(s)`, `${calls.total} call(s)`, `${calls.invalid} invalid`];
  if (calls.repaired) parts.push(`${calls.repaired} repaired`);
  if (calls.fromText) parts.push(`${calls.fromText} from text`);
  parts.push(
    r.inputTokens !== undefined && r.outputTokens !== undefined
      ? `${r.inputTokens} in / ${r.outputTokens} out tokens`
      : "tokens n/a",
  );
  const why = r.failures.length ? `  -- ${r.failures.join("; ")}` : "";
  return `${mark}  ${r.taskId}  [${parts.join(", ")}]${why}`;
}

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        adapter: { type: "string", default: "oracle" },
        "base-url": { type: "string" },
        model: { type: "string" },
        "api-key-env": { type: "string" },
        temperature: { type: "string" },
        "tool-style": { type: "string" },
        "max-tokens": { type: "string" },
        "timeout-sec": { type: "string" },
        tasks: { type: "string", default: "tasks" },
        out: { type: "string" },
        fixtures: { type: "string", default: ".dax-cache/fixtures" },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
})();

function numberOption(name: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`--${name} must be a positive number, got "${text}"`);
    process.exit(2);
  }
  return n;
}

const adapterOptions: AdapterOptions = {
  adapter: values.adapter ?? "oracle",
  baseUrl: values["base-url"],
  model: values.model,
  apiKeyEnv: values["api-key-env"],
  temperature: values.temperature,
  toolStyle: values["tool-style"],
  maxTokens: numberOption("max-tokens", values["max-tokens"]),
  timeoutSec: numberOption("timeout-sec", values["timeout-sec"]),
};

let adapter: ReturnType<typeof makeAdapter>;
try {
  adapter = makeAdapter(adapterOptions);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

const tasks = await loadTasks(resolve(values.tasks ?? "tasks"));
console.log(`adapter ${adapter.id}, ${tasks.length} task(s)\n`);
const records = await runSuite(adapter, tasks, { fixtureDir: resolve(values.fixtures ?? ".") });

for (const r of records) console.log(describeRecord(r));
for (const r of records) if (r.error) console.log(`\n${r.taskId}: ${r.error}`);
console.log(`\n${formatSummary(summarize(records))}`);

if (values.out) await writeFile(resolve(values.out), JSON.stringify(records, null, 2));
process.exit(records.every((r) => r.pass) ? 0 : 1);
