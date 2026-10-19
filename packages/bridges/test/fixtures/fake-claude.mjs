// A stand-in for the `claude` executable, used by the bridge tests. It needs no network and no real Claude Code.
// A launcher script (written by src/test/fake-cli.ts) sets `globalThis.__FAKE_SCENARIO__` and imports this file.
//
// It answers `--version`, `--help` and `auth status` like the real CLI, and for a print-mode run it behaves like one:
// it reads the config file given to `--mcp-config`, expands `${DAX_MCP_TOKEN}` from its environment, really connects
// to that MCP endpoint (so the bridge's server, token and Host/Origin checks are exercised), prints stream-json lines,
// and can call tools. Every invocation appends one JSON line to `scenario.callsFile` so tests can inspect what was passed.

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const scenario = globalThis.__FAKE_SCENARIO__ ?? {};
const args = process.argv.slice(2);
const SESSION_ID = scenario.sessionId ?? "00000000-0000-4000-8000-0000000000aa";

/** Print one stream-json line. */
function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/** Sleep for `ms`. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Append what this invocation received, for the test to read. */
function record(entry) {
  if (scenario.callsFile) appendFileSync(scenario.callsFile, `${JSON.stringify(entry)}\n`);
}

/** Read all of stdin as text. */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** The value after a flag, or undefined. */
function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// ---- the three quick commands ----

if (args[0] === "--version") {
  record({ mode: "version", envKeys: Object.keys(process.env) });
  process.stdout.write(`${scenario.version ?? "2.1.302 (Claude Code)"}\n`);
  process.exit(0);
}

if (args[0] === "--help") {
  record({ mode: "help", envKeys: Object.keys(process.env) });
  const flags = scenario.helpFlags ?? [
    "--output-format <format>   (choices: text, json, stream-json)",
    "--include-partial-messages",
    "--mcp-config <configs...>",
    "--strict-mcp-config",
    "--allowedTools, --allowed-tools <tools...>",
    "--tools <tools...>",
    '--permission-mode <mode>   (choices: "acceptEdits", "auto", "dontAsk", "plan")',
    "--permission-prompts <target>",
    "--disable-slash-commands",
  ];
  process.stdout.write(
    `Usage: claude [options]\n\nOptions:\n${flags.map((f) => `  ${f}`).join("\n")}\n`,
  );
  process.exit(0);
}

if (args[0] === "auth" && args[1] === "status") {
  record({
    mode: "auth",
    envKeys: Object.keys(process.env),
    env: pick(process.env, scenario.recordEnv),
  });
  if (scenario.authDelayMs) await sleep(scenario.authDelayMs);
  const auth = scenario.auth ?? { exit: 0, stdout: { loggedIn: true, authMethod: "claude.ai" } };
  const out =
    typeof auth.stdout === "string" ? auth.stdout : JSON.stringify(auth.stdout ?? {}, null, 2);
  process.stdout.write(`${out}\n`);
  process.exit(auth.exit ?? 0);
}

// `codex login status`, for the Codex detection tests (the same script stands in for either CLI).
if (args[0] === "login" && args[1] === "status") {
  record({ mode: "login", envKeys: Object.keys(process.env) });
  process.stdout.write(`${scenario.loginText ?? "Not logged in"}\n`);
  process.exit(scenario.loginExit ?? 0);
}

/** A subset of an object, for recording selected environment variables. */
function pick(obj, names = []) {
  return Object.fromEntries(names.filter((n) => obj[n] !== undefined).map((n) => [n, obj[n]]));
}

// ---- a print-mode run ----

const prompt = await readStdin();
const mcpConfigPath = flagValue("--mcp-config");
const systemPromptPath = flagValue("--append-system-prompt-file");
const configText =
  mcpConfigPath && existsSync(mcpConfigPath) ? readFileSync(mcpConfigPath, "utf8") : undefined;
record({
  mode: "run",
  args,
  prompt,
  cwd: process.cwd(),
  envKeys: Object.keys(process.env),
  env: pick(process.env, scenario.recordEnv),
  token: process.env.DAX_MCP_TOKEN,
  pid: process.pid,
  configText,
  systemPrompt:
    systemPromptPath && existsSync(systemPromptPath)
      ? readFileSync(systemPromptPath, "utf8")
      : undefined,
});

if (scenario.ignoreSigterm) process.on("SIGTERM", () => undefined);
else if (scenario.sigtermMarker) {
  // Leave proof that SIGTERM (and not something harsher) is what ended the process.
  process.on("SIGTERM", () => {
    writeFileSync(scenario.sigtermMarker, "SIGTERM");
    process.exit(143);
  });
}
if (scenario.exitBeforeInit !== undefined) process.exit(scenario.exitBeforeInit);
if (scenario.resumeFails && flagValue("--resume")) {
  emit({
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    num_turns: 0,
    session_id: flagValue("--resume"),
    usage: {},
    permission_denials: [],
  });
  process.stderr.write(`No conversation found with session ID: ${flagValue("--resume")}\n`);
  process.exit(1);
}

