// The CLI's seams with the outside world (output streams, input, environment) and its exit codes, so the whole
// command line can run in-process under test without touching the real terminal.

/** Process exit codes. Scripts can rely on these. */
export const EXIT = {
  /** The command did what was asked. */
  ok: 0,
  /** The command ran and failed (bad arguments for the command, FFmpeg error, nothing to do), or something else went wrong. */
  failure: 1,
  /** The command line itself was wrong: unknown subcommand or flag, missing argument. */
  usage: 2,
  /** The project file could not be found, read or parsed. */
  project: 3,
} as const;

/** One of the {@link EXIT} values. */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Everything the CLI reads from or writes to its surroundings. All fields are replaceable in tests. */
export interface CliIo {
  /** Write to standard output. Machine-readable results and human results go here. */
  stdout(text: string): void;
  /** Write to standard error. Errors, warnings and progress go here. */
  stderr(text: string): void;
  /** Read all of standard input as text (used by `--args -`). */
  readStdin(): Promise<string>;
  /** Folder that relative paths and project discovery start from. */
  cwd: string;
  /** Environment variables (`DAX_PROJECT`, `DAX_SERVER_BIN`, `PATH`). */
  env: NodeJS.ProcessEnv;
  /** True when standard error is a terminal, so a progress line may be redrawn in place. */
  stderrIsTTY: boolean;
}

/** The real process's streams and environment. */
export function processIo(): CliIo {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    },
    cwd: process.cwd(),
    env: process.env,
    stderrIsTTY: Boolean(process.stderr.isTTY),
  };
}

/** An error the CLI turns into a message and an exit code, rather than a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    /** Exit code to use. */
    readonly exitCode: ExitCode = EXIT.failure,
  ) {
    super(message);
  }
}
