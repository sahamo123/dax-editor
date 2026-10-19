// Types for real-engine.mjs.

import type { EngineApi } from "./engine-api.mjs";

/** Options for {@link startRealEngine}. */
export interface RealEngineOptions {
  /** Browser origin of the app, passed as `--origin` (for example `http://127.0.0.1:4173`). */
  origin: string;
  /** Folders imports and exports may use (`--allow-root`). */
  allowRoots?: string[];
  /** Extra environment variables for the process. */
  env?: Record<string, string>;
}

/** A running `dax-engine` process. */
export interface RealEngine {
  readonly url: string;
  readonly token: string;
  readonly port: number;
  /** Its private data folder (temp, removed by `close()`). */
  readonly dataDir: string;
  /** Lines the engine wrote to stderr. */
  readonly logs: string[];
  readonly api: EngineApi;
  /** Stop the process and delete its data folder. */
  close(): Promise<void>;
}

/** Launch the built `dax-engine` and wait for its startup line. */
export function startRealEngine(options: RealEngineOptions): Promise<RealEngine>;
