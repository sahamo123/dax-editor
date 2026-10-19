/**
 * A fixed-capacity line buffer used to keep the tail of a child process's output.
 * Memory use is bounded no matter how chatty the process is.
 */

/** Keeps the most recent `capacity` lines and splits incoming text chunks into lines. */
export class LogRingBuffer {
  private readonly lines: string[] = [];
  private partial = "";
  private readonly capacity: number;

  /** @param capacity Maximum number of complete lines to keep; must be at least 1. */
  constructor(capacity = 500) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`LogRingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
  }

  /**
   * Append raw output. Text may contain several lines or end mid-line; the unfinished tail is
   * held back until its newline arrives (or {@link LogRingBuffer.flush} is called).
   * @returns The complete lines that were added by this call.
   */
  push(chunk: string): string[] {
    const text = this.partial + chunk;
    const parts = text.split(/\r?\n/);
    this.partial = parts.pop() ?? "";
    for (const line of parts) this.add(line);
    return parts;
  }

  /** Turn any unfinished line into a complete one (call when the stream ends). */
  flush(): void {
    if (this.partial.length > 0) {
      this.add(this.partial);
      this.partial = "";
    }
  }

  /** The newest lines, oldest first. `limit` (default: all kept) caps how many are returned. */
  tail(limit = this.capacity): string[] {
    return limit >= this.lines.length ? [...this.lines] : this.lines.slice(-limit);
  }

  /** Number of complete lines currently kept. */
  get size(): number {
    return this.lines.length;
  }

  private add(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.shift();
  }
}
