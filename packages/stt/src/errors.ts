// Error type shared by the whole package, with a stable `code` the UI can switch on.

/** Machine-readable reason carried by {@link SttError}. */
export type SttErrorCode =
  | "binary-missing"
  | "model-missing"
  | "cancelled"
  | "timeout"
  | "process-failed"
  | "bad-output"
  | "no-audio"
  | "unsupported-platform"
  | "unsupported-language"
  | "download-failed"
  | "hash-mismatch"
  | "disk-space"
  | "bad-archive";

/**
 * Every failure in `@dax/stt` is an `SttError`. The message is written for a person ("whisper-cli
 * was not found at ...; run ensureBinary()") and `code` lets callers branch without parsing it.
 * A cancelled run has `code === "cancelled"` and `name === "AbortError"`, matching `fetch`.
 */
export class SttError extends Error {
  /** Why it failed; see {@link SttErrorCode}. */
  readonly code: SttErrorCode;

  /** Create an error with a human-readable `message` and a machine-readable `code`. */
  constructor(code: SttErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = code === "cancelled" ? "AbortError" : "SttError";
  }
}
