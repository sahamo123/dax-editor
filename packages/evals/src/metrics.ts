// Records for individual eval runs and the summary numbers and table built from them.

/**
 * Tool calls a model made. `invalid` calls could not run because the call itself was wrong
 * (unreadable, unknown tool, bad arguments). The optional counts are filled by adapters built on the
 * agent loop: `failed` valid calls whose command reported a problem, `repaired` calls whose JSON or
 * value types had to be fixed (counted as valid), `fromText` calls the model wrote as text.
 */
export interface ToolCallCounts {
  total: number;
  invalid: number;
  failed?: number;
  repaired?: number;
  fromText?: number;
}

/** Everything recorded about one model attempting one task. */
export interface RunRecord {
  /** Which model/adapter produced this run, e.g. `oracle` or `ollama:gemma4-e4b`. */
  adapter: string;
  taskId: string;
  /** True when every check passed. */
  pass: boolean;
  /** Reasons for failure; empty when `pass` is true. */
  failures: string[];
  /** Number of model round trips used. */
  turns: number;
  /** Tool calls the model emitted, and how many were malformed or rejected. */
  toolCalls: ToolCallCounts;
  /** Token counts, only when the backend reported them for every round trip. */
  inputTokens?: number;
  outputTokens?: number;
  /** Wall-clock time of the model's attempt in milliseconds, excluding fixture generation and scoring. */
  latencyMs: number;
  /** Set when the attempt crashed instead of finishing. */
  error?: string;
}

/** Aggregate numbers for one adapter across a suite. */
export interface AdapterSummary {
  adapter: string;
  tasks: number;
  passed: number;
  /** Fraction of tasks passed, 0 to 1. */
  passRate: number;
  /** Median wall-clock time per task, in milliseconds. */
  medianLatencyMs: number;
  /** Mean model turns per task. */
  meanTurns: number;
  /** Tool calls made and how many were invalid. */
  toolCalls: number;
  invalidToolCalls: number;
  /** Fraction of tool calls that were invalid, 0 to 1; 0 when no calls were made. */
  invalidToolCallRate: number;
  /** Summed token counts, present only if every task reported them (a partial sum would flatter the model). */
  inputTokens?: number;
  outputTokens?: number;
  /** Output tokens divided by seconds, when token counts were reported. */
  outputTokensPerSec?: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Group records by adapter and compute the headline numbers for each. */
export function summarize(records: RunRecord[]): AdapterSummary[] {
  const byAdapter = new Map<string, RunRecord[]>();
  for (const r of records) {
    const list = byAdapter.get(r.adapter) ?? [];
    list.push(r);
    byAdapter.set(r.adapter, list);
  }

  return [...byAdapter.entries()].map(([adapter, rs]) => {
    const passed = rs.filter((r) => r.pass).length;
    const calls = rs.reduce((n, r) => n + r.toolCalls.total, 0);
    const invalid = rs.reduce((n, r) => n + r.toolCalls.invalid, 0);
    const withTokens = rs.filter((r) => r.outputTokens !== undefined);
    const tokens = withTokens.reduce((n, r) => n + (r.outputTokens ?? 0), 0);
    const seconds = withTokens.reduce((n, r) => n + r.latencyMs / 1000, 0);

    const summary: AdapterSummary = {
      adapter,
      tasks: rs.length,
      passed,
      passRate: passed / rs.length,
      medianLatencyMs: median(rs.map((r) => r.latencyMs)),
      meanTurns: rs.reduce((n, r) => n + r.turns, 0) / rs.length,
      toolCalls: calls,
      invalidToolCalls: invalid,
      invalidToolCallRate: calls === 0 ? 0 : invalid / calls,
    };
    if (rs.every((r) => r.inputTokens !== undefined && r.outputTokens !== undefined)) {
      summary.inputTokens = rs.reduce((n, r) => n + (r.inputTokens ?? 0), 0);
      summary.outputTokens = rs.reduce((n, r) => n + (r.outputTokens ?? 0), 0);
    }
    if (seconds > 0) summary.outputTokensPerSec = tokens / seconds;
    return summary;
  });
}

/** Render summaries as a Markdown table suitable for a PR comment or docs page. */
export function formatSummary(summaries: AdapterSummary[]): string {
  const header =
    "| Adapter | Pass | Median latency | Mean turns | Invalid tool calls | Tokens in/out | Out tok/s |\n" +
    "|---|---|---|---|---|---|---|";
  const rows = summaries.map((s) =>
    [
      s.adapter,
      `${s.passed}/${s.tasks} (${(s.passRate * 100).toFixed(0)}%)`,
      `${(s.medianLatencyMs / 1000).toFixed(1)} s`,
      s.meanTurns.toFixed(1),
      `${s.invalidToolCalls}/${s.toolCalls} (${(s.invalidToolCallRate * 100).toFixed(0)}%)`,
      s.inputTokens === undefined || s.outputTokens === undefined
        ? "n/a"
        : `${s.inputTokens}/${s.outputTokens}`,
      s.outputTokensPerSec === undefined ? "n/a" : s.outputTokensPerSec.toFixed(1),
    ].join(" | "),
  );
  return [header, ...rows.map((r) => `| ${r} |`)].join("\n");
}
