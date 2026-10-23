// Explicit named snapshots; typed keys never enter this component or browser persistence.
import { CONNECTION_KINDS, type ProviderKind, type Settings } from "@dax/protocol";
import { type ReactElement, useState } from "react";
import { useController } from "../context";

/** Save/load/remove API connection snapshots. Loading intentionally discards unsaved dialog edits. */
export function SavedConnections({
  kind,
  settings,
  onSave,
  onApply,
  onBusy,
}: {
  kind: ProviderKind;
  settings: Settings;
  onSave(): Promise<boolean>;
  onApply(settings: Settings, loaded: boolean): void;
  onBusy(busy: boolean): void;
}): ReactElement | null {
  const controller = useController();
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const family = CONNECTION_KINDS.find((value) => value === kind);
  if (!family) return null;
  const list = settings.savedConnections?.filter((item) => item.kind === kind) ?? [];
  const act = async (action: "save" | "load" | "remove", id?: string) => {
    setWorking(true);
    onBusy(true);
    try {
      if (action === "save" && !(await onSave())) return;
      const request =
        action === "save"
          ? { action, kind: family, name: name.trim() }
          : id
            ? { action, id }
            : null;
      if (!request) return;
      const saved = await controller.connection(request);
      if (saved) {
        onApply(saved, action === "load");
        if (action === "save") setName("");
      }
    } finally {
      setWorking(false);
      onBusy(false);
    }
  };
  return (
    <section className="stack" aria-label="Saved connections">
      <h4>Saved connections</h4>
      <p className="muted">
        Save this configuration and its key under a name. Load replaces unsaved settings in this
        dialog and selects the saved provider. It sends no AI request.
      </p>
      <label className="field">
        <span className="field__label">Connection name</span>
        <input
          className="input"
          value={name}
          maxLength={80}
          disabled={working}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={working || !name.trim() || (settings.savedConnections?.length ?? 0) >= 24}
        onClick={() => void act("save")}
      >
        Save named connection
      </button>
      {list.length ? (
        <ul className="stack">
          {list.map((item) => (
            <li key={item.id}>
              <span>
                {item.name} · {item.config.model ?? "Model not specified"}
              </span>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  aria-label={`Load ${item.name}`}
                  disabled={working}
                  onClick={() => void act("load", item.id)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove ${item.name}`}
                  disabled={working}
                  onClick={() => void act("remove", item.id)}
                >
                  Remove saved copy
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No named connections for this provider yet.</p>
      )}
    </section>
  );
}
