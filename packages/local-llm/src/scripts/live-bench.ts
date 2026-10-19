#!/usr/bin/env node
/**
 * Live benchmark (needs network for the first download and a llama-server binary):
 * installs a catalog model through `LocalModelManager`, starts the server, sends real OpenAI-style
 * chat completions with tool definitions and prints load time, token speeds, RAM and whether the
 * model produced valid tool calls. Results go to stdout as JSON. Not part of the test suite.
 *
 *   DAX_LIVE_TESTS=1 DAX_LLAMA_SERVER=/path/to/llama-server \
 *     node dist/scripts/live-bench.js --model gemma-4-e2b-qat-q4_0 --data-dir /tmp/dax-live
 */
import { readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import os from "node:os";
import { parseArgs } from "node:util";
import { getModel } from "../catalog.js";
import { LocalModelManager } from "../manager.js";

const { values } = parseArgs({
  options: {
    model: { type: "string", default: "gemma-4-e2b-qat-q4_0" },
    "data-dir": { type: "string", default: ".dax-cache/local-llm" },
    runs: { type: "string", default: "5" },
    ctx: { type: "string" },
    threads: { type: "string" },
    "max-tokens": { type: "string", default: "300" },
    out: { type: "string" },
    "no-install": { type: "boolean", default: false },
  },
});

/** Editing tools shaped like the real command registry, so prompt sizes are realistic. */
const tools = [
  {
    type: "function",
    function: {
      name: "get_project",
      description: "Return the current project: clips, overlays, durations in seconds.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_silences",
      description:
        "Cut out silent parts of every clip. Times are seconds. Prefer this over manual trims.",
      parameters: {
        type: "object",
        properties: {
          thresholdDb: { type: "number", description: "Silence threshold, e.g. -35" },
          minDurationSec: { type: "number", description: "Shortest silence to remove, seconds" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trim_clip",
      description: "Trim a clip to the source range [start, end] in seconds.",
      parameters: {
        type: "object",
        properties: {
          clipId: { type: "string" },
          start: { type: "number", description: "Source time in seconds" },
          end: { type: "number", description: "Source time in seconds" },
        },
        required: ["clipId", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "split_clip",
      description: "Split a clip into two at a timeline time in seconds.",
      parameters: {
        type: "object",
        properties: { clipId: { type: "string" }, at: { type: "number" } },
        required: ["clipId", "at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_range",
      description: "Delete the timeline range [from, to) in seconds and close the gap.",
      parameters: {
        type: "object",
        properties: { from: { type: "number" }, to: { type: "number" } },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_overlay",
      description: "Add an animated text overlay at a timeline time.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          at: { type: "number", description: "Timeline time in seconds" },
          durationSec: { type: "number" },
          preset: { type: "string", enum: ["fade-in", "slide-up", "typewriter", "pop"] },
        },
        required: ["text", "at", "durationSec"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_clip_volume",
      description: "Set the volume of a clip, 0 (mute) to 2 (double).",
      parameters: {
        type: "object",
        properties: { clipId: { type: "string" }, volume: { type: "number" } },
        required: ["clipId", "volume"],
      },
    },
  },
] as const;

/** Prompts with the tool name and argument values a correct answer must contain. */
const cases = [
  { prompt: "Remove the silences from my video.", tool: "remove_silences", args: {} },
  {
    prompt: "Add the title 'Hello World' at 2 seconds for 3 seconds.",
    tool: "add_overlay",
    args: { text: "Hello World", at: 2, durationSec: 3 },
  },
  {
    prompt: "Delete everything between 10 and 15 seconds.",
    tool: "delete_range",
    args: { from: 10, to: 15 },
  },
  {
    prompt: "Split clip c1 at 12.5 seconds.",
    tool: "split_clip",
    args: { clipId: "c1", at: 12.5 },
  },
  { prompt: "Mute clip c2.", tool: "set_clip_volume", args: { clipId: "c2", volume: 0 } },
] as const;

const system =
  "You edit video by calling tools. Times are in seconds. Call exactly the tool that matches the request and do not explain.";

interface Timings {
  prompt_n?: number;
  prompt_ms?: number;
  prompt_per_second?: number;
  predicted_n?: number;
  predicted_ms?: number;
  predicted_per_second?: number;
}

/**
 * POST JSON with `node:http`. The global `fetch` gives up after 300 s without response headers,
 * which a non-streaming completion on a slow CPU can exceed; this has no such limit.
 */
function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: "POST", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) }));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

async function chat(baseUrl: string, apiKey: string | undefined, model: string, prompt: string) {
  const started = Date.now();
  const { status, json } = await postJson(
    `${baseUrl}/chat/completions`,
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    {
      model,
      temperature: 0,
      max_tokens: Number(values["max-tokens"]),
      tools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
  );
  return {
    json: json as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: { function: { name: string; arguments: string } }[];
        };
        finish_reason?: string;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      timings?: Timings;
    },
    wallMs: Date.now() - started,
    status,
  };
}

/** CPU seconds (user + system) the process has used so far; Linux only, `undefined` elsewhere. */
async function cpuSeconds(pid: number | undefined): Promise<number | undefined> {
  if (pid === undefined || process.platform !== "linux") return undefined;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    // Fields after the parenthesised command name; utime and stime are fields 14 and 15 (clock ticks).
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return (Number(fields[11]) + Number(fields[12])) / 100;
  } catch {
    return undefined;
  }
}

function matches(expected: Record<string, unknown>, actual: unknown): boolean {
  if (typeof actual !== "object" || actual === null) return Object.keys(expected).length === 0;
  const a = actual as Record<string, unknown>;
  return Object.entries(expected).every(([k, v]) =>
    typeof v === "string" ? String(a[k]).toLowerCase() === v.toLowerCase() : a[k] === v,
  );
}

const manager = new LocalModelManager({
  dataDir: values["data-dir"] as string,
  ...(values.threads ? { server: { threads: Number(values.threads) } } : {}),
});
const modelId = values.model as string;
const entry = getModel(modelId);

if (!values["no-install"]) {
  let last = 0;
  console.error(`Installing ${entry.name} (${entry.sizeBytes} bytes)...`);
  const t0 = Date.now();
  await manager.install(modelId, {
    onProgress: (p) => {
      if (Date.now() - last > 5000) {
        last = Date.now();
        console.error(
          `  ${p.part}/${p.step} ${(p.receivedBytes / 1e6).toFixed(0)} MB (${(p.bytesPerSecond / 1e6).toFixed(1)} MB/s) ${(p.fraction * 100).toFixed(1)}%`,
        );
      }
    },
  });
  console.error(`Installed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

if (process.env.DAX_LIVE_LOG) {
  manager.onEvent((e) => console.error(`[event] ${JSON.stringify(e).slice(0, 300)}`));
}
const handle = await manager.start({
  modelId,
  ...(values.ctx ? { contextSize: Number(values.ctx) } : {}),
});
const server = manager.serverProcess;
if (process.env.DAX_LIVE_LOG) server?.on("log", (line) => console.error(`[server] ${line}`));
const rssAfterLoad = await server?.memoryBytes();
// The API key travels in the environment (LLAMA_API_KEY); prove the real server enforces it.
const noKey = await fetch(`${handle.baseUrl}/models`);
const withKey = await fetch(`${handle.baseUrl}/models`, {
  headers: handle.apiKey ? { authorization: `Bearer ${handle.apiKey}` } : {},
});
const health = await fetch(`${handle.baseUrl.replace(/\/v1$/, "")}/health`);

const results: unknown[] = [];
let correct = 0;
let validCalls = 0;
for (let run = 0; run < Number(values.runs); run++) {
  const c = cases[run % cases.length] as (typeof cases)[number];
  const cpuBefore = await cpuSeconds(server?.serverPid);
  const { json, wallMs } = await chat(handle.baseUrl, handle.apiKey, handle.modelId, c.prompt);
  const cpuAfter = await cpuSeconds(server?.serverPid);
  const msg = json.choices?.[0]?.message;
  const call = msg?.tool_calls?.[0];
  let parsed: unknown;
  let valid = false;
  if (call) {
    try {
      parsed = JSON.parse(call.function.arguments);
      valid = true;
    } catch {
      valid = false;
    }
  }
  const ok = call?.function.name === c.tool && valid && matches(c.args, parsed);
  if (valid) validCalls++;
  if (ok) correct++;
  results.push({
    prompt: c.prompt,
    expected: c.tool,
    got: call?.function.name ?? null,
    arguments: call?.function.arguments ?? null,
    text: msg?.content ? msg.content.slice(0, 200) : null,
    reasoningChars: msg?.reasoning_content?.length ?? 0,
    finishReason: json.choices?.[0]?.finish_reason,
    ok,
    wallMs,
    // CPU time actually used by the server for this request. On a busy machine wall time is
    // inflated by other programs; CPU time shows the work done (about wall time x threads when idle).
    cpuSeconds:
      cpuBefore !== undefined && cpuAfter !== undefined
        ? Number((cpuAfter - cpuBefore).toFixed(2))
        : undefined,
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
    promptTokensPerSec: json.timings?.prompt_per_second,
    generationTokensPerSec: json.timings?.predicted_per_second,
  });
}
const rssAfterRequests = await server?.memoryBytes();

const summary = {
  model: modelId,
  loadAverageAtEnd: os.loadavg(),
  cpuThreads: os.availableParallelism(),
  serverThreads: values.threads ? Number(values.threads) : "default (all)",
  sizeBytes: entry.sizeBytes,
  contextSize: values.ctx ? Number(values.ctx) : entry.contextTokens,
  loadTimeMs: handle.loadTimeMs,
  auth: { withoutKey: noKey.status, withKey: withKey.status, health: health.status },
  rssAfterLoadMB: rssAfterLoad ? Math.round(rssAfterLoad / 1048576) : null,
  rssAfterRequestsMB: rssAfterRequests ? Math.round(rssAfterRequests / 1048576) : null,
  runs: results.length,
  correctToolCalls: correct,
  validJsonToolCalls: validCalls,
  results,
};
const text = JSON.stringify(summary, null, 2);
console.log(text);
if (values.out) await writeFile(values.out, text);
await manager.stop();
