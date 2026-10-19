// Derived facts about the server state that several components need. Pure functions of the store's data.

import type { JobInfo, ProviderStatus, StateResponse } from "@dax/protocol";

/** The status entry of the provider the user chose, if the server listed it. */
export function activeProvider(state: StateResponse | null): ProviderStatus | undefined {
  return state?.providers.find((p) => p.kind === state.settings.activeProvider);
}

/** True if at least one provider could answer a chat message right now. */
export function anyProviderAvailable(state: StateResponse | null): boolean {
  return Boolean(state?.providers.some((p) => p.available));
}

/** True for a brand-new project: nothing imported and nothing on the timeline. Drives the first-run screen. */
export function isProjectEmpty(state: StateResponse | null): boolean {
  if (!state) return false;
  const clips = state.project.timeline.tracks.reduce((n, t) => n + t.clips.length, 0);
  return clips === 0 && Object.keys(state.project.assets).length === 0;
}

/** The export currently running, if any. */
export function runningExport(jobs: Record<string, JobInfo>): JobInfo | undefined {
  return Object.values(jobs).find((j) => j.kind === "export" && j.status === "running");
}

/** Jobs still working, excluding exports (which have their own button) and model jobs (their own card). */
export function backgroundJobs(jobs: Record<string, JobInfo>): JobInfo[] {
  return Object.values(jobs).filter(
    (j) => j.status === "running" && j.kind !== "export" && !j.kind.startsWith("model-"),
  );
}
