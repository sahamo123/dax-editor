// Runs eval tasks against a ModelAdapter and scores the results.

import {
  addAsset,
  appendClip,
  emptyProject,
  type Project,
  probe,
  Session,
  setAssetTranscript,
} from "@dax/core";
import { fixtureTranscript, generateFixture } from "./fixtures.js";
import type { RunRecord, ToolCallCounts } from "./metrics.js";
import { runChecks } from "./score.js";
import type { EvalTask, FixtureName } from "./task.js";

/**
 * The project a task starts from: the fixture on the main track, with its transcript when it has speech. The runner and
 * the checks tests both start here, so they see the same footage.
 */
export async function fixtureProject(
  name: FixtureName,
  dir: string,
  title: string,
): Promise<{ project: Project; assetId: string; fixturePath: string }> {
  const fixturePath = await generateFixture(name, dir);
  const asset = await probe(fixturePath);
  let project = appendClip(addAsset(emptyProject(title), asset), asset.id);
  const transcript = fixtureTranscript(name);
  if (transcript) project = setAssetTranscript(project, asset.id, transcript);
  return { project, assetId: asset.id, fixturePath };
}

/** What an adapter hands back after attempting a task. */
export interface AgentResult {
  turns: number;
  toolCalls: ToolCallCounts;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Everything an adapter needs to attempt a task. The adapter edits
 * `session`; the runner then scores `session.project`.
 */
export interface AgentContext {
  task: EvalTask;
  /** Starts with the fixture video already placed on the timeline. */
  session: Session;
  /** Id of the fixture asset inside the session's project. */
  assetId: string;
  /** Absolute path of the fixture file on disk. */
  fixturePath: string;
}

/**
 * A way of attempting tasks: a local model behind Ollama or llama.cpp, a
 * hosted API, or the deterministic oracle. Adding a model to the evals means
 * writing one of these.
 */
export interface ModelAdapter {
  /** Stable name used in reports, e.g. `ollama:gemma4-e4b`. */
  readonly id: string;
  /** Attempt `ctx.task` by editing `ctx.session`. May throw; the runner records the error. */
  run(ctx: AgentContext): Promise<AgentResult>;
}

/** Options shared by {@link runTask} and {@link runSuite}. */
export interface RunOptions {
  /** Directory where synthetic fixtures are cached. */
  fixtureDir: string;
}

/** Run one task with one adapter and score the result. Never throws: failures become records. */
export async function runTask(
  adapter: ModelAdapter,
  task: EvalTask,
  opts: RunOptions,
): Promise<RunRecord> {
  const { project, assetId, fixturePath } = await fixtureProject(
    task.fixture,
    opts.fixtureDir,
    task.id,
  );
  const session = new Session(project);

  let result: AgentResult = { turns: 0, toolCalls: { total: 0, invalid: 0 } };
  let error: string | undefined;
  // Time only the attempt: fixture generation and scoring (which renders video) are not model time,
  // and counting them would make tokens-per-second look worse than the model really is.
  const started = Date.now();
  try {
    result = await adapter.run({ task, session, assetId, fixturePath });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - started;

  const score = error
    ? { pass: false, failures: [`adapter error: ${error}`] }
    : await runChecks(session.project, task.checks);

  const record: RunRecord = {
    adapter: adapter.id,
    taskId: task.id,
    pass: score.pass,
    failures: score.failures,
    turns: result.turns,
    toolCalls: result.toolCalls,
    latencyMs,
  };
  if (result.inputTokens !== undefined) record.inputTokens = result.inputTokens;
  if (result.outputTokens !== undefined) record.outputTokens = result.outputTokens;
  if (error) record.error = error;
  return record;
}

/** Run every task in order and collect the records. */
export async function runSuite(
  adapter: ModelAdapter,
  tasks: EvalTask[],
  opts: RunOptions,
): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  for (const task of tasks) records.push(await runTask(adapter, task, opts));
  return records;
}
