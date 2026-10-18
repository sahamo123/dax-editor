// Files under the data directory that are not projects: settings.json, secrets.json (API keys, mode 0600) and state.json (last project).
// All writes are atomic (temp file + rename). API keys live only in secrets.json and are never returned by any method that feeds an HTTP response.

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROVIDER_KINDS, type ProviderKind, type Settings, SettingsSchema } from "@dax/protocol";
import { z } from "zod";
import type { Logger } from "./logger.js";

/** Write `data` to `path` atomically; `mode` applies to the new file (POSIX permission bits). */
export async function writeFileAtomic(path: string, data: string, mode = 0o644): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

/** Settings used on first launch: the embedded local model, no per-provider overrides. */
const DEFAULT_SETTINGS: Settings = { activeProvider: "local", providers: {} };

/** Reads and writes `settings.json`. Unreadable or invalid files fall back to defaults instead of blocking startup. */
export class SettingsStore {
  private value: Settings = structuredClone(DEFAULT_SETTINGS);
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly log: Logger,
  ) {
    this.file = join(dataDir, "settings.json");
  }

  /** Load from disk. A missing file is normal; a corrupt one is logged and ignored. */
  async load(): Promise<void> {
    try {
      this.value = SettingsSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.log.warn("settings.json is unreadable or invalid; using defaults");
      }
      this.value = structuredClone(DEFAULT_SETTINGS);
    }
  }

  /** A copy of the current settings. */
  get(): Settings {
    return structuredClone(this.value);
  }

  /** Validate, store and persist new settings. Throws a ZodError if `next` is invalid. */
  async set(next: unknown): Promise<Settings> {
    this.value = SettingsSchema.parse(next);
    await writeFileAtomic(this.file, JSON.stringify(this.value, null, 2));
    return this.get();
  }
}

const SecretsSchema = z.object({
  apiKeys: z.record(z.enum(PROVIDER_KINDS), z.string().min(1)).default({}),
});

/**
 * Stores API keys in `secrets.json` with owner-only permissions (0600; no effect on Windows, where
 * the per-user app data folder is the protection). There is deliberately no method that lists keys;
 * callers can only ask "is there a key" or fetch one key to hand to the AI provider.
 */
export class SecretStore {
  private keys: Partial<Record<ProviderKind, string>> = {};
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly log: Logger,
  ) {
    this.file = join(dataDir, "secrets.json");
  }

  /** Load from disk, registering every key with the logger's redactor. Tightens loose file permissions. */
  async load(): Promise<void> {
    try {
      this.keys = SecretsSchema.parse(JSON.parse(await readFile(this.file, "utf8"))).apiKeys;
      await chmod(this.file, 0o600).catch(() => undefined);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.log.warn("secrets.json is unreadable or invalid; ignoring it");
      }
      this.keys = {};
    }
    for (const key of Object.values(this.keys)) this.log.addSecret(key);
  }

  /** True if a key is stored for `kind`. */
  has(kind: ProviderKind): boolean {
    return Boolean(this.keys[kind]);
  }

  /** The stored key, for handing to a provider. Never put the result in a response or a log line. */
  get(kind: ProviderKind): string | undefined {
    return this.keys[kind];
  }

  /** Store or replace a key and persist the file with mode 0600. */
  async set(kind: ProviderKind, apiKey: string): Promise<void> {
    this.log.addSecret(apiKey);
    this.keys = { ...this.keys, [kind]: apiKey };
    await this.persist();
  }

  /** Forget the key for `kind`. Does nothing if there is none. */
  async remove(kind: ProviderKind): Promise<void> {
    const { [kind]: _removed, ...rest } = this.keys;
    this.keys = rest;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await writeFileAtomic(this.file, JSON.stringify({ apiKeys: this.keys }, null, 2), 0o600);
  }
}

/** Small bookkeeping the app remembers between launches. */
const AppStateSchema = z.object({ lastProject: z.string().optional() });

/** Reads and writes `state.json`: which project to reopen on the next launch. */
export class AppStateStore {
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "state.json");
  }

  /** The path of the project that was open last, if recorded. Never throws. */
  async lastProject(): Promise<string | undefined> {
    try {
      return AppStateSchema.parse(JSON.parse(await readFile(this.file, "utf8"))).lastProject;
    } catch {
      return undefined;
    }
  }

  /** Record the project that is open now. */
  async setLastProject(path: string): Promise<void> {
    await writeFileAtomic(this.file, JSON.stringify({ lastProject: path }, null, 2));
  }
}
