// Dev harness: a minimal stand-in for the app shell. It talks to the mock server (or any @dax/server) with
// `?server=<url>&token=<token>`, implements EditorApi, and lays out the editor module the way the real app will:
// preview over toolbar over timeline, with presets and inspector in a side column. Used for manual runs and e2e tests.

import type { CommandResponse, StateResponse } from "@dax/protocol";
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EditorProvider,
  EditorToolbar,
  Inspector,
  PresetsPanel,
  PreviewPane,
  Timeline,
  useEditorShortcuts,
} from "../index.ts";
import type { EditorApi } from "../types.ts";
import "./harness.css";

const params = new URLSearchParams(window.location.search);
const serverUrl = params.get("server") ?? "http://127.0.0.1:4390";
const token = params.get("token") ?? "dev-token";

async function fetchState(): Promise<StateResponse> {
  const r = await fetch(`${serverUrl}/api/state?token=${token}`);
  if (!r.ok) throw new Error(`state: HTTP ${r.status}`);
  return (await r.json()) as StateResponse;
}

/** Shortcut binder, rendered inside the provider (hooks need its context). */
function Shortcuts() {
  useEditorShortcuts();
  return null;
}

function Shell({ api }: { api: EditorApi }) {
  return (
    <EditorProvider api={api}>
      <Shortcuts />
      <div className="h-root">
        <div className="h-main">
          <div className="h-preview">
            <PreviewPane />
          </div>
          <EditorToolbar />
          <div className="h-timeline">
            <Timeline />
          </div>
        </div>
        <aside className="h-side">
          <div className="h-side-presets">
            <PresetsPanel />
          </div>
          <div className="h-side-inspector">
            <Inspector />
          </div>
        </aside>
      </div>
    </EditorProvider>
  );
}

function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<StateResponse | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchState();
    stateRef.current = s;
    setState(s);
  }, []);

  useEffect(() => {
    refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  const run = useCallback(
    async (name: string, args: Record<string, unknown> = {}): Promise<CommandResponse> => {
      try {
        const r = await fetch(`${serverUrl}/api/command?token=${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, args }),
        });
        const res = (await r.json()) as CommandResponse;
        // The real app receives a `state` event over the WebSocket; the harness just refetches.
        await refresh();
        return res;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [refresh],
  );

  const api = useMemo<EditorApi | null>(
    () => (state ? { state, serverUrl, token, run } : null),
    [state, run],
  );

  if (error)
    return (
      <div className="h-msg">
        Cannot reach the server at {serverUrl}: {error}
      </div>
    );
  if (!api) return <div className="h-msg">Loading...</div>;
  return <Shell api={api} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
