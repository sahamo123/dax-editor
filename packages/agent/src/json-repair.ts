// Forgiving JSON parsing for the sloppy output of small models: code fences, single quotes, trailing commas,
// comments, unquoted keys, Python literals and truncated text. Pure; never evaluates anything.

import { setOwn } from "./own-property.js";

/** Result of {@link parseJsonLoose}. */
export type LooseParse =
  | {
      ok: true;
      value: unknown;
      /** True if the text was not strict JSON and had to be repaired. */
      repaired: boolean;
      /** Index in the input just after the parsed value (useful when scanning prose for JSON). */
      end: number;
    }
  | { ok: false; error: string };

const MAX_DEPTH = 40;
const OPEN_QUOTES = new Set(['"', "'", "“", "”", "‘", "’", "`"]);
const LITERALS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  True: true,
  False: false,
  None: null,
  undefined: null,
  NaN: null,
};

class LooseParser {
  private i: number;

  constructor(
    private readonly s: string,
    start: number,
  ) {
    this.i = start;
  }

  get position(): number {
    return this.i;
  }

  private peek(): string {
    return this.s.charAt(this.i);
  }

  private eof(): boolean {
    return this.i >= this.s.length;
  }

  /** Skip whitespace, `// line` comments and block comments. */
  private skip(): void {
    for (;;) {
      const c = this.peek();
      if (c === "" || (c > " " && c !== "/" && c !== "\u00a0" && c !== "\ufeff")) return;
      if (c === "/" && this.s.charAt(this.i + 1) === "/") {
        while (!this.eof() && this.peek() !== "\n") this.i++;
      } else if (c === "/" && this.s.charAt(this.i + 1) === "*") {
        const close = this.s.indexOf("*/", this.i + 2);
        this.i = close === -1 ? this.s.length : close + 2;
      } else if (c === "/") {
        return;
      } else {
        this.i++;
      }
    }
  }

  value(depth = 0): unknown {
    if (depth > MAX_DEPTH) throw new Error("nested too deeply");
    this.skip();
    const c = this.peek();
    if (c === "{") return this.object(depth);
    if (c === "[") return this.array(depth);
    if (OPEN_QUOTES.has(c)) return this.string();
    return this.scalar();
  }

  private object(depth: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.i++; // {
    for (;;) {
      this.skip();
      if (this.eof()) return out; // truncated: close it
      const c = this.peek();
      if (c === "}") {
        this.i++;
        return out;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      const key = this.key();
      this.skip();
      const sep = this.peek();
      if (sep === ":" || sep === "=") {
        this.i++;
        if (this.s.charAt(this.i) === ">") this.i++; // `=>`
      } else if (this.eof()) {
        return out;
      } else {
        throw new Error(`expected ":" after key "${key}" at position ${this.i}`);
      }
      this.skip();
      if (this.eof() || this.peek() === "}" || this.peek() === ",") {
        setOwn(out, key, null); // `{"a": }` or truncated after the colon
        continue;
      }
      setOwn(out, key, this.value(depth + 1));
    }
  }

  private array(depth: number): unknown[] {
    const out: unknown[] = [];
    this.i++; // [
    for (;;) {
      this.skip();
      if (this.eof()) return out;
      const c = this.peek();
      if (c === "]") {
        this.i++;
        return out;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      out.push(this.value(depth + 1));
    }
  }

  private key(): string {
    const c = this.peek();
    if (OPEN_QUOTES.has(c)) return this.string();
    const m = /^[A-Za-z0-9_$.-]+/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`expected a key at position ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }

  private string(): string {
    const open = this.peek();
    // A curly opening quote may be closed by either curly quote.
    const closes =
      open === "“" || open === "”"
        ? new Set(["“", "”", '"'])
        : open === "‘" || open === "’"
          ? new Set(["‘", "’", "'"])
          : new Set([open]);
    this.i++;
    let out = "";
    while (!this.eof()) {
      const c = this.peek();
      if (c === "\\") {
        out += this.escape();
        continue;
      }
      if (closes.has(c)) {
        this.i++;
        return out;
      }
      out += c;
      this.i++;
    }
    return out; // unterminated: keep what we have
  }

  private escape(): string {
    this.i++; // backslash
    const c = this.peek();
    this.i++;
    switch (c) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "u": {
        const hex = this.s.slice(this.i, this.i + 4);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          this.i += 4;
          return String.fromCharCode(Number.parseInt(hex, 16));
        }
        return "u";
      }
      default:
        return c; // \" \' \\ \/ and unknown escapes: the character itself
    }
  }

  private scalar(): unknown {
    const rest = this.s.slice(this.i);
    const num = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?![A-Za-z_])/.exec(rest);
    if (num) {
      this.i += num[0].length;
      return Number(num[0]);
    }
    const word = /^[A-Za-z_#][A-Za-z0-9_.#-]*/.exec(rest);
    if (word) {
      this.i += word[0].length;
      return Object.hasOwn(LITERALS, word[0]) ? LITERALS[word[0]] : word[0];
    }
    throw new Error(`unexpected "${rest.slice(0, 12)}" at position ${this.i}`);
  }
}

/**
 * Parse JSON-like text produced by a language model.
 *
 * Strict JSON is tried first (`repaired: false`). Otherwise a forgiving parser accepts single or
 * curly quotes, unquoted keys, trailing commas, `//` and `/* *\/` comments, `True`/`False`/`None`,
 * `key=value`, a missing closing bracket or quote, and ignores a Markdown code fence or prose
 * around the value: parsing starts at the first `{` or `[`. Text after the first complete value is
 * ignored. Never throws; returns `{ ok: false }` with a reason if nothing usable is found.
 *
 * @param text Raw model output.
 * @param start Index to start looking from. Default 0.
 */
export function parseJsonLoose(text: string, start = 0): LooseParse {
  const input = text.slice(start);
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "empty" };
  try {
    return { ok: true, value: JSON.parse(trimmed), repaired: false, end: text.length };
  } catch {
    // fall through to the forgiving parser
  }
  const first = findStart(input);
  if (first === -1) return { ok: false, error: "no JSON object or array found" };
  try {
    const parser = new LooseParser(input, first);
    const value = parser.value();
    return { ok: true, value, repaired: true, end: start + parser.position };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function findStart(s: string): number {
  const a = s.indexOf("{");
  const b = s.indexOf("[");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
