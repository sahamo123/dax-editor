// The provider controls of the chat panel: a drop-down to choose which assistant answers, and a status line
// that says whether it is ready (and offers "Set up" when it is not).

import type { ProviderKind } from "@dax/protocol";
import type { ReactElement } from "react";
import { useApp, useController } from "../context";
import { PROVIDERS, providerLabel } from "../providers";
import { activeProvider } from "../selectors";

/** The assistant drop-down. Switching saves the choice right away. */
export function ProviderSelect(): ReactElement | null {
  const controller = useController();
  const state = useApp((s) => s.state);
  const online = useApp((s) => s.connection.status === "online");
  if (!state) return null;

  const choose = (kind: ProviderKind) => {
    void controller.saveSettings({
      settings: { ...state.settings, activeProvider: kind },
      apiKeys: {},
      silent: true,
    });
  };

  return (
    <>
      <label className="sr-only" htmlFor="provider-select">
        Assistant
      </label>
      <select
        id="provider-select"
        className="select select--compact"
        value={state.settings.activeProvider}
        disabled={!online}
        onChange={(e) => choose(e.target.value as ProviderKind)}
      >
        {PROVIDERS.map((p) => {
          const st = state.providers.find((x) => x.kind === p.kind);
          return (
            <option key={p.kind} value={p.kind}>
              {p.label}
              {st?.available ? "" : " (not set up)"}
            </option>
          );
        })}
      </select>
    </>
  );
}

/** One line under the header: a status light, what is wrong if anything, and a Set up button. */
export function ProviderStatusLine(): ReactElement | null {
  const state = useApp((s) => s.state);
  const patchUi = useApp((s) => s.patchUi);
  if (!state) return null;
  const active = activeProvider(state);
  const ready = Boolean(active?.available);
  const kind = state.settings.activeProvider;
  return (
    <div
      className={`provider-status ${ready ? "is-ready" : "is-warn"}`}
      data-testid="provider-status"
    >
      <span className="provider-status__dot" aria-hidden="true" />
      <span className="provider-status__text">
        {active?.connectionState
          ? active.detail
          : ready
            ? `${providerLabel(kind)} is ready`
            : (active?.detail ?? "Not set up")}
      </span>
      {!ready ? (
        <button
          type="button"
          className="link-btn"
          onClick={() => patchUi({ settingsOpen: true, settingsKind: kind })}
          aria-label={`Set up ${providerLabel(kind)}`}
        >
          Set up
        </button>
      ) : null}
    </div>
  );
}
