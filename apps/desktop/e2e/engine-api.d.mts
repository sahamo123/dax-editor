// Types for engine-api.mjs so the TypeScript specs can use it.

import type { HistoryItem, Project } from "@dax/core";
import type { CommandResponse, ProviderStatus, Settings, StateResponse } from "@dax/protocol";

/** The test helper for talking to an engine over REST. */
export interface EngineApi {
  /** Send one authenticated request; resolves to the status and parsed body. */
  call(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  /** `GET /api/state`. */
  state(): Promise<StateResponse>;
  /** The open project. */
  project(): Promise<Project>;
  /** The history list. */
  history(): Promise<HistoryItem[]>;
  /** `GET /api/settings`. */
  settings(): Promise<Settings>;
  /** `GET /api/providers`. */
  providers(): Promise<ProviderStatus[]>;
  /** `POST /api/command`. */
  command(name: string, args?: Record<string, unknown>): Promise<CommandResponse>;
  /** `POST /api/import`. */
  importPaths(paths: string[]): Promise<CommandResponse>;
  /** Wait until no background job is running. */
  settled(timeoutMs?: number): Promise<void>;
}

/** Make the helper for the server at `url`. */
export function engineApi(url: string, token: string): EngineApi;
