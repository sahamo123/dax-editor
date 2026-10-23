// Snapshot controls never test providers or send chat when saving/loading credentials.
import type { Settings } from "@dax/protocol";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../test-utils";
import { SavedConnections } from "./SavedConnections";

const settings: Settings = {
  activeProvider: "local",
  providers: {},
  savedConnections: [
    {
      id: "0663d854-98af-4a55-ac58-d5a11b4dcd91",
      name: "Local server",
      kind: "openai-compatible",
      config: { baseUrl: "http://127.0.0.1:1234/v1", model: "small" },
    },
  ],
};
describe("saved connection controls", () => {
  it("saves settings before snapshot creation, loads explicitly and never runs inference", async () => {
    const onSave = vi.fn(async () => true),
      onApply = vi.fn(),
      onBusy = vi.fn();
    const { controller } = renderApp(
      <SavedConnections
        kind="openai-compatible"
        settings={settings}
        onSave={onSave}
        onApply={onApply}
        onBusy={onBusy}
      />,
    );
    controller.connection.mockResolvedValue(settings);
    fireEvent.change(screen.getByLabelText("Connection name"), {
      target: { value: "Second local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save named connection" }));
    await waitFor(() =>
      expect(controller.connection).toHaveBeenCalledWith({
        action: "save",
        kind: "openai-compatible",
        name: "Second local",
      }),
    );
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(
      controller.connection.mock.invocationCallOrder[0] ?? 0,
    );
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "Load Local server" }));
    await waitFor(() => expect(onApply).toHaveBeenLastCalledWith(settings, true));
    expect(controller.testProvider).not.toHaveBeenCalled();
    expect(controller.sendChat).not.toHaveBeenCalled();
    expect(controller.run).not.toHaveBeenCalled();
  });
  it("does not capture a connection if settings could not be saved", async () => {
    const { controller } = renderApp(
      <SavedConnections
        kind="openai-compatible"
        settings={settings}
        onSave={async () => false}
        onApply={vi.fn()}
        onBusy={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save named connection" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save named connection" })).not.toBeDisabled(),
    );
    expect(controller.connection).not.toHaveBeenCalled();
  });
});
