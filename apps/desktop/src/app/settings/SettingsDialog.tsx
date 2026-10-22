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

function ConnectionTools({
  kind,
  onSave,
  onModel,
}: {
  kind: ProviderKind;
  onSave(): Promise<boolean>;
  onModel(model: string): void;
}): ReactElement | null {
  const controller = useController();
  const status = useApp((s) => s.state?.providers.find((provider) => provider.kind === kind));
  const [working, setWorking] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  if (!["local", "openai", "openrouter", "openai-compatible"].includes(kind)) return null;
  const act = async (discover: boolean) => {
    setWorking(true);
    try {
      if (!(await onSave())) return;
      if (discover) setModels(await controller.providerModels(kind));
      else await controller.testProvider(kind);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="stack" aria-label="Connection diagnostics">
      <p role="status" className="muted">
        {status?.detail ?? "Not configured"}
      </p>
      <div className="row">
        <button type="button" className="btn" disabled={working} onClick={() => void act(false)}>
          {working ? "Checking…" : "Save and test connection"}
        </button>
        <button type="button" className="btn" disabled={working} onClick={() => void act(true)}>
          Load models
        </button>
      </div>
      <small className="muted">
        Tests send a short synthetic request with no project media. Hosted providers may charge for
        it.
      </small>
      {models.length ? (
        <label className="field">
          <span className="field__label">Discovered models</span>
          <select className="input" value="" onChange={(e) => onModel(e.target.value)}>
            <option value="">Choose a model</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}

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
          <span className="field__label">Connection preset</span>
          <select
            className="input"
            value=""
            onChange={(e) => {
              const url = e.target.value;
              if (url) onConfig({ baseUrl: url, model: undefined });
              onApiKey("");
            }}
          >
            <option value="">Choose a preset or enter a custom address</option>
            <option value="https://api.openai.com/v1">OpenAI</option>
            <option value="http://127.0.0.1:1234/v1">LM Studio</option>
            <option value="http://127.0.0.1:11434/v1">Ollama</option>
          </select>
          <span className="field__hint">
            For LM Studio or Ollama, start its local server and enter the loaded model name.
            Changing this preset does not move or remove a previously saved key.
          </span>
        </label>
      ) : null}
      {kind === "openrouter" ? (
        <p className="muted">
          Endpoint: https://openrouter.ai/api/v1. Enter a model ID from OpenRouter, such as
          provider/model-name. Choose a model that supports tools for editing.
        </p>
      ) : null}
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
          placeholder={kind === "openrouter" ? "provider/model-name" : "Model name to request"}
          spellCheck={false}
          onChange={(e) => onConfig({ model: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">Context window (tokens)</span>
        <input
          className="input"
          type="number"
          min={2048}
          max={1000000}
          value={config.contextTokens ?? ""}
          placeholder="Automatic"
          onChange={(e) =>
            onConfig({ contextTokens: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </label>
      <label className="field">
        <span className="field__label">Maximum reply tokens</span>
        <input
          className="input"
          type="number"
          min={1}
          max={65536}
          value={config.maxTokens ?? ""}
          placeholder="Provider default"
          onChange={(e) =>
            onConfig({ maxTokens: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </label>
      {kind !== "anthropic" ? (
        <label className="field">
          <span className="field__label">Temperature</span>
          <input
            className="input"
            type="number"
            min={0}
            max={2}
            aria-label="Temperature"
            step={0.1}
            value={config.temperature ?? ""}
            placeholder="Provider default"
            onChange={(e) =>
              onConfig({ temperature: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
          <span className="field__hint">
            Leave blank if the model does not accept a temperature setting.
          </span>
        </label>
      ) : null}
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
  const numbersBad = Object.values(draft.providers).some(
    (cfg) =>
      (cfg.contextTokens !== undefined &&
        (!Number.isInteger(cfg.contextTokens) ||
          cfg.contextTokens < 2048 ||
          cfg.contextTokens > 1_000_000)) ||
      (cfg.maxTokens !== undefined &&
        (!Number.isInteger(cfg.maxTokens) || cfg.maxTokens < 1 || cfg.maxTokens > 65_536)) ||
      (cfg.temperature !== undefined &&
        (!Number.isFinite(cfg.temperature) || cfg.temperature < 0 || cfg.temperature > 2)),
  );

  const patchConfig = (patch: Partial<ProviderConfig>) =>
    setDraft({ ...draft, providers: { ...draft.providers, [selected]: { ...config, ...patch } } });

  const save = async (closeAfter = true) => {
    if (baseUrlBad || numbersBad) return false;
    setSaving(true);
    // Drop empty strings: the server's schema wants a real URL / model name or no field at all.
    const providers: Settings["providers"] = {};
    for (const [kind, cfg] of Object.entries(draft.providers) as [ProviderKind, ProviderConfig][]) {
      const clean: ProviderConfig = { ...cfg };
      delete clean.baseUrl;
      delete clean.model;
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
    if (ok && closeAfter) close();
    return ok;
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
            disabled={saving || baseUrlBad || numbersBad}
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
          {selected === "openai-compatible" ||
          selected === "openai" ||
          selected === "anthropic" ||
          selected === "openrouter" ? (
            <ApiFields
              kind={selected}
              config={config}
              status={status}
              apiKey={apiKeys[selected] ?? ""}
              onConfig={patchConfig}
              onApiKey={(v) => setApiKeys({ ...apiKeys, [selected]: v })}
            />
          ) : null}
          <ConnectionTools
            key={selected}
            kind={selected}
            onSave={() => save(false)}
            onModel={(model) => patchConfig({ model })}
          />
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
