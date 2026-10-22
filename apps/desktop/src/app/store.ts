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
  | "connections";

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
  /** Undo point recorded when the user sent a message, claimed by the first event of the new run. */
  pendingStartId: number | null;
  /** True between sending a message and its first event, so the composer locks right away. */
  chatSending: boolean;
  /** Last `GET /api/local-model`; `"unavailable"` when that request failed, `null` before the first answer. */
  localModel: LocalModelStatus | "unavailable" | null;
  toasts: Toast[];
  ui: UiState;

  /** Remember which engine we talk to. */
  setServer(server: ServerConnection | null): void;
  /** Merge changes into the connection status. */
  setConnection(patch: Partial<ConnectionState>): void;
  /** Replace the server state (a `state` push or a REST read). */
  applyState(state: StateResponse): void;
  /** Record the latest progress of a background job. */
  applyJob(job: JobInfo): void;
  /** Fold one `chat` event into the transcript. */
  applyChat(runId: string, event: AgentEvent, startStateId?: number): void;
  /** Add the user's message and remember the current history state as the undo point of the coming run. */
  beginUserMessage(text: string): void;
  /** Add a system line (for example a refused request) to the transcript. */
  addNotice(tone: "error" | "info", text: string): void;
  /** Mark every running run as stopped. */
  cancelChatLocally(): void;
  /** Flag running runs as being stopped, so the server's closing event reads as "stopped". */
  setCancelling(cancelling: boolean): void;
  /** Update bookkeeping on one run (how many undo steps "Undo this change" performed). */
  patchRun(runId: string, patch: { undoneSteps?: number }): void;
  /** Store the local model status. */
  setLocalModel(status: LocalModelStatus | "unavailable"): void;
  /** Show a short message in the corner. */
  pushToast(tone: Toast["tone"], text: string): void;
  /** Remove a toast. */
  dismissToast(id: number): void;
  /** Merge changes into the UI state (open dialogs, drawer tab, ...). */
  patchUi(patch: Partial<UiState>): void;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}${nextId++}`;

const DRAWER_KEY = "dax.drawerTab";

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
      v === "connections"
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
    pendingStartId: null,
    chatSending: false,
    localModel: null,
    toasts: [],
    ui: {
      settingsOpen: false,
      settingsKind: null,
      importOpen: false,
      importNote: null,
      exportOpen: false,
      drawerOpen: true,
      drawerTab: readDrawerTab(),
      dropHover: false,
    },

    setServer: (server) => set({ server }),
    setConnection: (patch) => set((s) => ({ connection: { ...s.connection, ...patch } })),

    applyState: (state) =>
      set((s) => {
        // The state's job list is authoritative for jobs it names; job events fill in the gaps between pushes.
        const jobs = { ...s.jobs };
        for (const j of state.jobs) jobs[j.id] = j;
        return { state, jobs };
      }),

    applyJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),

    applyChat: (runId, event, startStateId) =>
      set((s) => {
        const known = s.chat.some((i) => i.kind === "run" && i.id === runId);
        // A run we did not start (another window) has no recorded undo point; use where we are now.
        const start = known
          ? null
          : (startStateId ??
            s.pendingStartId ??
            (s.state ? currentStateId(s.state.history) : null));
        return {
          chat: applyChatEvent(s.chat, runId, event, start),
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

    setCancelling: (cancelling) => set((s) => ({ chat: setCancelling(s.chat, cancelling) })),

    cancelChatLocally: () => set((s) => ({ chat: markCancelled(s.chat), chatSending: false })),

    patchRun: (runId, patch) =>
      set((s) => ({
        chat: s.chat.map((i) => (i.kind === "run" && i.id === runId ? { ...i, ...patch } : i)),
      })),

    setLocalModel: (localModel) => set({ localModel }),

    pushToast: (tone, text) =>
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id: nextId++, tone, text }] })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    patchUi: (patch) => {
      set({ ui: { ...get().ui, ...patch } });
    },
  }));
}
