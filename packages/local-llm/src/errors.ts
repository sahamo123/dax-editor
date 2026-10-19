/**
 * Error classes thrown by this package. Callers (the server, the UI) can branch on the class
 * instead of parsing messages. Contains no logic.
 */

/** Base class for every error this package throws on purpose. */
export class LocalLlmError extends Error {
  /** @param message Human readable description that names the offending value. */
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The download was cancelled through its `AbortSignal`. The partial file is kept for resuming. */
export class DownloadAbortedError extends LocalLlmError {
  /** @param url The URL whose transfer was cancelled. */
  constructor(url: string) {
    super(`Download of ${url} was aborted`);
  }
}

/** The finished file does not have the expected SHA-256; the partial data was deleted. */
export class HashMismatchError extends LocalLlmError {
  /** Lower-case hex digest that was expected. */
  readonly expected: string;
  /** Lower-case hex digest that was computed from the downloaded bytes. */
  readonly actual: string;

  /**
   * @param url The URL that was downloaded.
   * @param expected Expected lower-case hex SHA-256.
   * @param actual Computed lower-case hex SHA-256.
   */
  constructor(url: string, expected: string, actual: string) {
    super(`SHA-256 mismatch for ${url}: expected ${expected}, got ${actual}`);
    this.expected = expected;
    this.actual = actual;
  }
}

/** There is not enough free space on the target volume for the download. */
export class InsufficientDiskSpaceError extends LocalLlmError {
  /** Bytes the download still needs (including the safety margin). */
  readonly requiredBytes: number;
  /** Bytes currently available to this process on the target volume. */
  readonly availableBytes: number;

  /**
   * @param directory Directory whose volume is too full.
   * @param requiredBytes Bytes needed.
   * @param availableBytes Bytes free.
   */
  constructor(directory: string, requiredBytes: number, availableBytes: number) {
    super(
      `Not enough free disk space in ${directory}: need ${requiredBytes} bytes, have ${availableBytes}`,
    );
    this.requiredBytes = requiredBytes;
    this.availableBytes = availableBytes;
  }
}

/** An HTTP request returned an unusable status or the connection kept failing. */
export class HttpError extends LocalLlmError {
  /** HTTP status code, or `undefined` for network-level failures. */
  readonly status: number | undefined;

  /**
   * @param message Description including the URL.
   * @param status HTTP status code when there was a response.
   */
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** An archive is malformed or tries to write outside the extraction directory. */
export class ArchiveError extends LocalLlmError {}

/** The llama-server process failed to start, became unhealthy or exited. */
export class ServerError extends LocalLlmError {
  /** The last lines the process printed, to help diagnose the failure. */
  readonly logTail: string[];

  /**
   * @param message What went wrong.
   * @param logTail Recent output lines of the process (may be empty).
   */
  constructor(message: string, logTail: string[] = []) {
    super(
      logTail.length > 0 ? `${message}\n--- last log lines ---\n${logTail.join("\n")}` : message,
    );
    this.logTail = logTail;
  }
}

/** The requested catalog model, runtime asset or platform is not known or not supported. */
export class UnsupportedError extends LocalLlmError {}