// Connect to the MCP endpoint the way the real CLI does: expand ${VAR} in the headers, then speak MCP.
// (Imported only here: the quick commands above must start fast, as the real ones do.)
const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
let client;
let mcpStatus = "failed";
let toolNames = [];
if (configText && scenario.connect !== false) {
  try {
    const config = JSON.parse(configText).mcpServers.dax;
    const expand = (s) => s.replace(/\$\{(\w+)\}/g, (_m, name) => process.env[name] ?? "");
    const headers = Object.fromEntries(
      Object.entries(config.headers ?? {}).map(([k, v]) => [k, expand(String(v))]),
    );
    client = new Client({ name: "fake-claude", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } }),
    );
    toolNames = (await client.listTools()).tools.map((t) => `mcp__dax__${t.name}`);
    mcpStatus = "connected";
  } catch (err) {
    process.stderr.write(
      `mcp connect failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    client = undefined;
  }
}

emit({
  type: "system",
  subtype: "init",
  session_id: SESSION_ID,
  tools: toolNames,
  mcp_servers: [{ name: "dax", status: scenario.forceMcpStatus ?? mcpStatus }],
  model: "fake-model",
  apiKeySource: scenario.apiKeySource ?? "none",
  claude_code_version: "2.1.302",
});

let turns = 0;
let messageCounter = 0;
let toolCounter = 0;

/** Run one step of the scenario script. */
async function step(s) {
  if (s.sleep) await sleep(s.sleep);
  else if (s.hang) {
    // Stay alive until a signal arrives (an unresolved promise alone would let Node exit).
    setInterval(() => undefined, 1000);
    await new Promise(() => undefined);
  } else if (s.recordTools) record({ mode: "tools", tools: toolNames, envKeys: [] });
  else if (s.stderr) process.stderr.write(`${s.stderr}\n`);
  else if (s.leakTokenToStderr)
    process.stderr.write(`debug: Authorization: Bearer ${process.env.DAX_MCP_TOKEN}\n`);
  else if (s.leakTokenToText) {
    const id = `msg_${++messageCounter}`;
    emit({
      type: "assistant",
      message: {
        id,
        role: "assistant",
        content: [{ type: "text", text: `my token is ${process.env.DAX_MCP_TOKEN}` }],
      },
      parent_tool_use_id: null,
      session_id: SESSION_ID,
    });
  } else if (s.emit) emit(s.emit);
  else if (s.replay) {
    // Replay a recorded fixture, re-stamped with this run's session id.
    const dir = scenario.fixtureDir;
    for (const line of readFileSync(join(dir, s.replay), "utf8").trim().split("\n")) {
      emit({ ...JSON.parse(line), session_id: SESSION_ID });
    }
  } else if (s.text !== undefined) {
    turns += 1;
    const id = `msg_${++messageCounter}`;
    for (const piece of s.stream ? s.text.split(" ") : []) {
      emit({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: `${piece} ` },
        },
        parent_tool_use_id: null,
        session_id: SESSION_ID,
        api_message_id: id,
      });
    }
    emit({
      type: "assistant",
      message: { id, role: "assistant", content: [{ type: "text", text: s.text }] },
      parent_tool_use_id: null,
      session_id: SESSION_ID,
    });
  } else if (s.callTool) {
    turns += 1;
    const toolId = `toolu_${++toolCounter}`;
    emit({
      type: "assistant",
      message: {
        id: `msg_${++messageCounter}`,
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: toolId,
            name: `mcp__dax__${s.callTool.name}`,
            input: s.callTool.args ?? {},
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: SESSION_ID,
    });
    let text;
    let isError = false;
    if (!client) {
      text = "Error: no such tool";
      isError = true;
    } else {
      const res = await client.callTool({
        name: s.callTool.name,
        arguments: s.callTool.args ?? {},
      });
      isError = res.isError === true;
      text = JSON.stringify(res.structuredContent ?? {});
      if (isError) text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
    }
    emit({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolId,
            content: text,
            ...(isError ? { is_error: true } : {}),
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: SESSION_ID,
    });
  } else if (s.result) {
    emit({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: turns + 1,
      result: "ok",
      session_id: SESSION_ID,
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 0,
        output_tokens: 5,
      },
      permission_denials: [],
      ...s.result,
    });
  } else if (s.spawnGrandchild) {
    // A helper process in the same process group, like an MCP server the real CLI would start.
    const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], {
      stdio: "ignore",
    });
    if (scenario.grandchildPidFile) appendFileSync(scenario.grandchildPidFile, `${child.pid}\n`);
  } else if (s.exit !== undefined) {
    process.exit(s.exit);
  }
}

for (const s of scenario.run ?? []) await step(s);
await client?.close().catch(() => undefined);
process.exit(scenario.exitCode ?? 0);
