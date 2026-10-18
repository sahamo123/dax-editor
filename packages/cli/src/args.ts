// Command-line parsing helpers: the `--json '{...}'` convenience, one strict parser for every subcommand, and the help text.

import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { CliError, EXIT } from "./io.js";

/** Text printed for `dax --help`. */
export const USAGE = `dax: edit video from the command line (same engine as the desktop app and the MCP server)

Usage: dax <command> [arguments] [options]

Commands:
  commands [name]            List every editing command, or show one command's arguments
  run <command>              Run any command on a project:  dax run delete_range --json '{"from":1,"to":2}'
  project new [file]         Create an empty project file       (--name <text>, --force)
  project show [file]        Describe a project: assets, clips, overlays   (--full for the whole file)
  import <video...>          Import videos and put them on the timeline
  cut                        Tighten talking footage with smart_cut  (--preset gentle|standard|tight|podcast|tutorial, --asset <id>)
  export <out.mp4>           Render the timeline to a file       (--overwrite)
  mcp [options]              Start the MCP server on stdio (add --http for loopback HTTP); see "dax mcp --help"
  serve [options]            Start the engine server (dax-server) in the foreground

Options (most commands):
  -p, --project <file>       Project file (.dax.json). Default: DAX_PROJECT, else the only *.dax.json here,
                             else ./project.dax.json (created on first edit)
      --json                 Print one JSON document on stdout instead of text. For "run", "--json '{...}'"
                             (a value starting with "{") also supplies the command's arguments.
      --args <json|->        Arguments for "run" as JSON, or "-" to read them from stdin
  -h, --help                 Show this help
      --version              Show the version

Exit codes: 0 success, 1 the command failed, 2 bad command line, 3 project file problem.
`;

/** Options every subcommand accepts. */
const COMMON = {
  project: { type: "string", short: "p" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const satisfies ParseArgsOptionsConfig;

/**
 * Let `--json '{...}'` carry a command's arguments, as in `dax run cmd --json '{"a":1}'`, while `--json` alone
 * still means "machine-readable output". A `--json` followed by a value that starts with `{` (or `--json={...}`)
 * is rewritten to `--json --args <value>`.
 */
export function normalizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    const next = argv[i + 1];
    if (token === "--json" && next !== undefined && next.trimStart().startsWith("{")) {
      out.push("--json", "--args", next);
      i++;
    } else if (token.startsWith("--json=") && token.slice(7).trimStart().startsWith("{")) {
      out.push("--json", "--args", token.slice(7));
    } else {
      out.push(token);
    }
  }
  return out;
}

/** The parsed form of one subcommand's arguments. */
export interface Parsed<V> {
  /** Option values; unknown flags are rejected before this exists. */
  values: V;
  /** Arguments that are not flags, in order. */
  positionals: string[];
}

/**
 * Parse a subcommand's arguments with its own options plus the common ones.
 * @throws CliError (usage exit code) for unknown flags or missing flag values.
 */
export function parseCommand<const O extends ParseArgsOptionsConfig>(
  args: string[],
  own: O,
): Parsed<{
  project?: string;
  json?: boolean;
  help?: boolean;
  [K: string]: string | boolean | (string | boolean)[] | undefined;
}> {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { ...COMMON, ...own },
      allowPositionals: true,
      strict: true,
    });
    return { values: values as never, positionals };
  } catch (err) {
    throw new CliError(err instanceof Error ? err.message : String(err), EXIT.usage);
  }
}

/** A string option's value, or undefined (narrowing helper for the loose value type above). */
export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
