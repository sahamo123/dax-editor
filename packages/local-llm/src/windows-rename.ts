// Retry a final atomic directory rename when Windows temporarily holds a newly extracted file open.
import { rename } from "node:fs/promises";

/** I/O seams for the bounded Windows sharing-violation retry. */
export interface RenameOptions {
  /** Defaults to the current platform; other platforms never retry permission failures. */
  platform?: NodeJS.Platform;
  /** Atomic filesystem operation, replaceable by a deterministic test double. */
  move?: (source: string, target: string) => Promise<void>;
  /** Delay in milliseconds, replaceable by tests. */
  wait?: (milliseconds: number) => Promise<void>;
}

/**
 * Atomically rename an extracted directory. On Windows only, retry EPERM/EACCES/EBUSY up to
 * four times (50/100/200/400 ms); persistent failures and all other errors still propagate.
 * Never copies, removes, or changes either path, so retries preserve the atomic install boundary.
 */
export async function renameExtractedDirectory(
  source: string,
  target: string,
  options: RenameOptions = {},
): Promise<void> {
  const move = options.move ?? rename;
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      await move(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        (options.platform ?? process.platform) !== "win32" ||
        attempt >= 4 ||
        !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")
      )
        throw error;
      await wait(50 * 2 ** attempt);
    }
  }
}
