// Visible local task history and queue controls shared across connected editor tabs.
import type { ReactElement } from "react";
import { useApp, useController } from "../context";

/** Show current/queued work and recent results, with cancellation for unfinished tasks. */
export function TaskQueue(): ReactElement {
  const tasks = useApp((state) => state.state?.tasks);
  const online = useApp((state) => state.connection.status === "online");
  const controller = useController();
  const queued = tasks?.filter((task) => task.status === "queued").length ?? 0;
  const active = tasks?.find((task) => task.status === "running");
  const visible = [
    ...(tasks ?? [])
      .filter((task) => task.status === "running" || task.status === "queued")
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    ...(tasks ?? [])
      .filter((task) => task.status !== "running" && task.status !== "queued")
      .slice(-5)
      .reverse(),
  ];
  return (
    <details className="task-queue" open={queued > 0 || Boolean(active)}>
      <summary>
        Tasks · {active ? "1 running" : "idle"} · {queued} queued
      </summary>
      <ol aria-label="Task queue">
        {visible.map((task) => (
          <li key={task.id}>
            <small>
              {task.id.slice(0, 8)}
              {task.queuePosition ? ` · Queue #${task.queuePosition}` : ""} ·{" "}
            </small>
            <strong>
              {task.kind === "import" ? "Import" : task.mode === "plan" ? "Plan" : "Edit"}
            </strong>{" "}
            · <span>{task.status}</span>
            <p>{task.title}</p>
            <small>
              {task.origin ?? "ai"}
              {task.provider ? ` · ${task.provider}` : ""}
              {task.phase ? ` · ${task.phase}` : ""}
            </small>
            {task.progress !== undefined && task.status === "running" ? (
              <progress max={1} value={task.progress} aria-label={`${task.title} progress`} />
            ) : null}
            {task.startStateId !== undefined ? (
              <p className="muted">
                History #{task.startStateId}
                {task.endStateId !== undefined ? ` → #${task.endStateId}` : ""}
              </p>
            ) : null}
            {task.error ? <p className="note note--warn">{task.error}</p> : null}
            {task.status === "queued" || (task.status === "running" && !task.steersRunId) ? (
              <button
                type="button"
                className="btn btn--small"
                disabled={!online}
                onClick={() => void controller.cancelTask(task.id)}
              >
                Cancel task
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="muted">
        Saved locally. Interrupted work never resumes automatically after an engine restart.
      </p>
    </details>
  );
}
