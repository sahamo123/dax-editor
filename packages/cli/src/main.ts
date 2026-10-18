// The dax command line: dispatches subcommands, runs core commands on a project file, and prints human or JSON results.
// Every edit goes through the core command registry (`tryRunCommand`), the same path the app, the agent and MCP use.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type CommandResult,
  CUT_PRESET_NAMES,
  commandTools,
  emptyProject,
  getCommand,
  Session,
  type ToolSpec,
  tryRunCommand,
} from "@dax/core";
import { normalizeArgv, parseCommand, str, USAGE } from "./args.js";
import { CliError, type CliIo, EXIT, type ExitCode, processIo } from "./io.js";
import { openProject, projectNameFromFile, resolveProjectFile } from "./project.js";
import { runServe } from "./serve.js";
import { CLI_VERSION } from "./version.js";

/** What a subcommand produces: text for people and the same facts as a JSON document for programs. */
interface Output {
  text: string;
  json: Record<string, unknown>;
}

/** Shared state for one invocation. */
interface Invocation {
  io: CliIo;
  /** True when `--json` was given: print one JSON document instead of text. */
  json: boolean;
}

/** The project file for this invocation: `--project`/`-p` if given, else the usual discovery. */
function projectFile(inv: Invocation, values: { project?: unknown }): string {
  return resolveProjectFile(inv.io, str(values.project));
}

/** Run a core command on a session, turning failure into a {@link CliError}. */
async function execute(
  session: Session,
  name: string,
  args: unknown,
  onProgress?: (fraction: number) => void,
): Promise<CommandResult> {
  if (!getCommand(name)) {
    throw new CliError(
      `Unknown command "${name}". Run "dax commands" to see them all.`,
      EXIT.usage,
    );
  }
  // The CLI is the user's own shell, so no folder restrictions: allowedRoots stays unset on purpose.
  const outcome = await tryRunCommand(
    { session, source: "manual", ...(onProgress ? { onProgress } : {}) },
    name,
    args,
  );
  if (!outcome.ok) throw new CliError(outcome.error, EXIT.failure);
  // Edits save themselves, but a few commands (save_checkpoint) only change the in-memory history; write it out so
  // the next invocation, which starts from the files, sees it.
  if (!getCommand(name)?.readOnly) await session.save();
  return outcome.data === undefined
    ? { summary: outcome.summary }
    : { summary: outcome.summary, data: outcome.data };
}

/** JSON for stdout, one document and a newline. */
function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The first sentence of a description, trimmed to fit a table. */
function firstSentence(text: string, max = 78): string {
  const end = text.search(/[.!?](\s|$)/);
  const sentence = (end >= 0 ? text.slice(0, end + 1) : text).replace(/\s+/g, " ");
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

/** Flags shown beside a command name. */
function flags(spec: ToolSpec): string {
  return [spec.readOnly ? "read-only" : "", spec.irreversible ? "irreversible" : ""]
    .filter(Boolean)
    .join(", ");
}

/** The arguments of a command as lines of text, from its JSON Schema. */
function describeArguments(spec: ToolSpec): string[] {
  const schema = spec.parameters as {
    properties?: Record<
      string,
      { type?: string | string[]; description?: string; enum?: unknown[] }
    >;
    required?: string[];
  };
  const entries = Object.entries(schema.properties ?? {});
  if (entries.length === 0) return ["  (no arguments)"];
  return entries.map(([name, p]) => {
    const type = p.enum
      ? p.enum.map(String).join("|")
      : Array.isArray(p.type)
        ? p.type.join("|")
        : (p.type ?? "any");
    const required = schema.required?.includes(name) ? "" : "?";
    return `  ${name}${required}: ${type}${p.description ? `  ${p.description}` : ""}`;
  });
}

// ---------------------------------------------------------------- dax commands

async function cmdCommands(_inv: Invocation, argv: string[]): Promise<Output> {
  const { values, positionals } = parseCommand(argv, { "read-only": { type: "boolean" } });
  const tools = commandTools(values["read-only"] ? { readOnlyOnly: true } : undefined);
  const wanted = positionals[0];
  if (wanted) {
    const spec = tools.find((t) => t.name === wanted);
    if (!spec)
      throw new CliError(
        `Unknown command "${wanted}". Run "dax commands" to see them all.`,
        EXIT.usage,
      );
    const header = flags(spec) ? `${spec.name}  [${flags(spec)}]` : spec.name;
    return {
      text: `${header}\n${spec.description}\n\nArguments (? = optional):\n${describeArguments(spec).join("\n")}\n`,
      json: { ok: true, command: spec },
    };
  }
  const width = Math.max(...tools.map((t) => t.name.length));
  const lines = tools.map((t) => {
    const tag = flags(t);
    return `${t.name.padEnd(width)}  ${firstSentence(t.description)}${tag ? `  [${tag}]` : ""}`;
  });
  return {
    text: `${lines.join("\n")}\n\n${tools.length} commands. "dax commands <name>" shows one command's arguments.\n`,
    json: { ok: true, commands: tools },
  };
}

// ---------------------------------------------------------------- dax run

/** Parse the `--args` value (JSON text, or "-" for stdin) into an object. */
async function readArgs(inv: Invocation, raw: string | undefined): Promise<unknown> {
  if (raw === undefined) return {};
  const text = raw === "-" ? await inv.io.readStdin() : raw;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new CliError(
      `The arguments must be a JSON object, for example --json '{"from":1,"to":2}'. Got: ${text.slice(0, 80)}`,
      EXIT.usage,
    );
  }
}

