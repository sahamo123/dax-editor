// The message box at the bottom of the chat: suggestion chips, a growing text area, Send and (during a run) Stop.

import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";
import { pickBrowserFiles } from "../../platform";
import { useApp, useController } from "../context";
import { Icon } from "../ui/icons";

/** Example requests offered as one-click chips. They are plain sentences the assistant already understands. */
const SUGGESTIONS = ["Remove silences", "Add a title", "Cut to 30 seconds"] as const;

/** Props of {@link Composer}. */
export interface ComposerProps {
  /** Why typing is not possible right now ("Set up an assistant to chat"); `null` when it is. */
  blockedReason: string | null;
  /** Show the suggestion chips (there is a video to edit and an assistant to ask). */
  showSuggestions: boolean;
}

/** The chat input area. */
export function Composer({ blockedReason, showSuggestions }: ComposerProps): ReactElement {
  const controller = useController();
  const busy = useApp((s) => Boolean(s.state?.busy) || s.chatSending);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "plan">("edit");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const disabled = blockedReason !== null;

  const send = (message: string, steer = false) => {
    const clean = message.trim();
    if (!clean || disabled || submitting) return;
    setText("");
    if (ref.current) ref.current.style.height = "";
    setSubmitting(true);
    void controller.sendChat(clean, { mode, steer, files }).finally(() => setSubmitting(false));
    setFiles([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  };

  return (
    <div className="composer">
      <fieldset className="chips" aria-label="Chat controls">
        <label>
          Mode{" "}
          <select
            aria-label="Chat mode"
            value={mode}
            disabled={submitting}
            onChange={(event) => setMode(event.target.value === "plan" ? "plan" : "edit")}
          >
            <option value="edit">Edit</option>
            <option value="plan">Planning — no changes</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn--small"
          disabled={disabled || submitting || files.length >= 10}
          onClick={() =>
            void pickBrowserFiles().then((selected) =>
              setFiles((current) => [...current, ...selected].slice(0, 10)),
            )
          }
        >
          Attach videos
        </button>
      </fieldset>
      {mode === "plan" ? (
        <p className="muted">
          Planning only. The assistant can inspect and propose steps; editing tools are blocked.
        </p>
      ) : null}
      {files.length > 0 ? (
        <fieldset aria-label="Attachments">
          {files.map((file, index) => (
            <button
              type="button"
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="chip"
              onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
              aria-label={`Remove attachment ${file.name}`}
            >
              {file.name} ×
            </button>
          ))}
        </fieldset>
      ) : null}
      {showSuggestions && !busy ? (
        <fieldset className="chips">
          <legend className="sr-only">Suggestions</legend>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div className={`composer__box${disabled ? " is-disabled" : ""}`}>
        <textarea
          ref={ref}
          className="composer__input"
          aria-label="Message to the assistant"
          rows={1}
          value={text}
          disabled={disabled || submitting}
          placeholder={
            blockedReason ??
            (busy
              ? "Queue a follow-up or steer this task…"
              : "Describe an edit, e.g. cut the pauses")
          }
          onChange={(e) => {
            setText(e.target.value);
            // Grow with the text, up to the CSS max-height.
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button
            type="button"
            className="send-btn send-btn--stop"
            aria-label="Stop"
            title="Stop the assistant"
            onClick={() => void controller.cancelChat()}
          >
            <Icon name="stop" size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="send-btn"
          aria-label="Send message"
          title="Send (Enter)"
          disabled={disabled || submitting || !text.trim()}
          onClick={() => send(text)}
        >
          {busy ? "Queue" : null}
          <Icon name="send" size={16} />
        </button>
        {busy ? (
          <button
            type="button"
            className="btn btn--small"
            disabled={disabled || submitting || !text.trim()}
            onClick={() => send(text, true)}
          >
            Steer now
          </button>
        ) : null}
      </div>
    </div>
  );
}
