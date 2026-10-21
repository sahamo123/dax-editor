// Persist recent work metadata locally; interrupted work never restarts without a new user request.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type TaskInfo, TaskInfoSchema } from "@dax/protocol";
import type { Logger } from "./logger.js";
import { writeFileAtomic } from "./stores.js";

/** Recent engine tasks, serialized to private app data. Active work becomes interrupted after engine restart. */
export class TaskStore {
  private tasks: TaskInfo[] = [];
  private writes: Promise<void> = Promise.resolve();
  private readonly path: string;
  constructor(
    dataDir: string,
    private readonly log: Logger,
  ) {
    this.path = join(dataDir, "tasks.json");
  }
  /** Load validated metadata; missing/invalid files leave an empty task list. */
  async load(): Promise<void> {
    try {
      const parsed = TaskInfoSchema.array()
        .max(200)
        .parse(JSON.parse(await readFile(this.path, "utf8")));
      this.tasks = parsed.map((task) =>
        task.status === "running" || task.status === "queued"
          ? { ...task, status: "interrupted" }
          : task,
      );
    } catch {
      this.tasks = [];
    }
  }
  /** Snapshot in submission order; callers cannot mutate authoritative entries. */
  list(): TaskInfo[] {
    return this.tasks.map((task) => ({ ...task }));
  }
  /** Add/update a task and serialize a private atomic write; keep at most 100 recent finished tasks. */
  put(task: TaskInfo): void {
    this.tasks = this.tasks.filter((old) => old.id !== task.id);
    this.tasks.push({ ...task });
    const active = this.tasks.filter((old) => old.status === "queued" || old.status === "running");
    this.tasks = [...this.tasks.filter((old) => !active.includes(old)).slice(-100), ...active].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    const data = JSON.stringify(this.tasks);
    this.writes = this.writes
      .then(() => writeFileAtomic(this.path, data, 0o600))
      .catch(() => this.log.error("Could not save task history."));
  }
  /** Wait for all task metadata writes accepted so far. */
  flush(): Promise<void> {
    return this.writes;
  }
}
