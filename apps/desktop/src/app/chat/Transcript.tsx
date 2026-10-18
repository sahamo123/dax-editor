// The conversation: the user's messages and, for each AI run, the streamed text and tool steps, followed by
// "Undo this change" while that is still safe.

import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { aiStepsSince, type ChatItem, currentStateId } from "../chat-model";
import { useApp, useController } from "../context";
import { Icon } from "../ui/icons";
import { ToolStep } from "./ToolStep";

type RunItem = Extract<ChatItem, { kind: "run" }>;

function RunView({ run, isLast }: { run: RunItem; isLast: boolean }): ReactElement {
  const controller = useController();
  const history = useApp((s) => s.state?.history);
  const online = useApp((s) => s.connection.status === "online");

  // "Undo this change" is offered only for the newest run, and only while undoing cannot touch manual work.
  const undoSteps = useMemo(
    () => (isLast && history ? aiStepsSince(history, run.startStateId) : -1),
    [isLast, history, run.startStateId],
  );
  const atStart = Boolean(history && currentStateId(history) === run.startStateId);
  const finished = run.status !== "running";

  return (
    <div className="msg msg--assistant">
      <div className="msg__avatar" aria-hidden="true">
        <Icon name="sparkle" size={14} />
      </div>
      <div className="msg__content">
        {run.steps.map((step) => {
          if (step.kind === "text") {
            return (
              <p key={step.key} className="msg__text">
                {step.text}
              </p>
            );
          }
          if (step.kind === "status") {
            return (
              <p key={step.key} className="msg__status">
                <span className="spinner" aria-hidden="true" /> {step.text}
              </p>
            );
          }
          return <ToolStep key={step.id} step={step} />;
        })}
        {run.status === "running" && !run.steps.some((s) => s.kind === "status") ? (
          <p className="msg__status">
            <span className="spinner" aria-hidden="true" /> Working...
          </p>
        ) : null}
        {run.status === "error" ? (
          <p className="note note--error" role="alert">
            {run.error ?? "Something went wrong."}
          </p>
        ) : null}
        {run.status === "cancelled" ? <p className="msg__meta">Stopped.</p> : null}
        {finished && undoSteps > 0 ? (
          <button
            type="button"
            className="btn btn--small"
            disabled={!online}
            onClick={() => void controller.undoRun(run.id)}
          >
            <Icon name="undo" size={14} /> Undo this change
          </button>
        ) : null}
        {finished && isLast && atStart && (run.undoneSteps ?? 0) > 0 ? (
          <p className="msg__meta">
            Change undone.{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => void controller.redoRun(run.id)}
            >
              Redo
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Props of {@link Transcript}. */
export interface TranscriptProps {
  /** Shown when there is no conversation yet. */
  empty: ReactElement;
}

/** The scrolling conversation. Follows new content unless the user scrolled up to read. */
export function Transcript({ empty }: TranscriptProps): ReactElement {
  const items = useApp((s) => s.chat);
  const sending = useApp((s) => s.chatSending);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastRunId = useMemo(() => [...items].reverse().find((i) => i.kind === "run")?.id, [items]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever the transcript changes
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [items, sending]);

  return (
    <div
      ref={scroller}
      className="transcript"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll the log
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
    >
      {items.length === 0 ? empty : null}
      {items.map((item) => {
        if (item.kind === "user") {
          return (
            <div key={item.id} className="msg msg--user">
              <div className="msg__bubble">{item.text}</div>
            </div>
          );
        }
        if (item.kind === "notice") {
          return (
            <p
              key={item.id}
              className={`note note--${item.tone}`}
              role={item.tone === "error" ? "alert" : undefined}
            >
              {item.text}
            </p>
          );
        }
        return <RunView key={item.id} run={item} isLast={item.id === lastRunId} />;
      })}
      {sending ? (
        <p className="msg__status msg__status--pad">
          <span className="spinner" aria-hidden="true" /> Sending...
        </p>
      ) : null}
    </div>
  );
}
