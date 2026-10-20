import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { formatSummary, type RunRecord, summarize } from "./metrics.js";
import { OracleAdapter } from "./oracle.js";
import { type ModelAdapter, runSuite, runTask } from "./runner.js";
import { type EvalTask, EvalTaskSchema } from "./task.js";

const taskDir = join(import.meta.dirname, "..", "tasks");
const tasks: EvalTask[] = readdirSync(taskDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => EvalTaskSchema.parse(JSON.parse(readFileSync(join(taskDir, f), "utf8"))));

const fixtureDir = mkdtempSync(join(tmpdir(), "dax-evals-"));
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

describe("task files", () => {
  it("are valid and have unique ids", () => {
    expect(tasks.length).toBeGreaterThan(0);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });
});

describe("oracle adapter (harness self-test, needs ffmpeg)", () => {
  it("passes every starter task", async () => {
    const records = await runSuite(new OracleAdapter(), tasks, { fixtureDir });
    const failed = records.filter((r) => !r.pass);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  }, 300_000);
});

describe("runner", () => {
  const first = tasks[0] as EvalTask;

  it("fails a do-nothing adapter", async () => {
    const lazy: ModelAdapter = {
      id: "lazy",
      run: async () => ({ turns: 1, toolCalls: { total: 0, invalid: 0 } }),
    };
    const r = await runTask(lazy, first, { fixtureDir });
    expect(r.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThan(0);
  }, 60_000);

  it("records an adapter crash instead of throwing", async () => {
    const broken: ModelAdapter = {
      id: "broken",
      run: async () => {
        throw new Error("model server unreachable");
      },
    };
    const r = await runTask(broken, first, { fixtureDir });
    expect(r.pass).toBe(false);
    expect(r.error).toBe("model server unreachable");
  }, 60_000);
});

describe("metrics", () => {
  const base: Omit<RunRecord, "taskId" | "pass"> = {
    adapter: "m",
    failures: [],
    turns: 2,
    toolCalls: { total: 4, invalid: 1 },
    latencyMs: 2000,
    outputTokens: 100,
  };

  it("summarises pass rate, invalid-call rate and speed", () => {
    const [s] = summarize([
      { ...base, taskId: "a", pass: true },
      { ...base, taskId: "b", pass: false },
    ]);
    expect(s).toMatchObject({ adapter: "m", tasks: 2, passed: 1, passRate: 0.5 });
    expect(s?.invalidToolCallRate).toBeCloseTo(0.25);
    expect(s?.outputTokensPerSec).toBeCloseTo(50);
  });

  it("formats a markdown table", () => {
    const table = formatSummary(summarize([{ ...base, taskId: "a", pass: true }]));
    expect(table).toContain("| Adapter |");
    expect(table).toContain("1/1 (100%)");
    expect(table).toContain("1/4 (25%)");
  });
});