/** Render a command's result for people: the summary, then its structured data if it has any. */
function commandText(result: CommandResult): string {
  const data = result.data === undefined ? "" : `${JSON.stringify(result.data, null, 2)}\n`;
  return `${result.summary}\n${data}`;
}

async function cmdRun(inv: Invocation, argv: string[]): Promise<Output> {
  const { values, positionals } = parseCommand(argv, { args: { type: "string" } });
  const name = positionals[0];
  if (!name)
    throw new CliError(
      "Usage: dax run <command> [--json '{...}']. See \"dax commands\".",
      EXIT.usage,
    );
  if (positionals.length > 1) {
    throw new CliError(
      `Unexpected argument "${positionals[1]}". Pass command arguments as JSON with --json or --args.`,
      EXIT.usage,
    );
  }
  const args = await readArgs(inv, str(values.args));
  const def = getCommand(name);
  if (!def)
    throw new CliError(
      `Unknown command "${name}". Run "dax commands" to see them all.`,
      EXIT.usage,
    );
  const file = projectFile(inv, values);
  const session = await openProject(file, !def.readOnly);
  const showProgress = def.irreversible && !inv.json && inv.io.stderrIsTTY;
  const result = await withProgress(inv, showProgress, (onProgress) =>
    execute(session, name, args, onProgress),
  );
  return {
    text: commandText(result),
    json: { ok: true, command: name, project: file, ...result },
  };
}

/** Run `fn`, drawing a "NN%" line on stderr while it reports progress (only when `enabled`). */
async function withProgress<T>(
  inv: Invocation,
  enabled: boolean,
  fn: (onProgress: ((fraction: number) => void) | undefined) => Promise<T>,
): Promise<T> {
  if (!enabled) return fn(undefined);
  let last = -1;
  try {
    return await fn((fraction) => {
      const pct = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
      if (pct === last) return;
      last = pct;
      inv.io.stderr(`\rWorking... ${pct}%`);
    });
  } finally {
    if (last >= 0) inv.io.stderr("\n");
  }
}

// ---------------------------------------------------------------- dax project

/** Loose view of get_project's data, enough to print a readable summary. */
interface ProjectView {
  name: string;
  format: string;
  duration: number;
  assets: Array<{ id: string; file: string; kind: string; duration: number; hasAudio: boolean }>;
  clips: Array<{
    id: string;
    assetId: string;
    start: number;
    end: number;
    sourceIn: number;
    sourceOut: number;
  }>;
  overlays: Array<{ id: string; start: number; end: number; text: string }>;
}

