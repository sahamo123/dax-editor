// The UI's single source of truth (zustand, vanilla store so it can be created per test): server state,
// connection status, chat transcript, toasts and which dialogs/tabs are open. Holds data and small synchronous
// updates only; anything that talks to the server lives in controller.ts.

import type {
  AgentEvent,
  JobInfo,
  LocalModelStatus,
  ProviderKind,
  StateResponse,
} from "@dax/protocol";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { ServerConnection } from "../platform";
import {
  applyChatEvent,
  type ChatItem,
  currentStateId,
  markCancelled,
  setCancelling,
} from "./chat-model";

/** Tabs of the side drawer. */
export type DrawerTab =
  | "presets"
  | "inspector"
  | "media"
  | "history"
  | "tools"
  | "speech"
  | "connections"
  | "motion";

/** Where the link to the engine stands. */
interface ConnectionState {
  /** `idle` before anything was tried; `connecting` first time; `online`; `offline` after a loss. */
  status: "idle" | "connecting" | "online" | "offline";
  /** Consecutive failures since the last time we were online. */
  failures: number;
  /** Epoch ms of the next automatic attempt, for the countdown in the banner. */
  retryAt: number | null;
  /** True once we have been online at least once, so the first-load spinner is not confused with a lost link. */
  everOnline: boolean;
}

/** A short message that fades by itself. */
export interface Toast {
  id: number;
  tone: "info" | "success" | "error";
  text: string;
}

/** Pending live-region notices, bounded independently by priority until consumed by the UI. */
interface PendingAnnouncements {
  /** Informational and success notices in arrival order. */
  polite: Toast[];
  /** Error notices in arrival order. */
  urgent: Toast[];
  /** Additional polite notices exceeded the pending limit. */
  politeOverflow: boolean;
  /** Additional urgent notices exceeded the pending limit. */
  urgentOverflow: boolean;
}

const MAX_PENDING_ANNOUNCEMENTS = 8;

function emptyAnnouncements(): PendingAnnouncements {
  return { polite: [], urgent: [], politeOverflow: false, urgentOverflow: false };
}

function queueAnnouncement(batch: PendingAnnouncements, toast: Toast): PendingAnnouncements {
  if (toast.tone === "error") {
    return batch.urgent.length < MAX_PENDING_ANNOUNCEMENTS
      ? { ...batch, urgent: [...batch.urgent, toast] }
      : { ...batch, urgentOverflow: true };
  }
  return batch.polite.length < MAX_PENDING_ANNOUNCEMENTS
    ? { ...batch, polite: [...batch.polite, toast] }
    : { ...batch, politeOverflow: true };
}

/** What is open on screen. */
interface UiState {
  settingsOpen: boolean;
  /** Provider selected in the settings dialog when it opens. */
  settingsKind: ProviderKind | null;
  importOpen: boolean;
  /** Extra sentence at the top of the import dialog (for example after a drop that carried no paths). */
  importNote: string | null;
  exportOpen: boolean;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  /** Whether the optional empty-project setup surface is shown. */
  setupVisible: boolean;
  /** A file is being dragged over the window. */
  dropHover: boolean;
}

/** The whole store: data plus synchronous updaters. */
export interface AppStore {
  server: ServerConnection | null;
  connection: ConnectionState;
  state: StateResponse | null;
  jobs: Record<string, JobInfo>;
  chat: ChatItem[];
  /** Run IDs awaiting a Stop response, including runs without a transcript event yet. */
  stoppingRunIds: string[];
  /** Recently confirmed stopped run IDs, so delayed events cannot revive them. */
  stoppedRunIds: string[];
  /** Undo point recorded when the user sent a message, claimed by the first event of the new run. */
  pendingStartId: number | null;
  /** True between sending a message and its first event, so the composer locks right away. */
  chatSending: boolean;
  /** Last `GET /api/local-model`; `"unavailable"` when that request failed, `null` before the first answer. */
  localModel: LocalModelStatus | "unavailable" | null;
  toasts: Toast[];
  /** Notices awaiting delivery to the separate polite and urgent live regions. */
  pendingAnnouncements: PendingAnnouncements;
  ui: UiState;

