// The left-hand panel: provider selector, the conversation, and the message box. When no assistant is set up it
// shows a card that explains the editor works without one. It never blocks manual editing.

import type { ReactElement } from "react";
import { useApp } from "../context";
import { activeProvider, anyProviderAvailable, isProjectEmpty } from "../selectors";
import { Composer } from "./Composer";
import { ProviderSelect, ProviderStatusLine } from "./ProviderPicker";
import { SetupCard } from "./SetupCard";
import { Transcript } from "./Transcript";

function Welcome({
  loaded,
  hasVideo,
  ready,
}: {
  loaded: boolean;
  hasVideo: boolean;
  ready: boolean;
}): ReactElement {
  return (
    <div className="welcome">
      <p className="welcome__title">What should we do with your video?</p>
      <p className="welcome__text">
        {!loaded
          ? "Not connected yet."
          : !hasVideo
            ? "Import a video first, then describe the edit you want."
            : ready
              ? "Ask for an edit in your own words. Every change can be undone."
              : "Pick an assistant above to start chatting."}
      </p>
    </div>
  );
}

/** The chat column. */
export function ChatPanel(): ReactElement {
  const state = useApp((s) => s.state);
  const online = useApp((s) => s.connection.status === "online");
  const anyReady = anyProviderAvailable(state);
  const active = activeProvider(state);
  const activeReady = Boolean(active?.available);
  const hasVideo = !isProjectEmpty(state);

  let blocked: string | null = null;
  if (!online) blocked = "Reconnect to chat";
  else if (!anyReady) blocked = "Set up an assistant to chat";
  else if (!activeReady) blocked = `${active?.detail ?? "This assistant is not ready"}`;

  return (
    <aside className="chat" aria-label="Chat with the assistant">
      <div className="panel-header">
        <h2 className="panel-header__title">Assistant</h2>
        <ProviderSelect />
      </div>
      <ProviderStatusLine />
      <div className="chat__body">
        {state && !anyReady ? <SetupCard /> : null}
        <Transcript
          empty={<Welcome loaded={state !== null} hasVideo={hasVideo} ready={activeReady} />}
        />
      </div>
      <Composer blockedReason={blocked} showSuggestions={hasVideo && activeReady && online} />
    </aside>
  );
}
