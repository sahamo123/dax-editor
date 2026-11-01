// Work and autosave problems remain visible and actionable without opening the assistant.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { makeState, renderApp } from "./test-utils";
import { TopBar } from "./topbar/TopBar";

it("shows failed and interrupted work alongside active tasks with accurate job labels", async () => {
  renderApp(<TopBar />, (store) =>
    store.applyState(
      makeState({
        tasks: [
          {
            id: "failed-export",
            title: "Export draft",
            kind: "export",
            mode: "edit",
            status: "failed",
            createdAt: 1,
            error: "Output unavailable",
          },
          {
            id: "interrupted-speech",
            title: "Transcribe interview",
            kind: "transcribe",
            mode: "edit",
            status: "interrupted",
            createdAt: 2,
          },
          {
            id: "active-render",
            title: "Render title",
            kind: "blender",
            mode: "edit",
            status: "running",
            createdAt: 3,
          },
          {
            id: "queued-chat",
            title: "Plan the intro",
            kind: "chat",
            mode: "plan",
            status: "queued",
            queuePosition: 1,
            createdAt: 4,
          },
          {
            id: "active-import",
            title: "Import footage",
            kind: "import",
            mode: "edit",
            status: "running",
            createdAt: 5,
          },
        ],
      }),
    ),
  );
  const work = screen.getByLabelText("Work status");
  expect(work).toHaveTextContent("3 active/queued");
  expect(work).toHaveTextContent("2 issues");
  await userEvent.click(work);
  const queue = screen.getByRole("list", { name: "Task queue" });
  expect(screen.getByText("Tasks · 2 running · 1 queued")).toBeVisible();
  expect(within(queue).getByText("Export", { exact: true })).toBeVisible();
  expect(within(queue).getByText("Transcription", { exact: true })).toBeVisible();
  expect(within(queue).getByText("Blender", { exact: true })).toBeVisible();
  expect(within(queue).getByText("Import", { exact: true })).toBeVisible();
  expect(within(queue).getByText("Output unavailable")).toBeVisible();
  expect(within(queue).getAllByText("Origin not recorded")).toHaveLength(5);
});

it("shows an autosave failure before opening Project and exposes the existing manual save", async () => {
  const { controller } = renderApp(<TopBar />, (store) =>
    store.applyState(makeState({ saveError: "Disk unavailable" })),
  );
  expect(screen.getByText("Save failed", { exact: true })).toBeVisible();
  await userEvent.click(screen.getByText("Project", { exact: true }));
  expect(screen.getByText(/Your latest changes may not be on disk/)).toBeVisible();
  await userEvent.click(screen.getByText("Technical details", { exact: true }));
  expect(screen.getByText("Disk unavailable", { exact: true })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Save project" }));
  expect(controller.project).toHaveBeenCalledWith("save");
});
