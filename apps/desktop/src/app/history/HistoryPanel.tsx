// The History tab: every state the project has been in, with its label and who made it (you, the assistant or
// a template). Click a row to go back to it; nothing is lost, so you can jump forward again. Named checkpoints
// let you mark versions worth keeping.

import type { HistoryItem } from "@dax/core";
import { type FormEvent, type ReactElement, useMemo, useState } from "react";
import { useApp, useController } from "../context";
import { clockTime, formatDuration } from "../format";
import { Icon, type IconName } from "../ui/icons";

const SOURCE: Record<HistoryItem["source"], { icon: IconName; label: string }> = {
  manual: { icon: "cursor", label: "You" },
  ai: { icon: "sparkle", label: "Assistant" },
  template: { icon: "template", label: "Template" },
  system: { icon: "flag", label: "Start" },
};

/** Ids of the current state and every state it was derived from. Other states belong to undone branches. */
function currentPath(history: HistoryItem[]): Set<number> {
  const byId = new Map(history.map((h) => [h.id, h]));
  const path = new Set<number>();
  let node = history.find((h) => h.current);
  while (node) {
    path.add(node.id);
    node = node.parent === null ? undefined : byId.get(node.parent);
  }
  return path;
}

/** The History tab of the side drawer. */
export function HistoryPanel(): ReactElement {
  const controller = useController();
  const history = useApp((s) => s.state?.history);
  const online = useApp((s) => s.connection.status === "online");
  const pushToast = useApp((s) => s.pushToast);
  const [name, setName] = useState("");

  const items = history ?? [];
  const onPath = useMemo(() => currentPath(items), [items]);
  const checkpoints = items.filter((h) => h.name);
  // Newest first: the thing you just did is what you most often want to go back from.
  const ordered = useMemo(() => [...items].reverse(), [items]);

  const saveCheckpoint = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const r = await controller.run("save_checkpoint", { name: clean });
    if (r.ok) {
      setName("");
      pushToast("success", r.summary);
    }
  };

  return (
    <div className="history">
      <form className="history__checkpoint" onSubmit={(e) => void saveCheckpoint(e)}>
        <label className="sr-only" htmlFor="checkpoint-name">
          Checkpoint name
        </label>
        <input
          id="checkpoint-name"
          className="input"
          value={name}
          maxLength={60}
          placeholder="Name this version"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn--small" disabled={!online || !name.trim()}>
          <Icon name="bookmark" size={14} /> Save checkpoint
        </button>
      </form>

      {checkpoints.length > 0 ? (
        <section aria-label="Checkpoints">
          <h3 className="section-title">Checkpoints</h3>
          <ul className="history__checkpoints">
            {checkpoints.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="checkpoint"
                  disabled={!online}
                  onClick={() => void controller.run("restore_state", { id: h.id })}
                  aria-label={`Restore checkpoint ${h.name}`}
                >
                  <Icon name="bookmark" size={14} />
                  <span>{h.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="All states">
        <h3 className="section-title">History</h3>
        <ol className="history__list">
          {ordered.map((h) => {
            const src = SOURCE[h.source];
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className={`state-row${h.current ? " is-current" : ""}${onPath.has(h.id) ? "" : " is-off"}`}
                  aria-current={h.current ? "step" : undefined}
                  disabled={!online || h.current}
                  title={
                    onPath.has(h.id)
                      ? "Go back to this state"
                      : "From a branch you moved away from. Click to return to it."
                  }
                  onClick={() => void controller.run("restore_state", { id: h.id })}
                >
                  <span className={`state-row__icon state-row__icon--${h.source}`}>
                    <Icon name={src.icon} size={14} />
                    <span className="sr-only">{src.label}:</span>
                  </span>
                  <span className="state-row__main">
                    <span className="state-row__label">{h.label}</span>
                    <span className="state-row__meta">
                      {src.label} · {formatDuration(h.duration)} · {h.clips} clip
                      {h.clips === 1 ? "" : "s"}
                      {h.overlays > 0 ? ` · ${h.overlays} text` : ""}
                      {h.name ? ` · ${h.name}` : ""}
                    </span>
                  </span>
                  <span className="state-row__time">
                    {h.current ? <span className="badge badge--accent">Now</span> : clockTime(h.at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