function projectText(p: ProjectView, file: string): string {
  const lines = [
    `${p.name}  (${p.format})`,
    `File: ${file}`,
    `Duration ${p.duration}s, ${p.clips.length} clip(s), ${p.overlays.length} overlay(s), ${p.assets.length} asset(s)`,
  ];
  if (p.assets.length) {
    lines.push("", "Assets:");
    for (const a of p.assets) {
      lines.push(
        `  ${a.id}  ${a.file}  ${a.kind}  ${a.duration}s${a.hasAudio ? "" : "  (no audio)"}`,
      );
    }
  }
  if (p.clips.length) {
    lines.push("", "Clips:");
    for (const c of p.clips) {
      lines.push(
        `  ${c.id}  ${c.start}s-${c.end}s  (asset ${c.assetId} ${c.sourceIn}s-${c.sourceOut}s)`,
      );
    }
  }
  if (p.overlays.length) {
    lines.push("", "Overlays:");
    for (const o of p.overlays) lines.push(`  ${o.id}  ${o.start}s-${o.end}s  "${o.text}"`);
  }
  return `${lines.join("\n")}\n`;
}

async function cmdProject(inv: Invocation, argv: string[]): Promise<Output> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "new") {
    const { values, positionals } = parseCommand(rest, {
      name: { type: "string" },
      force: { type: "boolean" },
    });
    const file = resolveProjectFile(inv.io, positionals[0] ?? str(values.project));
    if (existsSync(file) && !values.force) {
      throw new CliError(`${file} already exists. Use --force to replace it.`, EXIT.failure);
    }
    const name = str(values.name) ?? projectNameFromFile(file);
    // A fresh Session (not Session.open, which would reopen an existing file) writes the empty project and its history.
    await new Session(emptyProject(name), file).save();
    return { text: `Created ${file}\n`, json: { ok: true, project: file, name } };
  }
  if (sub === "show") {
    const { values, positionals } = parseCommand(rest, { full: { type: "boolean" } });
    const file = resolveProjectFile(inv.io, positionals[0] ?? str(values.project));
    if (!existsSync(file)) {
      throw new CliError(
        `No project file at ${file}. Create one with "dax project new".`,
        EXIT.project,
      );
    }
    const session = await openProject(file, false);
    if (values.full) {
      return {
        text: toJson(session.project),
        json: { ok: true, project: file, full: session.project },
      };
    }
    const result = await execute(session, "get_project", {});
    return {
      text: projectText(result.data as ProjectView, file),
      json: { ok: true, project: file, ...result },
    };
  }
  throw new CliError("Usage: dax project new [file] | dax project show [file]", EXIT.usage);
}

// ---------------------------------------------------------------- dax import / cut / export

async function cmdImport(inv: Invocation, argv: string[]): Promise<Output> {
  const { values, positionals } = parseCommand(argv, {});
  if (positionals.length === 0) throw new CliError("Usage: dax import <video...>", EXIT.usage);
  const file = projectFile(inv, values);
  const session = await openProject(file, true);
  const results: Array<{ path: string; summary: string; data?: unknown }> = [];
  const lines: string[] = [];
  for (const path of positionals) {
    // Stop at the first failure: earlier imports are already saved, later ones are not attempted.
    const r = await execute(session, "import_media", { path: pathFromCwd(inv, path) });
    results.push({ path, ...r });
    lines.push(r.summary);
  }
  return { text: `${lines.join("\n")}\n`, json: { ok: true, project: file, imported: results } };
}

/** An absolute path for a user-typed path, relative to the invocation's folder. */
function pathFromCwd(inv: Invocation, p: string): string {
  return resolve(inv.io.cwd, p);
}

async function cmdCut(inv: Invocation, argv: string[]): Promise<Output> {
  const { values, positionals } = parseCommand(argv, {
    preset: { type: "string" },
    asset: { type: "string" },
  });
  if (positionals.length > 0)
    throw new CliError(
      `Unexpected argument "${positionals[0]}". Usage: dax cut [--preset <name>] [--asset <id>]`,
      EXIT.usage,
    );
  const preset = str(values.preset);
  if (preset && !(CUT_PRESET_NAMES as readonly string[]).includes(preset)) {
    throw new CliError(
      `Unknown preset "${preset}". Choose one of: ${CUT_PRESET_NAMES.join(", ")}.`,
      EXIT.usage,
    );
  }
  const file = projectFile(inv, values);
  if (!existsSync(file))
    throw new CliError(`No project file at ${file}. Import a video first.`, EXIT.project);
  const session = await openProject(file, false);
  const asset = str(values.asset);
  const result = await execute(session, "smart_cut", {
    ...(preset ? { preset } : {}),
    ...(asset ? { assetId: asset } : {}),
  });
  return {
    text: `${result.summary}\n`,
    json: { ok: true, command: "smart_cut", project: file, ...result },
  };
}

