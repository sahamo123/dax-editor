// Modal focus stays with the active dialog when its controls change.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Modal } from "./Modal";

it("recovers focus when a focused action becomes disabled and returns it on close", async () => {
  const onClose = () => view.rerender(<button type="button">Open settings</button>);
  const modal = (disabled: boolean) => (
    <>
      <button type="button">Open settings</button>
      <Modal title="Settings" onClose={onClose}>
        <button type="button" disabled={disabled}>
          Save
        </button>
      </Modal>
    </>
  );
  const view = render(<button type="button">Open settings</button>);
  screen.getByRole("button", { name: "Open settings" }).focus();
  view.rerender(modal(false));
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  screen.getByRole("button", { name: "Save" }).focus();
  view.rerender(modal(true));
  await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Open settings" })).toHaveFocus();
});

it("keeps programmatic focus in the topmost dialog, without taking focus from another application", () => {
  render(
    <>
      <button type="button">Background</button>
      <Modal title="Outer" onClose={() => {}}>
        <button type="button">Outer action</button>
        <Modal title="Inner" onClose={() => {}}>
          <button type="button">Inner action</button>
        </Modal>
      </Modal>
    </>,
  );
  const inner = screen.getByRole("dialog", { name: "Inner" });
  screen.getByRole("button", { name: "Background" }).focus();
  expect(inner.contains(document.activeElement)).toBe(true);
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  try {
    screen.getByRole("button", { name: "Background" }).focus();
    expect(screen.getByRole("button", { name: "Background" })).toHaveFocus();
  } finally {
    hasFocus.mockRestore();
  }
});
