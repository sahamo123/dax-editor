// Logging that cannot leak secrets: every line passes through a redactor holding the token and API keys.
// Logs go to stderr by default because stdout is reserved for the single ServerInfo line.

/** Severity of a log line. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Where log lines go. Tests pass an array-backed sink; the CLI uses stderr. */
export type LogSink = (line: string) => void;

/** A logger whose output is scrubbed of registered secrets. */
export interface Logger {
  /** Log a message at debug level; dropped if below the logger's level. */
  debug(message: string): void;
  /** Log a message at info level; dropped if below the logger's level. */
  info(message: string): void;
  /** Log a message at warn level; dropped if below the logger's level. */
  warn(message: string): void;
  /** Log a message at error level; dropped if below the logger's level. */
  error(message: string): void;
  /** Register a secret value; any later occurrence in a log line is replaced with `[redacted]`. Values shorter than 6 characters are ignored (too likely to match ordinary text). */
  addSecret(value: string): void;
  /** Scrub a string with the registered secrets; useful for error messages sent to clients. */
  redact(text: string): string;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Create a logger.
 * @param sink receives complete lines (no trailing newline). Defaults to writing to stderr.
 * @param level lines below this level are dropped. Defaults to `info`.
 */
export function createLogger(
  sink: LogSink = (line) => process.stderr.write(`${line}\n`),
  level: LogLevel = "info",
): Logger {
  const secrets = new Set<string>();
  const redact = (text: string): string => {
    let out = text;
    for (const s of secrets) out = out.split(s).join("[redacted]");
    return out;
  };
  const emit = (lvl: LogLevel, message: string) => {
    if (RANK[lvl] < RANK[level]) return;
    sink(`${new Date().toISOString()} ${lvl.toUpperCase()} ${redact(message)}`);
  };
  return {
    debug: (m) => emit("debug", m),
    info: (m) => emit("info", m),
    warn: (m) => emit("warn", m),
    error: (m) => emit("error", m),
    addSecret(value) {
      if (value.length >= 6) secrets.add(value);
    },
    redact,
  };
}
