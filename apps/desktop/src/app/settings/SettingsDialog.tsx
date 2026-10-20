// Settings: choose which assistant answers the chat and configure it. API keys are typed into a password box,
// sent once to the server, and then cleared from memory; nothing ever shows a stored key again.

import type { ProviderConfig, ProviderKind, ProviderStatus, Settings } from "@dax/protocol";
import { type ReactElement, useState } from "react";
import { useApp, useController } from "../context";
import { isCliProvider, PROVIDERS, providerLabel } from "../providers";
import { Icon } from "../ui/icons";
import { Modal } from "../ui/Modal";
import { LocalModelCard } from "./LocalModelCard";

const CLI_COMMAND: Record<string, string> = {
  "cli-claude": "claude",
  "cli-codex": "codex",
  "cli-gemini": "gemini",
};

function validUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface FieldsProps {
  kind: ProviderKind;
  config: ProviderConfig;
  status: ProviderStatus | undefined;
  apiKey: string;
  onConfig(patch: Partial<ProviderConfig>): void;
  onApiKey(value: string): void;
}

/** Base URL, model and key fields for the API providers. */
function ApiFields({
  kind,
  config,
  status,
  apiKey,
  onConfig,
  onApiKey,
}: FieldsProps): ReactElement {
  const isOpenAi = kind === "openai-compatible";
  const urlBad = isOpenAi && Boolean(config.baseUrl) && !validUrl(config.baseUrl ?? "");
  return (
    <div className="stack">
      {isOpenAi ? (
        <label className="field">
          <span className="field__label">Base URL</span>
          <input
            className="input input--mono"
            type="url"
            value={config.baseUrl ?? ""}
            placeholder="https://api.openai.com/v1 or http://127.0.0.1:11434/v1"
            spellCheck={false}
            aria-invalid={urlBad}
            onChange={(e) => onConfig({ baseUrl: e.target.value })}
          />
          {urlBad ? (
            <span className="field__error">
              Enter a full address starting with http:// or https://
            </span>
          ) : null}
        </label>
      ) : null}
      <label className="field">
        <span className="field__label">Model</span>
        <input
          className="input input--mono"
          value={config.model ?? ""}
          placeholder="Model name to request"
          spellCheck={false}
          onChange={(e) => onConfig({ model: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">
          API key
          {status?.hasApiKey && !apiKey ? (
            <span className="badge badge--ok">
              <Icon name="check" size={12} /> Key saved
            </span>
          ) : null}
        </span>
        <input
          className="input input--mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          placeholder={
            status?.hasApiKey
              ? "Saved. Type a new key to replace it"
              : isOpenAi
                ? "Paste your key (optional for local servers)"
                : "Paste your key"
          }
          onChange={(e) => onApiKey(e.target.value)}
        />
        <span className="field__hint">
          Stored on this computer outside your project files. It is never shown again or included in
          exports.
        </span>
      </label>
    </div>
  );
}

/** Status and instructions for a signed-in command-line tool. */
function CliPane({
  kind,
  status,
}: {
  kind: ProviderKind;
  status: ProviderStatus | undefined;
}): ReactElement {
  const controller = useController();
  const cmd = CLI_COMMAND[kind] ?? "the tool";
  return (
    <div className="stack">
      <div className="model-card">
        <div className="model-card__head">
          <div>
            <div className="model-card__name">{providerLabel(kind)}</div>
            <div className="muted">{status?.detail ?? "Status unknown"}</div>
          </div>
          <span className={`status-pill ${status?.available ? "is-ready" : "is-warn"}`}>
            <span className="status-pill__dot" aria-hidden="true" />
            {status?.available
              ? "Signed in"
              : status?.signedIn === false
                ? "Not signed in"
                : "Not found"}
          </span>
        </div>
        <div className="model-card__actions">
          <button type="button" className="btn" onClick={() => void controller.refreshProviders()}>
            <Icon name="refresh" size={14} /> Check again
          </button>
        </div>
      </div>
      <p className="muted">
        This uses the tool you already installed and signed in to, so there is no key to paste here.
        Open a terminal, run <code>{cmd}</code> once to sign in, then press Check again.
      </p>
    </div>
  );
}

/** The Settings dialog. Opens when `ui.settingsOpen` is set. */
export function SettingsDialog(): ReactElement | null {
  const controller = useController();
  const state = useApp((s) => s.state);
  const initialKind = useApp((s) => s.ui.settingsKind);
  const patchUi = useApp((s) => s.patchUi);

  const [draft, setDraft] = useState<Settings | null>(state?.settings ?? null);
  const [selected, setSelected] = useState<ProviderKind>(
    initialKind ?? state?.settings.activeProvider ?? "local",
  );
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderKind, string>>>({});
  const [saving, setSaving] = useState(false);

  const close = () => patchUi({ settingsOpen: false, settingsKind: null });

  if (!state || !draft) {
    return (
      <Modal title="Settings" onClose={close}>
        <p className="muted">Connect to the editor engine to change settings.</p>
      </Modal>
    );
  }

  const config = draft.providers[selected] ?? {};
  const status = state.providers.find((p) => p.kind === selected);
  const baseUrlBad =
    selected === "openai-compatible" && Boolean(config.baseUrl) && !validUrl(config.baseUrl ?? "");

  const patchConfig = (patch: Partial<ProviderConfig>) =>
    setDraft({ ...draft, providers: { ...draft.providers, [selected]: { ...config, ...patch } } });

  const save = async () => {
    setSaving(true);
    // Drop empty strings: the server's schema wants a real URL / model name or no field at all.
    const providers: Settings["providers"] = {};
    for (const [kind, cfg] of Object.entries(draft.providers) as [ProviderKind, ProviderConfig][]) {
      const clean: ProviderConfig = {};
      if (cfg.baseUrl?.trim()) clean.baseUrl = cfg.baseUrl.trim();
      if (cfg.model?.trim()) clean.model = cfg.model.trim();
      providers[kind] = clean;
    }
    const ok = await controller.saveSettings({
      settings: { ...draft, providers },
      apiKeys: Object.fromEntries(
        Object.entries(apiKeys).filter(([, v]) => typeof v === "string" && v.trim()),
      ),
    });
    setSaving(false);
    // The typed keys are cleared whether or not saving worked; they never stay in memory longer than needed.
    setApiKeys({});
    if (ok) close();
  };

  return (
    <Modal
      title="Settings"
      size="lg"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || baseUrlBad}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <div className="settings">
        <nav className="settings__nav" aria-label="Assistants">
          <p className="settings__nav-title">Assistant</p>
          <ul>
            {PROVIDERS.map((p) => {
              const st = state.providers.find((x) => x.kind === p.kind);
              const isActive = draft.activeProvider === p.kind;
              return (
                <li key={p.kind}>
                  <button
                    type="button"
                    className={`nav-item${selected === p.kind ? " is-selected" : ""}`}
                    aria-current={selected === p.kind ? "true" : undefined}
                    onClick={() => setSelected(p.kind)}
                  >
                    <span
                      className={`dot ${st?.available ? "dot--ready" : "dot--idle"}`}
                      role="img"
                      aria-label={st?.available ? "Ready" : "Not set up"}
                    />
                    <span className="nav-item__label">{p.label}</span>
                    {isActive ? <span className="badge">In use</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="settings__pane" aria-label={`${providerLabel(selected)} settings`}>
          <header className="settings__pane-head">
            <h3>{providerLabel(selected)}</h3>
            <p className="muted">{PROVIDERS.find((p) => p.kind === selected)?.blurb}</p>
          </header>

          {selected === "local" ? <LocalModelCard /> : null}
          {selected === "openai-compatible" || selected === "anthropic" ? (
            <ApiFields
              kind={selected}
              config={config}
              status={status}
              apiKey={apiKeys[selected] ?? ""}
              onConfig={patchConfig}
              onApiKey={(v) => setApiKeys({ ...apiKeys, [selected]: v })}
            />
          ) : null}
          {isCliProvider(selected) ? <CliPane kind={selected} status={status} /> : null}

          <label className="check check--card">
            <input
              type="checkbox"
              checked={draft.activeProvider === selected}
              disabled={draft.activeProvider === selected}
              onChange={() => setDraft({ ...draft, activeProvider: selected })}
            />
            <span>
              Use {providerLabel(selected)} for chat
              {draft.activeProvider === selected ? " (current choice)" : ""}
            </span>
          </label>
        </section>
      </div>
    </Modal>
  );
}
