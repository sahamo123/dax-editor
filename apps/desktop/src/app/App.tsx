// The root component: finds the engine (platform layer), builds the store, client and controller for that
// connection, starts the live socket and hands over to the Shell. If no engine address is known it shows a
// small "Connect" form instead of a blank page.

import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import { DaxClient } from "../api";
import { getServerInfo, onFileDrop, rememberServer, type ServerConnection } from "../platform";
import { AppProvider } from "./context";
import { createController } from "./controller";
import { Shell } from "./layout/Shell";
import { createAppStore } from "./store";

/** Typed-address form for the browser build when `?server=&token=` is missing. */
function ConnectScreen({
  error,
  onConnect,
}: {
  error: string | null;
  onConnect(conn: ServerConnection): void;
}): ReactElement {
  const [url, setUrl] = useState("http://127.0.0.1:");
  const [token, setToken] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const conn = { url: url.trim().replace(/\/$/, ""), token: token.trim() };
    rememberServer(conn);
    onConnect(conn);
  };
  return (
    <main className="connect">
      <form className="connect__card stack" onSubmit={submit}>
        <h1 className="connect__title">Connect to the editor engine</h1>
        {error ? <p className="note note--error">{error}</p> : null}
        <p className="muted">
          Start the engine, then enter the address and token it printed. You can also open this page
          as <code>?server=http://127.0.0.1:PORT&amp;token=TOKEN</code>.
        </p>
        <label className="field">
          <span className="field__label">Server address</span>
          <input
            data-autofocus
            className="input input--mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span className="field__label">Token</span>
          <input
            className="input input--mono"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!url.trim() || !token.trim()}>
          Connect
        </button>
      </form>
    </main>
  );
}

/** Everything that exists only while connected to one engine. */
function Connected({ conn }: { conn: ServerConnection }): ReactElement {
  const [{ store, controller }] = useState(() => {
    const store = createAppStore();
    store.getState().setServer(conn);
    const client = new DaxClient({ baseUrl: conn.url, token: conn.token });
    return { store, controller: createController({ client, store }) };
  });

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  useEffect(
    () =>
      onFileDrop({
        onHover: (over) => store.getState().patchUi({ dropHover: over }),
        onDrop: (paths) => {
          const s = store.getState();
          if (paths.length > 0) {
            void controller.importPaths(paths);
          } else {
            // Browsers hide the real path of a dropped file, so ask for it by hand.
            s.patchUi({
              importOpen: true,
              importNote:
                "A browser can't tell the app where a dropped file lives. Paste its full path below.",
            });
          }
        },
      }),
    [store, controller],
  );

  return (
    <AppProvider store={store} controller={controller}>
      <Shell />
    </AppProvider>
  );
}

/** The application root. */
export function App(): ReactElement {
  // `undefined` while asking, `null` when the engine's address is unknown.
  const [conn, setConn] = useState<ServerConnection | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getServerInfo()
      .then((c) => alive && setConn(c))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(
          `Could not find the editor engine: ${err instanceof Error ? err.message : String(err)}`,
        );
        setConn(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (conn === undefined) return <div className="splash">Starting...</div>;
  if (conn === null) return <ConnectScreen error={error} onConnect={setConn} />;
  return <Connected key={`${conn.url}|${conn.token}`} conn={conn} />;
}