async function cmdExport(inv: Invocation, argv: string[]): Promise<Output> {
  const { values, positionals } = parseCommand(argv, { overwrite: { type: "boolean" } });
  const out = positionals[0];
  if (!out || positionals.length > 1)
    throw new CliError("Usage: dax export <out.mp4> [--overwrite]", EXIT.usage);
  const file = projectFile(inv, values);
  if (!existsSync(file))
    throw new CliError(`No project file at ${file}. Import a video first.`, EXIT.project);
  const session = await openProject(file, false);
  const result = await withProgress(inv, !inv.json && inv.io.stderrIsTTY, (onProgress) =>
    execute(
      session,
      "export_video",
      { path: pathFromCwd(inv, out), overwrite: Boolean(values.overwrite) },
      onProgress,
    ),
  );
  return {
    text: `${result.summary}\n`,
    json: { ok: true, command: "export_video", project: file, ...result },
  };
}

// ---------------------------------------------------------------- dax mcp

async function cmdMcp(inv: Invocation, argv: string[]): Promise<ExitCode | number> {
  // Loaded on demand: the MCP SDK is the heavy part of the install, and no other subcommand needs it.
  const { runMcpMain } = await import("@dax/mcp");
  const args = [...argv];
  const projectGiven = args.some((a) => a === "--project" || a.startsWith("--project="));
  const fromEnv = inv.io.env.DAX_PROJECT;
  if (!projectGiven && fromEnv) args.push("--project", resolve(inv.io.cwd, fromEnv));
  return runMcpMain(args, inv.io.env);
}

// ---------------------------------------------------------------- entry

/**
 * Run the CLI with `argv` (without the node and script names) and return the exit code. Never calls `process.exit`
 * and, apart from `mcp` and `serve` (which own the process while they run), writes only through `io`.
 */
export async function runCli(argv: string[], io: CliIo = processIo()): Promise<number> {
  const args = normalizeArgv(argv);
  const wantsJson = args.includes("--json");
  const inv: Invocation = { io, json: wantsJson };

  try {
    const first = args[0];
    if (first === undefined || first === "-h" || first === "--help" || first === "help") {
      io.stdout(USAGE);
      return first === undefined ? EXIT.usage : EXIT.ok;
    }
    if (first === "--version" || first === "-V") {
      io.stdout(`${CLI_VERSION}\n`);
      return EXIT.ok;
    }
    const rest = args.slice(1);

    // mcp and serve forward their flags untouched to the programs that own them.
    if (first === "mcp") return await cmdMcp(inv, rest);
    if (first === "serve") return await runServe(io, rest);

    if (rest.includes("-h") || rest.includes("--help")) {
      io.stdout(USAGE);
      return EXIT.ok;
    }
    const handlers: Record<string, (i: Invocation, a: string[]) => Promise<Output>> = {
      commands: cmdCommands,
      run: cmdRun,
      project: cmdProject,
      import: cmdImport,
      cut: cmdCut,
      export: cmdExport,
    };
    // hasOwn so that a subcommand named like an Object.prototype member ("constructor") is just unknown.
    const handler = Object.hasOwn(handlers, first) ? handlers[first] : undefined;
    if (!handler) throw new CliError(`Unknown command "${first}". Run "dax --help".`, EXIT.usage);
    const out = await handler(inv, rest);
    io.stdout(inv.json ? toJson(out.json) : out.text);
    return EXIT.ok;
  } catch (err) {
    const error =
      err instanceof CliError
        ? err
        : new CliError(err instanceof Error ? err.message : String(err));
    if (inv.json) io.stdout(toJson({ ok: false, error: error.message, exitCode: error.exitCode }));
    else io.stderr(`dax: ${error.message}\n`);
    return error.exitCode;
  }
}
