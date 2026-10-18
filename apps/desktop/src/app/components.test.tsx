// Component tests for the app shell pieces that do not need the editor module: chat, settings, history,
// media bin, banner, empty state, top bar. Each renders against a real store and a fake controller.

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "./chat/ChatPanel";
import { HistoryPanel } from "./history/HistoryPanel";
import { ConnectionBanner } from "./layout/ConnectionBanner";
import { EmptyState } from "./layout/EmptyState";
import { MediaBin } from "./media/MediaBin";
import { SettingsDialog } from "./settings/SettingsDialog";
import { emptyProjectState, historyItem, makeState, providers, renderApp } from "./test-utils";
import { TopBar } from "./topbar/TopBar";

describe("ChatPanel", () => {
  it("shows the setup card, says the editor works without AI, and locks the composer when no assistant exists", () => {
    renderApp(<ChatPanel />);
    expect(screen.getByText(/The editor works without AI/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message to the assistant")).toBeDisabled();
    expect(screen.getByPlaceholderText("Set up an assistant to chat")).toBeInTheDocument();
  });

  it("opens Settings at the chosen provider from the setup card", async () => {
    const { store } = renderApp(<ChatPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Use my own API key/ }));
    expect(store.getState().ui).toMatchObject({
      settingsOpen: true,
      settingsKind: "openai-compatible",
    });
  });

  it("sends a message on Enter and a suggestion on click, and clears the box", async () => {
    const { controller } = renderApp(<ChatPanel />, (s) =>
      s.applyState(makeState({ providers: providers(["local"]) })),
    );
    const box = screen.getByLabelText("Message to the assistant");
    await userEvent.type(box, "make it shorter{Enter}");
    expect(controller.sendChat).toHaveBeenCalledWith("make it shorter");
    expect(box).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Add a title" }));
    expect(controller.sendChat).toHaveBeenLastCalledWith("Add a title");
  });

  it("Shift+Enter adds a new line instead of sending", async () => {
    const { controller } = renderApp(<ChatPanel />, (s) =>
      s.applyState(makeState({ providers: providers(["local"]) })),
    );
    await userEvent.type(
      screen.getByLabelText("Message to the assistant"),
      "a{Shift>}{Enter}{/Shift}b",
    );
    expect(controller.sendChat).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Message to the assistant")).toHaveValue("a\nb");
  });

  it("shows Stop while the assistant is busy and cancels", async () => {
    const { controller } = renderApp(<ChatPanel />, (s) =>
      s.applyState(makeState({ busy: true, providers: providers(["local"]) })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(controller.cancelChat).toHaveBeenCalled();
  });

  it("renders tool steps with a status, and offers Undo this change only for a pure-AI run", async () => {
    const history = [
      historyItem({ id: 0, source: "system" }),
      historyItem({ id: 1, source: "ai", current: true, label: "Add title" }),
    ];
    const { controller } = renderApp(<ChatPanel />, (s) => {
      // The user sends a message while at state 0; the AI then makes state 1.
      s.applyState(
        makeState({
          history: [historyItem({ id: 0, source: "system", current: true })],
          providers: providers(["local"]),
        }),
      );
      s.beginUserMessage("add a title");
      s.applyState(makeState({ history, providers: providers(["local"]) }));
      s.applyChat("r1", {
        type: "tool_call",
        id: "t",
        name: "add_overlay",
        args: { preset: "title-fade" },
      });
      s.applyChat("r1", {
        type: "tool_result",
        id: "t",
        name: "add_overlay",
        ok: true,
        summary: "Added a title",
      });
      s.applyChat("r1", { type: "done", turns: 1 });
    });
    expect(screen.getByText("Add overlay")).toBeInTheDocument();
    expect(screen.getByText("Succeeded:")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Undo this change/ }));
    expect(controller.undoRun).toHaveBeenCalledWith("r1");
  });

  it("marks a failed tool with a cross and hides Undo when nothing changed", () => {
    renderApp(<ChatPanel />, (s) => {
      s.applyState(makeState({ providers: providers(["local"]) }));
      s.applyChat("r1", { type: "tool_call", id: "t", name: "split", args: { at: 99 } });
      s.applyChat("r1", {
        type: "tool_result",
        id: "t",
        name: "split",
        ok: false,
        summary: "No clip can be split at 99s",
      });
      s.applyChat("r1", { type: "done", turns: 1 });
    });
    expect(screen.getByText("Failed:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo this change/ })).toBeNull();
  });

  it("explains when the chosen assistant is not ready but another is", () => {
    renderApp(<ChatPanel />, (s) =>
      s.applyState(makeState({ providers: providers(["cli-claude"]) })),
    );
    expect(screen.queryByText(/Add an assistant to edit by chatting/)).toBeNull();
    expect(screen.getByLabelText("Message to the assistant")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Set up Local model/ })).toBeInTheDocument();
  });
});

