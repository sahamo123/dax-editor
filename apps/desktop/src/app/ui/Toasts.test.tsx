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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
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

it("keeps an error notice while a keyboard user reads the scrollable region", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("error", "Long synthetic error."));
  const dialog = screen.getByRole("dialog", { name: "Outer" });
  const region = within(dialog).getByRole("region", { name: "Task notifications" });
  const notice = within(region).getByText("Long synthetic error.");
  const announcement = screen.getByRole("alert").firstElementChild;
  act(() => vi.advanceTimersByTime(3000));
  act(() => region.focus());
  expect(region).toHaveFocus();
  act(() => vi.advanceTimersByTime(20000));
  expect(notice).toBeInTheDocument();
  expect(screen.getByRole("alert").firstElementChild).toBe(announcement);
  act(() => within(dialog).getByRole("button", { name: "Open inner" }).focus());
  act(() => vi.advanceTimersByTime(5999));
  expect(notice).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(notice).not.toBeInTheDocument();
});

it("retains a focused notice when several later notices arrive", () => {
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("error", "First error being read."));
  const region = within(screen.getByRole("dialog", { name: "Outer" })).getByRole("region", {
    name: "Task notifications",
  });
  act(() => region.focus());
  act(() => {
    for (let index = 1; index <= 4; index++) {
      store.getState().pushToast("error", `Later error ${index}.`);
    }
  });
  expect(within(region).getByText("First error being read.")).toBeInTheDocument();
  expect(within(region).getByText(/1 notification waiting/)).toBeInTheDocument();
  expect(within(region).queryByText("Later error 4.")).toBeNull();
  const dismiss = within(region).getAllByRole("button", { name: "Dismiss message" })[0];
  if (!dismiss) throw new Error("Missing dismiss button");
  act(() => dismiss.focus());
  fireEvent.click(dismiss);
  expect(region).toHaveFocus();
  expect(within(region).getByText("Later error 4.")).toBeInTheDocument();
  expect(within(region).queryByText(/notification waiting/)).toBeNull();
});

it("makes queue overflow explicit without evicting the notice being read", () => {
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("error", "First retained error."));
  const region = within(screen.getByRole("dialog", { name: "Outer" })).getByRole("region", {
    name: "Task notifications",
  });
  act(() => region.focus());
  act(() => {
    for (let index = 1; index <= 38; index++) {
      store.getState().pushToast("info", `Later notice ${index}.`);
    }
  });
  expect(within(region).getByText("First retained error.")).toBeInTheDocument();
  expect(within(region).getByText(/32 notifications waiting/)).toBeInTheDocument();
  expect(
    within(region).getByText(/3 additional notifications could not be retained/),
  ).toBeInTheDocument();
  expect(store.getState().queuedToasts).toHaveLength(32);
  fireEvent.click(within(region).getByRole("button", { name: "Dismiss overflow warning" }));
  expect(within(region).queryByText(/could not be retained/)).toBeNull();
});

it("retains a later error over a queued routine notice when the queue is full", () => {
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => {
    for (let index = 1; index <= 36; index++) {
      store.getState().pushToast("info", `Routine notice ${index}.`);
    }
  });
  const region = within(screen.getByRole("dialog", { name: "Outer" })).getByRole("region", {
    name: "Task notifications",
  });
  act(() => region.focus());
  act(() => store.getState().pushToast("error", "Urgent error after burst."));
  expect(within(region).getByText("Routine notice 1.")).toBeInTheDocument();
  expect(within(region).getByText(/1 error/)).toBeInTheDocument();
  expect(store.getState().queuedToasts.at(-1)?.text).toBe("Urgent error after burst.");
  expect(store.getState().queuedToasts.some((toast) => toast.text === "Routine notice 36.")).toBe(
    false,
  );
  expect(store.getState().omittedToastCount).toBe(1);
  expect(screen.getByRole("alert")).toHaveTextContent("Urgent error after burst.");
});

it("retains hovered notices and explicitly counts an error omitted from an all-error queue", () => {
  const { store } = renderApp(<Toasts />);
  act(() => store.getState().pushToast("error", "Hovered error."));
  const notice = screen.getByText("Hovered error.", { selector: ".toast__text" });
  const stack = notice.closest(".toasts");
  if (!(stack instanceof HTMLElement)) throw new Error("Missing standalone notice stack");
  fireEvent.pointerEnter(stack);
  act(() => {
    for (let index = 1; index <= 36; index++) {
      store.getState().pushToast("error", `Queued error ${index}.`);
    }
  });
  expect(notice).toBeInTheDocument();
  expect(store.getState().queuedToasts).toHaveLength(32);
  expect(store.getState().queuedToasts.at(-1)?.text).toBe("Queued error 35.");
  expect(store.getState().omittedToastCount).toBe(1);
  expect(
    within(stack).getByText(/1 additional notification could not be retained/),
  ).toBeInTheDocument();
});

