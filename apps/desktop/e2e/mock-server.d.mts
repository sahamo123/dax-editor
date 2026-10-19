// Types for e2e/mock-server.mjs so the TypeScript specs can use it.

import type { HistoryItem, Project } from "@dax/core";
import type { CommandResponse, ProviderKind, Settings } from "@dax/protocol";
import type { EngineApi } from "./engine-api.mjs";

/** Options for {@link startMockServer}. */
export interface MockServerOptions {
  /** TCP port; 0 or omitted picks a free one. */
  port?: number;
  /** Auth token, at least 16 characters (the real server insists). */
  token?: string;
  /** Start with a downloaded, running local model so chat works. */
  aiReady?: boolean;
  /** Restrict imports and exports to these folders (default: the server's own default). */
  allowedRoots?: string[];
  /** Browser origins allowed to call the API (default: the Playwright preview and Vite dev servers). */
  origins?: string[];
  /** Milliseconds between scripted chat events (default 40). */
  chatDelayMs?: number;
  /** Milliseconds per step of the fake model download (default 150). */
  modelStepMs?: number;
  /** Data folder (default: a temp folder removed on close). */
  dataDir?: string;
}

/** A running engine: the real `@dax/server` with a scripted assistant and a fake local model. */
export interface MockServer {
  readonly url: string;
  readonly token: string;
  readonly port: number;
  readonly dataDir: string;
  /** Lines the server logged. */
  readonly logs: string[];
  /** REST helper for this server. */
  readonly api: EngineApi;
  /** The open project, read through the API. */
  project(): Promise<Project>;
  /** The history list, read through the API. */
  history(): Promise<HistoryItem[]>;
  /** API keys as stored on disk. */
  readonly secrets: Record<string, string>;
  /** Settings as stored on disk. */
  readonly settings: Settings;
  /** Import files as the UI does, then wait for the proxies. */
  importPaths(paths: string[]): Promise<CommandResponse>;
  /** Run a command as the UI would. */
  command(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
  /** Set whether a CLI is missing, signed out (`out`) or signed in (`in`). */
  setCli(kind: Extract<ProviderKind, `cli-${string}`>, status: "missing" | "out" | "in"): void;
  /** Shut the server down to simulate a lost connection. */
  stop(): Promise<void>;
  /** Start again on the same port, token and data. */
  start(): Promise<void>;
  /** Stop and delete the temp data folder. */
  close(): Promise<void>;
}

/** Start the real server in this process, on 127.0.0.1. */
export function startMockServer(options?: MockServerOptions): Promise<MockServer>;
