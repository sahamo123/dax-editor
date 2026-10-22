// The tabbed side drawer: Presets and Inspector (from the editor module), Media bin and History (app shell).
// Implements the WAI-ARIA tabs pattern: arrow keys move between tabs, only the active panel is mounted.

import { type KeyboardEvent, type ReactElement, useRef } from "react";
import { Inspector, PresetsPanel } from "../../editor";
import { useApp } from "../context";
import { HistoryPanel } from "../history/HistoryPanel";
import { MediaBin } from "../media/MediaBin";
import { type DrawerTab, rememberDrawerTab } from "../store";
import { Icon, type IconName } from "../ui/icons";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { ProjectTools } from "./ProjectTools";
import { SpeechPanel } from "./SpeechPanel";

const TABS: { id: DrawerTab; label: string; icon: IconName }[] = [
  { id: "tools", label: "Tools", icon: "settings" },
  { id: "speech", label: "Speech", icon: "media" },
  { id: "connections", label: "Connect AI", icon: "settings" },
  { id: "presets", label: "Presets", icon: "presets" },
  { id: "inspector", label: "Inspector", icon: "inspector" },
  { id: "media", label: "Media", icon: "media" },
  { id: "history", label: "History", icon: "history" },
];

/** The right-hand tabbed panel. */
export function Drawer(): ReactElement {
  const tab = useApp((s) => s.ui.drawerTab);
  const patchUi = useApp((s) => s.patchUi);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: DrawerTab) => {
    rememberDrawerTab(id);
    patchUi({ drawerTab: id });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (!target) return;
    select(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <aside className="drawer" aria-label="Side panel">
      <div className="tabs" role="tablist" aria-label="Side panel sections" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            aria-label={t.label}
            title={t.label}
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => select(t.id)}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div
        className="drawer__panel"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "presets" ? <PresetsPanel /> : null}
        {tab === "inspector" ? <Inspector /> : null}
        {tab === "media" ? <MediaBin /> : null}
        {tab === "history" ? <HistoryPanel /> : null}
        {tab === "tools" ? <ProjectTools /> : null}
        {tab === "speech" ? <SpeechPanel /> : null}
        {tab === "connections" ? <ConnectionsPanel /> : null}
      </div>
    </aside>
  );
}