  /** Remember which engine we talk to. */
  setServer(server: ServerConnection | null): void;
  /** Merge changes into the connection status. */
  setConnection(patch: Partial<ConnectionState>): void;
  /** Apply a server snapshot without replacing a newer same-project revision or terminal job outcomes. */
  applyState(state: StateResponse): void;
  /** Update job progress in both store views; completed jobs cannot return to running. */
  applyJob(job: JobInfo): void;
  /** Fold one `chat` event into the transcript. */
  applyChat(runId: string, event: AgentEvent, startStateId?: number): void;
  /** Add the user's message and remember the current history state as the undo point of the coming run. */
  beginUserMessage(text: string): void;
  /** Add a system line (for example a refused request) to the transcript. */
  addNotice(tone: "error" | "info", text: string): void;
  /** Mark only the identified, confirmed stopped run. */
  cancelChatLocally(runId: string): void;
  /** Record or clear Stop intent for a particular run. */
  setCancelling(runId: string, cancelling: boolean): void;
  /** Update bookkeeping on one run (how many undo steps "Undo this change" performed). */
  patchRun(runId: string, patch: { undoneSteps?: number }): void;
  /** Store the local model status. */
  setLocalModel(status: LocalModelStatus | "unavailable"): void;
  /** Show a short message in the corner. */
  pushToast(tone: Toast["tone"], text: string): void;
  /** Remove a toast. */
  dismissToast(id: number): void;
  /** Atomically return and clear pending live-region notices without removing visible toasts. */
  consumeAnnouncements(): PendingAnnouncements;
  /** Merge changes into the UI state (open dialogs, drawer tab, ...). */
  patchUi(patch: Partial<UiState>): void;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}${nextId++}`;

const DRAWER_KEY = "dax.drawerTab";

function mergeJob(jobs: Record<string, JobInfo>, incoming: JobInfo): void {
  const known = jobs[incoming.id];
  // Provider checks can delay snapshots behind completion events. Job IDs are never reused.
  if (known && known.status !== "running" && incoming.status === "running") return;
  jobs[incoming.id] = incoming;
}

function readDrawerTab(): DrawerTab {
  try {
    const v = window.localStorage.getItem(DRAWER_KEY);
    if (
      v === "presets" ||
      v === "inspector" ||
      v === "media" ||
      v === "history" ||
      v === "tools" ||
      v === "speech" ||
      v === "connections" ||
      v === "motion"
    )
      return v;
  } catch {
    // Storage unavailable: use the default.
  }
  return "presets";
}

/** Remember the drawer tab across launches (a per-viewer convenience only). */
export function rememberDrawerTab(tab: DrawerTab): void {
  try {
    window.localStorage.setItem(DRAWER_KEY, tab);
  } catch {
    // Not fatal.
  }
}

/** Create a fresh store. The app creates one; tests create their own. */
export function createAppStore(): StoreApi<AppStore> {
  return createStore<AppStore>((set, get) => ({
    server: null,
    connection: { status: "idle", failures: 0, retryAt: null, everOnline: false },
    state: null,
    jobs: {},
    chat: [],
    stoppingRunIds: [],
    stoppedRunIds: [],
    pendingStartId: null,
    chatSending: false,
    localModel: null,
    toasts: [],
    pendingAnnouncements: emptyAnnouncements(),
    ui: {
      settingsOpen: false,
      settingsKind: null,
      importOpen: false,
      importNote: null,
      exportOpen: false,
      drawerOpen: true,
      drawerTab: readDrawerTab(),
      setupVisible: true,
      dropHover: false,
    },

    setServer: (server) => set({ server }),
    setConnection: (patch) => set((s) => ({ connection: { ...s.connection, ...patch } })),

    applyState: (state) =>
      set((s) => {
        const jobs = { ...s.jobs };
        for (const job of state.jobs) mergeJob(jobs, job);
        const current = s.state;
        const staleProject =
          current?.projectId !== undefined &&
          state.projectId === current.projectId &&
          current.revision !== undefined &&
          state.revision !== undefined &&
          state.revision < current.revision;
        const accepted = staleProject ? current : state;
        return {
          state: { ...accepted, jobs: Object.values(jobs) },
          jobs,
          ui: !s.state && accepted.projectPath ? { ...s.ui, setupVisible: false } : s.ui,
        };
      }),

    applyJob: (job) =>
      set((s) => {
        const jobs = { ...s.jobs };
        mergeJob(jobs, job);
        return { jobs, state: s.state ? { ...s.state, jobs: Object.values(jobs) } : null };
      }),

    applyChat: (runId, event, startStateId) =>
      set((s) => {
        const known = s.chat.some((i) => i.kind === "run" && i.id === runId);
        // A run we did not start (another window) has no recorded undo point; use where we are now.
        const start = known
          ? null
          : (startStateId ??
            s.pendingStartId ??
            (s.state ? currentStateId(s.state.history) : null));
        let chat = applyChatEvent(s.chat, runId, event, start);
        if (s.stoppingRunIds.includes(runId)) chat = setCancelling(chat, runId, true);
        if (s.stoppedRunIds.includes(runId)) chat = markCancelled(chat, runId);
        return {
          chat,
          pendingStartId: known ? s.pendingStartId : null,
          chatSending: false,
        };
      }),

    beginUserMessage: (text) =>
      set((s) => ({
        chat: [...s.chat, { kind: "user", id: uid("u"), text }],
        pendingStartId: s.state ? currentStateId(s.state.history) : null,
        chatSending: true,
      })),

    addNotice: (tone, text) =>
      set((s) => ({
        chat: [...s.chat, { kind: "notice", id: uid("n"), tone, text }],
        chatSending: false,
      })),

    setCancelling: (runId, cancelling) =>
      set((s) => ({
        chat: setCancelling(s.chat, runId, cancelling),
        stoppingRunIds: cancelling
          ? [...new Set([...s.stoppingRunIds, runId])]
          : s.stoppingRunIds.filter((id) => id !== runId),
      })),

    cancelChatLocally: (runId) =>
      set((s) => ({
        chat: markCancelled(s.chat, runId),
        stoppingRunIds: s.stoppingRunIds.filter((id) => id !== runId),
        stoppedRunIds: [...s.stoppedRunIds.filter((id) => id !== runId), runId].slice(-100),
      })),

    patchRun: (runId, patch) =>
      set((s) => ({
        chat: s.chat.map((i) => (i.kind === "run" && i.id === runId ? { ...i, ...patch } : i)),
      })),

    setLocalModel: (localModel) => set({ localModel }),

    pushToast: (tone, text) =>
      set((s) => {
        const toast = { id: nextId++, tone, text };
        return {
          toasts: [...s.toasts.slice(-3), toast],
          pendingAnnouncements: queueAnnouncement(s.pendingAnnouncements, toast),
        };
      }),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    consumeAnnouncements: () => {
      const batch = get().pendingAnnouncements;
      set({ pendingAnnouncements: emptyAnnouncements() });
      return batch;
    },

    patchUi: (patch) => {
      set({ ui: { ...get().ui, ...patch } });
    },
  }));
}
