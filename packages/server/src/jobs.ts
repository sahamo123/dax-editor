// Background job bookkeeping: creates JobInfo records, throttles progress updates and notifies listeners. Runs nothing itself.

import { randomUUID } from "node:crypto";
import type { JobInfo } from "@dax/protocol";

/** Called with a snapshot every time a job changes (progress updates are throttled; start and finish are not). */
export type JobListener = (job: JobInfo, change: "created" | "progress" | "finished") => void;

/** The handle a task uses to report on its own job. */
export interface JobHandle {
  /** The job id, as seen by the UI. */
  readonly id: string;
  /** Report progress as a fraction; clamped to [0, 1] and never goes backwards. */
  progress(fraction: number): void;
  /** Mark done; `result` is shown to the UI (for exports, the file written). */
  done(result?: string): void;
  /** Mark failed with a message that is safe to show to the user. */
  fail(message: string): void;
}

/** How many finished jobs to keep in the list the UI sees. Running jobs are always kept. */
const KEEP_FINISHED = 20;
/** Minimum change in progress, as a fraction, before a new `progress` notification is sent. */
const MIN_PROGRESS_STEP = 0.01;

/** Tracks jobs and tells listeners about changes. */
export class JobManager {
  private readonly jobs: JobInfo[] = [];
  private readonly lastNotified = new Map<string, number>();

  constructor(private readonly listener: JobListener) {}

  /** Start tracking a new job in the `running` state at progress 0. */
  create(kind: JobInfo["kind"], label: string): JobHandle {
    const job: JobInfo = { id: randomUUID(), kind, label, progress: 0, status: "running" };
    this.jobs.push(job);
    this.lastNotified.set(job.id, 0);
    this.listener({ ...job }, "created");
    const finish = (patch: Partial<JobInfo>) => {
      if (job.status !== "running") return; // first outcome wins
      Object.assign(job, patch);
      this.lastNotified.delete(job.id);
      this.trim();
      this.listener({ ...job }, "finished");
    };
    return {
      id: job.id,
      progress: (fraction) => {
        if (job.status !== "running") return;
        const p = Math.min(1, Math.max(job.progress, Number.isFinite(fraction) ? fraction : 0));
        job.progress = p;
        const last = this.lastNotified.get(job.id) ?? 0;
        if (p - last >= MIN_PROGRESS_STEP) {
          this.lastNotified.set(job.id, p);
          this.listener({ ...job }, "progress");
        }
      },
      done: (result) => finish({ status: "done", progress: 1, ...(result ? { result } : {}) }),
      fail: (message) => finish({ status: "error", error: message }),
    };
  }

  /** All running jobs plus the most recent finished ones, oldest first. */
  list(): JobInfo[] {
    return this.jobs.map((j) => ({ ...j }));
  }

  /** True while any job of this kind is running. */
  isRunning(kind: JobInfo["kind"]): boolean {
    return this.jobs.some((j) => j.kind === kind && j.status === "running");
  }

  private trim(): void {
    const finished = this.jobs.filter((j) => j.status !== "running");
    for (const old of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) {
      this.jobs.splice(this.jobs.indexOf(old), 1);
    }
  }
}
