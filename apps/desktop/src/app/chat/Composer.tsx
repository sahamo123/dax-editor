// The message box at the bottom of the chat: suggestion chips, a growing text area, Send and (during a run) Stop.

import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";
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
  const ref = useRef<HTMLTextAreaElement>(null);

  const disabled = blockedReason !== null;

  const send = (message: string) => {
    const clean = message.trim();
    if (!clean || disabled || busy) return;
    setText("");
    if (ref.current) ref.current.style.height = "";
    void controller.sendChat(clean);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  };

  return (
    <div className="composer">
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
          disabled={disabled || busy}
          placeholder={
            blockedReason ?? (busy ? "Working..." : "Describe an edit, e.g. cut the pauses")
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
        ) : (
          <button
            type="button"
            className="send-btn"
            aria-label="Send message"
            title="Send (Enter)"
            disabled={disabled || !text.trim()}
            onClick={() => send(text)}
          >
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
