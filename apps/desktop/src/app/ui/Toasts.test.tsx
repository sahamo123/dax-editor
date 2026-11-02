// Dialog notice routing must preserve the same toast, lifetime and announcement.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { NoticeHostProvider } from "../../editor";
import { renderApp } from "../test-utils";
import { Modal } from "./Modal";
import { Toasts } from "./Toasts";

function Fixture() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <NoticeHostProvider>
      <button type="button" onClick={() => setOuter(true)}>
        Open outer
      </button>
      {outer ? (
        <Modal title="Outer" onClose={() => setOuter(false)}>
          <button type="button" onClick={() => setInner(true)}>
            Open inner
          </button>
          {inner ? (
            <Modal title="Inner" onClose={() => setInner(false)}>
              <p>Inner content</p>
            </Modal>
          ) : null}
        </Modal>
      ) : null}
      <Toasts />
    </NoticeHostProvider>
  );
}

afterEach(() => vi.useRealTimers());

it("moves a single notice into nested dialogs without restarting its lifetime or announcement", () => {
  vi.useFakeTimers();
  const { store } = renderApp(<Fixture />);
  act(() => store.getState().pushToast("info", "Task finished."));
  const notice = screen.getByText("Task finished.", { selector: ".toast__text" });
  const announcement = screen.getByRole("status").firstElementChild;
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  expect(within(screen.getByRole("dialog", { name: "Outer" })).getByText("Task finished.")).toBe(
    notice,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open inner" }));
  expect(within(screen.getByRole("dialog", { name: "Inner" })).getByText("Task finished.")).toBe(
    notice,
  );
  expect(screen.getByRole("status").firstElementChild).toBe(announcement);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Inner" })).getByRole("button", { name: "Close" }),
  );
  expect(within(screen.getByRole("dialog", { name: "Outer" })).getByText("Task finished.")).toBe(
    notice,
  );
  act(() => vi.advanceTimersByTime(2999));
  expect(notice).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(notice).not.toBeInTheDocument();
});

it("adds a keyboard-scrollable region only while a dialog has notices", () => {
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  const dialog = screen.getByRole("dialog", { name: "Outer" });
  expect(within(dialog).queryByRole("region", { name: "Task notifications" })).toBeNull();
  act(() => store.getState().pushToast("error", "A task failed."));
  const region = within(dialog).getByRole("region", { name: "Task notifications" });
  expect(region).toHaveAttribute("tabindex", "0");
  fireEvent.click(within(region).getByRole("button", { name: "Dismiss message" }));
  expect(within(dialog).queryByRole("region", { name: "Task notifications" })).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("A task failed.");
});
