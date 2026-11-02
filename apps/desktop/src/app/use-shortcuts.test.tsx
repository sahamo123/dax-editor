// Project history shortcuts must not escape a modal dialog.
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { renderApp } from "./test-utils";
import { useUndoRedoKeys } from "./use-shortcuts";

function Shortcuts() {
  useUndoRedoKeys();
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Editor control</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Settings">
          <button type="button" onClick={() => setOpen(false)}>
            Close settings
          </button>
          <input aria-label="Dialog text" />
        </div>
      ) : null}
    </>
  );
}

function UndoOnly() {
  useUndoRedoKeys();
  return null;
}

it("keeps undo and redo out of the project when a modal owns the keyboard", () => {
  const { controller } = renderApp(<Shortcuts />);
  const close = screen.getByRole("button", { name: "Close settings" });
  fireEvent.keyDown(close, { key: "z", ctrlKey: true });
  fireEvent.keyDown(close, { key: "z", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(close, { key: "y", ctrlKey: true });
  expect(controller.undo).not.toHaveBeenCalled();
  expect(controller.redo).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Dialog text" }), {
    key: "z",
    ctrlKey: true,
  });
  expect(controller.undo).not.toHaveBeenCalled();
  fireEvent.click(close);
  fireEvent.keyDown(screen.getByRole("button", { name: "Editor control" }), {
    key: "z",
    ctrlKey: true,
  });
  expect(controller.undo).toHaveBeenCalledOnce();
});

it("does not undo or redo if focus leaves an open modal", () => {
  const { controller } = renderApp(<Shortcuts />);
  const background = screen.getByRole("button", { name: "Editor control" });
  background.focus();
  expect(background).toHaveFocus();
  fireEvent.keyDown(background, { key: "z", ctrlKey: true });
  fireEvent.keyDown(background, { key: "y", ctrlKey: true });
  expect(controller.undo).not.toHaveBeenCalled();
  expect(controller.redo).not.toHaveBeenCalled();
});

it("does not block history for hidden or non-modal dialogs", () => {
  const { controller } = renderApp(
    <>
      <UndoOnly />
      <button type="button">Editor control</button>
      <div role="dialog" aria-modal="true" hidden>
        Hidden modal
      </div>
      <dialog open>Non-modal dialog</dialog>
    </>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Editor control" }), {
    key: "z",
    ctrlKey: true,
  });
  expect(controller.undo).toHaveBeenCalledOnce();
});