it("promotes queued notices in order on expiry without repeating their announcement", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Toasts />);
  act(() => {
    for (let index = 1; index <= 6; index++) {
      store.getState().pushToast("info", `Ordered notice ${index}.`);
    }
  });
  const announcement = screen.getByRole("status").firstElementChild;
  expect(store.getState().queuedToasts.map((toast) => toast.text)).toEqual([
    "Ordered notice 5.",
    "Ordered notice 6.",
  ]);
  act(() => vi.advanceTimersByTime(6000));
  expect(store.getState().toasts.map((toast) => toast.text)).toEqual([
    "Ordered notice 5.",
    "Ordered notice 6.",
  ]);
  expect(screen.getByRole("status").firstElementChild).toBe(announcement);
  act(() => vi.advanceTimersByTime(5999));
  expect(screen.getByText("Ordered notice 5.", { selector: ".toast__text" })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText("Ordered notice 5.", { selector: ".toast__text" })).toBeNull();
});

it("preserves the waiting queue when the notice area moves between nested dialogs", () => {
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => {
    for (let index = 1; index <= 5; index++) {
      store.getState().pushToast("error", `Moving error ${index}.`);
    }
  });
  const outer = screen.getByRole("dialog", { name: "Outer" });
  const first = within(outer).getByText("Moving error 1.");
  fireEvent.click(within(outer).getByRole("button", { name: "Open inner" }));
  const inner = screen.getByRole("dialog", { name: "Inner" });
  expect(within(inner).getByText("Moving error 1.")).toBe(first);
  expect(within(inner).getByText(/1 notification waiting/)).toBeInTheDocument();
  fireEvent.click(within(inner).getByRole("button", { name: "Close" }));
  expect(within(outer).getByText("Moving error 1.")).toBe(first);
  expect(store.getState().queuedToasts.map((toast) => toast.text)).toEqual(["Moving error 5."]);
});

it("pauses stacked notices on pointer hover, including notices added during the hover", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("error", "First synthetic error."));
  const dialog = screen.getByRole("dialog", { name: "Outer" });
  const region = within(dialog).getByRole("region", { name: "Task notifications" });
  const error = within(region).getByText("First synthetic error.");
  fireEvent.pointerEnter(region);
  act(() => store.getState().pushToast("info", "Later synthetic notice."));
  const info = within(region).getByText("Later synthetic notice.");
  act(() => vi.advanceTimersByTime(20000));
  expect(error).toBeInTheDocument();
  expect(info).toBeInTheDocument();
  fireEvent.pointerLeave(region);
  act(() => vi.advanceTimersByTime(6000));
  expect(info).not.toBeInTheDocument();
  expect(error).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3000));
  expect(error).not.toBeInTheDocument();
});

it("keeps timers paused until both hover and keyboard focus leave", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("info", "Read this notice."));
  const dialog = screen.getByRole("dialog", { name: "Outer" });
  const region = within(dialog).getByRole("region", { name: "Task notifications" });
  const notice = within(region).getByText("Read this notice.");
  act(() => region.focus());
  fireEvent.pointerEnter(region);
  fireEvent.pointerLeave(region);
  act(() => vi.advanceTimersByTime(7000));
  expect(notice).toBeInTheDocument();
  act(() => within(dialog).getByRole("button", { name: "Open inner" }).focus());
  act(() => vi.advanceTimersByTime(6000));
  expect(notice).not.toBeInTheDocument();
});

it("resumes the remaining time after focus moves to a nested dialog", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("info", "Moving notice."));
  const outer = screen.getByRole("dialog", { name: "Outer" });
  const region = within(outer).getByRole("region", { name: "Task notifications" });
  const notice = within(region).getByText("Moving notice.");
  act(() => vi.advanceTimersByTime(2000));
  act(() => region.focus());
  act(() => vi.advanceTimersByTime(10000));
  fireEvent.click(within(outer).getByRole("button", { name: "Open inner" }));
  expect(within(screen.getByRole("dialog", { name: "Inner" })).getByText("Moving notice.")).toBe(
    notice,
  );
  act(() => vi.advanceTimersByTime(3999));
  expect(notice).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(notice).not.toBeInTheDocument();
});

it("pauses a standalone notice on hover and resumes after pointer leave", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Toasts />);
  act(() => store.getState().pushToast("info", "Standalone notice."));
  const notice = screen.getByText("Standalone notice.", { selector: ".toast__text" });
  const stack = notice.closest(".toasts");
  if (!stack) throw new Error("Missing standalone notice stack");
  fireEvent.pointerEnter(stack);
  act(() => vi.advanceTimersByTime(10000));
  expect(notice).toBeInTheDocument();
  fireEvent.pointerLeave(stack);
  act(() => vi.advanceTimersByTime(6000));
  expect(notice).not.toBeInTheDocument();
});

it("clears interaction when the window loses focus", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const { store } = renderApp(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open outer" }));
  act(() => store.getState().pushToast("info", "Window notice."));
  const region = within(screen.getByRole("dialog", { name: "Outer" })).getByRole("region", {
    name: "Task notifications",
  });
  const notice = within(region).getByText("Window notice.");
  act(() => region.focus());
  fireEvent.pointerEnter(region);
  fireEvent.blur(window);
  act(() => vi.advanceTimersByTime(6000));
  expect(notice).not.toBeInTheDocument();
});
