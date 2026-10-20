// A banner under the top bar that appears whenever the link to the engine is not healthy. It says what is
// happening and when the next automatic retry is, and offers "Retry now". The rest of the UI stays usable
// for reading and is disabled for anything that needs the server.

import { type ReactElement, useEffect, useState } from "react";
import { useApp, useController } from "../context";
import { Icon } from "../ui/icons";

/** Seconds until `retryAt` (epoch ms), counting down once a second. */
function useCountdown(retryAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [retryAt]);
  return retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/** Connection status banner; renders nothing while online. */
export function ConnectionBanner(): ReactElement | null {
  const controller = useController();
  const connection = useApp((s) => s.connection);
  const seconds = useCountdown(connection.retryAt);

  if (connection.status === "online" || connection.status === "idle") return null;

  if (connection.status === "connecting") {
    return (
      <div className="banner banner--info" role="status">
        <span className="spinner" aria-hidden="true" /> Connecting to the editor engine...
      </div>
    );
  }

  return (
    <div className="banner banner--error" role="alert">
      <Icon name="plug" />
      <span className="banner__text">
        <strong>Can't reach the editor engine.</strong>{" "}
        {connection.retryAt === null
          ? "Reconnecting..."
          : seconds === 0
            ? "Reconnecting..."
            : `Trying again in ${seconds}s.`}{" "}
        Editing is paused until the connection is back.
      </span>
      <button type="button" className="btn btn--small" onClick={() => controller.retryNow()}>
        <Icon name="refresh" size={14} /> Retry now
      </button>
    </div>
  );
}
