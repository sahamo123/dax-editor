// Shown in the chat panel when no assistant is configured. Its first job is to say plainly that the editor
// already works without AI; its second is to offer the three ways to add one.

import type { ProviderKind } from "@dax/protocol";
import type { ReactElement } from "react";
import { useApp } from "../context";
import { Icon, type IconName } from "../ui/icons";

const OPTIONS: { kind: ProviderKind; icon: IconName; title: string; text: string }[] = [
  {
    kind: "local",
    icon: "cpu",
    title: "Run a model on this computer",
    text: "Free and private. One-time download.",
  },
  {
    kind: "openai-compatible",
    icon: "key",
    title: "Use my own API key",
    text: "OpenAI-compatible, or Anthropic.",
  },
  {
    kind: "cli-claude",
    icon: "terminal",
    title: "Use Claude Code, Codex or Gemini",
    text: "Reuse the command-line tool you are signed in to.",
  },
];

/** The "no assistant yet" card. */
export function SetupCard(): ReactElement {
  const patchUi = useApp((s) => s.patchUi);
  return (
    <section className="setup-card" aria-labelledby="setup-title">
      <h2 id="setup-title" className="setup-card__title">
        <Icon name="sparkle" size={16} /> Add an assistant to edit by chatting
      </h2>
      <p className="setup-card__lead">
        <strong>The editor works without AI.</strong> Import a video and edit with the timeline, the
        presets and the inspector. An assistant is optional: it lets you describe an edit in words.
      </p>
      <ul className="setup-card__list">
        {OPTIONS.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              className="setup-option"
              onClick={() => patchUi({ settingsOpen: true, settingsKind: o.kind })}
            >
              <span className="setup-option__icon">
                <Icon name={o.icon} size={18} />
              </span>
              <span className="setup-option__text">
                <span className="setup-option__title">{o.title}</span>
                <span className="setup-option__sub">{o.text}</span>
              </span>
              <Icon name="chevronRight" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
