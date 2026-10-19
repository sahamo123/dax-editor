# packages/cli

The `dax` command line: run any core command on a project file, from a shell or a script. Root rules in `/AGENTS.md` apply; this file adds package specifics. Overview: `docs/architecture/cli-and-mcp.md`.

Run: `pnpm --filter @dax/cli build && node packages/cli/dist/cli.js --help`.
Test: `pnpm --filter @dax/cli test` (FFmpeg tests skip without FFmpeg; `process.test.ts` runs the compiled bin and skips until `build`).

## Module map

| File | Responsibility |
|---|---|
| `main.ts` | `runCli(argv, io)`: subcommand dispatch and every handler (`commands`, `run`, `project`, `import`, `cut`, `export`; `mcp` and `serve` delegate). Returns an exit code; never calls `process.exit`. |
| `args.ts` | `USAGE` text, `normalizeArgv` (the `--json '{...}'` rule), `parseCommand` (strict `node:util` parseArgs wrapper). |
| `project.ts` | Which project file to use (`--project`, `DAX_PROJECT`, the only `*.dax.json` here, else `project.dax.json`) and how to open it. |
| `serve.ts` | `dax serve`: find `dax-server` (`DAX_SERVER_BIN`, installed `@dax/server`, PATH) and run it in the foreground. |
| `io.ts` | `CliIo` (stdout, stderr, stdin, cwd, env), `EXIT` codes, `CliError`. |
| `cli.ts` | The `dax` bin: `runCli(process.argv.slice(2))` then `process.exit`. |
| `test/harness.ts` | In-process runner with captured output, FFmpeg detection, temp dirs, lavfi clip. |

## Contract

- **No heavy dependencies.** Parsing is `node:util` `parseArgs`. `@dax/mcp` (and with it the MCP SDK) is loaded with a dynamic `import()` only by `dax mcp`. Do not add a CLI framework.
- **Every project change is a core command** run with `tryRunCommand` and `source: "manual"`. A new CLI verb is a thin wrapper around a command (see `cut`, `export`); never edit `session.project` here.
- **Exit codes** (`EXIT` in `io.ts`, tested): 0 success, 1 the command failed, 2 bad command line, 3 project file problem. `mcp`/`serve` return the child's or the server's code.
- **Output**: text mode prints the command's `summary` (plus its `data` for `run`) on stdout and errors as `dax: message` on stderr. With `--json`, stdout holds exactly one JSON document, `{ ok: true, command, project, summary, data? }` or `{ ok: false, error, exitCode }`, and stderr stays empty (no progress line either). `dax run <cmd> --json '{...}'`: a `--json` followed by a value that starts with `{` supplies the command's arguments (`--args '{...}'` or `--args -` for stdin also work) and implies JSON output.
- **Projects persist as `.dax.json`** through core's `Session`, with the undo history in `<file>.history.json`, so `dax run undo` works across separate invocations. Editing commands create a missing project (named after the file); read-only commands on a missing project use a scratch in-memory one and write nothing. `execute()` calls `session.save()` after each successful editing command because `save_checkpoint` only changes in-memory history.
- **No folder restrictions** (`allowedRoots` is unset): the CLI runs as the user in their own shell. Do not add restrictions here; they belong to the server and MCP.
- `dax serve` gives the server a stdin pipe it never writes to: `dax-server` exits when stdin closes, so a killed CLI leaves no orphan. SIGINT, SIGTERM and SIGHUP are forwarded.

## Known limits

- Session state that lives only in memory is lost between invocations: cut plans from `plan_cuts` cannot be applied by a later `dax run apply_cut_plan`. Use `dax cut` (plan and apply in one step) or `dax mcp` for review flows.
- `dax import` stops at the first failing file; files before it are already imported and saved.
- Progress is a redrawn `Working... NN%` line on stderr, only when stderr is a terminal and `--json` is not set.