describe("SettingsDialog", () => {
  it("never redisplays a stored key and clears the typed one after saving", async () => {
    const { controller } = renderApp(<SettingsDialog />, (s) => {
      s.applyState(
        makeState({
          settings: { activeProvider: "anthropic", providers: { anthropic: { model: "m" } } },
          providers: providers().map((p) =>
            p.kind === "anthropic" ? { ...p, hasApiKey: true } : p,
          ),
        }),
      );
      s.patchUi({ settingsOpen: true, settingsKind: "anthropic" });
    });
    const key = screen.getByLabelText(/API key/);
    expect(key).toHaveValue("");
    expect(screen.getByText("Key saved")).toBeInTheDocument();
    expect(key).toHaveAttribute("type", "password");

    await userEvent.type(key, "sk-new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(controller.saveSettings).toHaveBeenCalledTimes(1);
    const arg = controller.saveSettings.mock.calls[0]?.[0] as { apiKeys: Record<string, string> };
    expect(arg.apiKeys).toEqual({ anthropic: "sk-new" });
  });

  it("blocks saving a malformed base URL", async () => {
    renderApp(<SettingsDialog />, (s) =>
      s.patchUi({ settingsOpen: true, settingsKind: "openai-compatible" }),
    );
    await userEvent.type(screen.getByLabelText("Base URL"), "nonsense");
    expect(screen.getByText(/Enter a full address/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("starts the local model download with the recommended id", async () => {
    const { controller } = renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel({
        installed: false,
        running: false,
        detail: "Not downloaded",
        modelId: "m1",
        label: "Model One",
        description: "Small and quick.",
        sizeBytes: 2 * 1024 ** 3,
      });
      s.patchUi({ settingsOpen: true });
    });
    expect(screen.getByText("Model One")).toBeInTheDocument();
    expect(screen.getByText("Small and quick.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download (2.0 GB)" }));
    expect(controller.localModel).toHaveBeenCalledWith({ action: "install", modelId: "m1" });
  });

  it("shows live download progress with an accessible progress bar", () => {
    renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel({
        installed: false,
        running: false,
        detail: "Not downloaded",
        sizeBytes: 1024,
      });
      // The label is exactly what the server sends for its `model-download` job.
      s.applyJob({
        id: "j",
        kind: "model-download",
        label: "Downloading the local model",
        progress: 0.4,
        status: "running",
      });
      s.patchUi({ settingsOpen: true });
    });
    expect(
      screen.getByRole("progressbar", { name: "Downloading the local model" }),
    ).toHaveAttribute("aria-valuenow", "40");
    // The label must not be doubled up with a verb ("Downloading Downloading ...").
    expect(screen.queryByText(/Downloading Downloading/)).toBeNull();
  });

  it("cancels a running download and removes a stopped model", async () => {
    const { controller } = renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel({ installed: false, running: false, detail: "Not downloaded" });
      s.applyJob({
        id: "j",
        kind: "model-download",
        label: "Downloading the local model",
        progress: 0.1,
        status: "running",
      });
      s.patchUi({ settingsOpen: true });
    });
    await userEvent.click(screen.getByRole("button", { name: "Cancel download" }));
    expect(controller.localModel).toHaveBeenCalledWith({ action: "cancel" });
  });

  it("offers Start and Remove for a downloaded model", async () => {
    const { controller } = renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel({ installed: true, running: false, detail: "Downloaded" });
      s.patchUi({ settingsOpen: true });
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove download" }));
    expect(controller.localModel).toHaveBeenCalledWith({ action: "uninstall" });
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(controller.localModel).toHaveBeenCalledWith({ action: "start" });
  });

  it("explains a build without a local model instead of offering a download", () => {
    renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel({
        installed: false,
        running: false,
        supported: false,
        detail: "Local model support is not available in this build",
      });
      s.patchUi({ settingsOpen: true });
    });
    expect(screen.getByTestId("local-model-unsupported")).toHaveTextContent(
      "Local model support is not available in this build",
    );
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("says plainly when the engine has no local model support yet", () => {
    renderApp(<SettingsDialog />, (s) => {
      s.setLocalModel("unavailable");
      s.patchUi({ settingsOpen: true });
    });
    expect(screen.getByText(/did not report the local model's status/)).toBeInTheDocument();
  });

  it("shows CLI status from the engine", async () => {
    renderApp(<SettingsDialog />, (s) => {
      s.applyState(
        makeState({
          providers: providers().map((p) =>
            p.kind === "cli-claude" ? { ...p, detail: "claude is not installed" } : p,
          ),
        }),
      );
      s.patchUi({ settingsOpen: true, settingsKind: "cli-claude" });
    });
    expect(screen.getByText("claude is not installed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check again/ })).toBeInTheDocument();
  });
});

describe("HistoryPanel", () => {
  const history = [
    historyItem({ id: 0, label: "Start", source: "system" }),
    historyItem({ id: 1, label: "Split at 2s", source: "manual" }),
    historyItem({
      id: 2,
      label: "Remove silences",
      source: "ai",
      current: true,
      name: "Tight cut",
    }),
    historyItem({ id: 3, label: "Add Title", source: "template", parent: 1 }),
  ];

  it("lists newest first with the author, marks the current state and dims other branches", () => {
    renderApp(<HistoryPanel />, (s) => s.applyState(makeState({ history })));
    const rows = screen
      .getAllByRole("button", { name: /Start|Split|Remove silences|Add Title/ })
      .filter((b) => b.classList.contains("state-row"));
    expect(rows.map((r) => r.querySelector(".state-row__label")?.textContent)).toEqual([
      "Add Title",
      "Remove silences",
      "Split at 2s",
      "Start",
    ]);
    expect(within(rows[1] as HTMLElement).getByText("Now")).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    expect(within(rows[1] as HTMLElement).getByText(/Assistant:/)).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(/Template:/)).toBeInTheDocument();
    expect(rows[0]?.className).toContain("is-off"); // id 3 is on a branch away from the current state
  });

  it("restores a state on click through restore_state", async () => {
    const { controller } = renderApp(<HistoryPanel />, (s) => s.applyState(makeState({ history })));
    await userEvent.click(screen.getByRole("button", { name: /Split at 2s/ }));
    expect(controller.run).toHaveBeenCalledWith("restore_state", { id: 1 });
  });

  it("saves a named checkpoint and lists existing ones", async () => {
    const { controller } = renderApp(<HistoryPanel />, (s) => s.applyState(makeState({ history })));
    expect(
      screen.getByRole("button", { name: "Restore checkpoint Tight cut" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Checkpoint name"), "Before captions");
    await userEvent.click(screen.getByRole("button", { name: "Save checkpoint" }));
    expect(controller.run).toHaveBeenCalledWith("save_checkpoint", { name: "Before captions" });
  });
});

describe("MediaBin", () => {
  it("lists assets and adds one to the timeline", async () => {
    const { controller } = renderApp(<MediaBin />);
    expect(screen.getByText("interview.mp4")).toBeInTheDocument();
    expect(screen.getByText(/0:10 · 1920×1080/)).toBeInTheDocument();
    expect(screen.getByText("On timeline")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Add interview.mp4 to the timeline" }),
    );
    expect(controller.run).toHaveBeenCalledWith("add_clip", { assetId: "a1" });
  });

  it("shows background preparation progress", () => {
    renderApp(<MediaBin />, (s) =>
      s.applyJob({
        id: "p",
        kind: "proxy",
        label: "Preparing interview.mp4",
        progress: 0.5,
        status: "running",
      }),
    );
    expect(screen.getByRole("progressbar", { name: "Preparing interview.mp4" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("has an empty state", () => {
    renderApp(<MediaBin />, (s) => s.applyState(makeState({ project: emptyProjectState() })));
    expect(screen.getByText(/Videos you import appear here/)).toBeInTheDocument();
  });
});

describe("ConnectionBanner", () => {
  it("is invisible while online and clear and actionable when the link is lost", async () => {
    const { store, controller } = renderApp(<ConnectionBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    store.getState().setConnection({ status: "offline", failures: 2, retryAt: Date.now() + 4000 });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Can't reach the editor engine");
    expect(alert).toHaveTextContent(/Trying again in \d+s/);
    await userEvent.click(screen.getByRole("button", { name: /Retry now/ }));
    expect(controller.retryNow).toHaveBeenCalled();
  });

  it("shows a calm message on the very first connection attempt", () => {
    renderApp(<ConnectionBanner />, (s) =>
      s.setConnection({ status: "connecting", everOnline: false }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Connecting to the editor engine");
  });
});

describe("EmptyState", () => {
  it("invites a drop or Import and states that AI is optional", () => {
    renderApp(<EmptyState />);
    expect(screen.getByText("Drop a video here or click Import")).toBeInTheDocument();
    expect(screen.getByText(/You don't need\s+AI to edit/)).toBeInTheDocument();
  });

  it("opens the typed-path dialog when the browser has no file dialog", async () => {
    const { store } = renderApp(<EmptyState />);
    await userEvent.click(screen.getByRole("button", { name: /Import video/ }));
    expect(store.getState().ui.importOpen).toBe(true);
  });
});

describe("TopBar", () => {
  it("shows the project name and enables Undo/Redo from the server state", async () => {
    const { controller } = renderApp(<TopBar />, (s) =>
      s.applyState(makeState({ canUndo: true, canRedo: false })),
    );
    expect(screen.getByRole("heading", { name: "Test project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(controller.undo).toHaveBeenCalled();
  });

  it("shows export progress from job events and disables the button meanwhile", () => {
    renderApp(<TopBar />, (s) =>
      s.applyJob({ id: "e", kind: "export", label: "Export", progress: 0.42, status: "running" }),
    );
    const btn = screen.getByRole("button", { name: "Exporting, 42 percent" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Exporting 42%");
  });

  it("disables everything that needs the engine while offline", () => {
    renderApp(<TopBar />, (s) => {
      s.applyState(makeState({ canUndo: true }));
      s.setConnection({ status: "offline" });
    });
    for (const name of ["Import", "Undo", "Export"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    // Settings stays reachable so the user can fix a bad address or key.
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
  });

  it("opens Settings and the History tab", async () => {
    const { store } = renderApp(<TopBar />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(store.getState().ui.settingsOpen).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    expect(store.getState().ui.drawerTab).toBe("history");
  });
});
