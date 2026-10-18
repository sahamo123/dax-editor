// Types for e2e/mock-server.mjs so the TypeScript specs can use it.

import type { HistoryItem, Project, Session } from "@dax/core";
import type { CommandResponse, ProviderKind, Settings } from "@dax/protocol";

/** Options for {@link startMockServer}. */
export interface MockServerOptions {
  port?: number;
  token?: string;
  /** Start with a running local model so chat works. */
  aiReady?: boolean;
  /** Restrict imports and exports to these folders (default: anywhere). */
  allowedRoots?: string[];
  projectName?: string;
  /** Milliseconds between scripted chat events (default 40). */
  chatDelayMs?: number;
  /** Extra milliseconds an export takes, with fake progress, so tests can observe it (default 0). */
  exportPadMs?: number;
  /** Milliseconds per step of the fake model download (default 150). */
  modelStepMs?: number;
  dataDir?: string;
}

/** A running mock engine. */
export interface MockServer {
  readonly url: string;
  readonly token: string;
  readonly port: number;
  readonly dataDir: string;
  readonly session: Session;
  readonly requests: { method: string; path: string }[];
  readonly secrets: Record<string, string>;
  readonly settings: Settings;
  importPaths(paths: string[]): Promise<{ ok: boolean; summary?: string; error?: string }>;
  command(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
  setCli(kind: Extract<ProviderKind, `cli-${string}`>, status: "missing" | "out" | "in"): void;
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}

/** Start a mock engine on 127.0.0.1. */
export function startMockServer(options?: MockServerOptions): Promise<MockServer>;

/** Make a short test video (tone and silence alternating every 1.5 s) with FFmpeg's lavfi sources. */
export function makeFixtureVideo(
  path: string,
  options?: { seconds?: number; width?: number; height?: number },
): Promise<string>;

export type { HistoryItem, Project };
