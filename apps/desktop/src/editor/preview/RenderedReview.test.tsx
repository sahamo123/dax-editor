// Review rendering must expose errors/progress and refuse playback after a project revision changes.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { defaultProject, makeApi, makeState, renderEditor } from "../test-utils";
import { RenderedReview } from "./RenderedReview";

const review = { previewId: "preview-id", jobId: "job-id", projectId: "project-id", revision: 2 };

it("shows progress, sends explicit cancellation, plays the finished review and invalidates it on edit", async () => {
  const state = makeState(defaultProject(), { projectId: review.projectId, revision: 2 });
  const api = makeApi(state, async () => ({ ok: true, summary: "Started", data: review }));
  const view = renderEditor(<RenderedReview />, api);
  fireEvent.click(screen.getByRole("button", { name: "Review effects" }));
  await waitFor(() => expect(api.run).toHaveBeenCalledWith("render_preview", {}));
  await screen.findByText("Waiting for render status…");
  const running = {
    id: review.jobId,
    kind: "export" as const,
    label: "Preview",
    progress: 0.4,
    status: "running" as const,
  };
  view.setApi({ ...api, state: { ...state, jobs: [running] } });
  expect(screen.getByRole("progressbar", { name: "Preview render progress" })).toHaveAttribute(
    "value",
    "0.4",
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop preview render" }));
  await waitFor(() =>
    expect(api.run).toHaveBeenCalledWith("cancel_task", { taskId: review.jobId }),
  );
  view.setApi({ ...api, state: { ...state, jobs: [{ ...running, status: "done", progress: 1 }] } });
  expect(screen.getByLabelText("Complete edit review")).toHaveAttribute(
    "src",
    expect.stringContaining("/api/media/previews/preview-id/review.webm"),
  );
  view.setApi({ ...api, state: { ...state, revision: 3, jobs: [{ ...running, status: "done" }] } });
  expect(screen.queryByLabelText("Complete edit review")).not.toBeInTheDocument();
  expect(screen.getByText(/out of date/)).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review effects" })).toHaveFocus();
});

it("reports a failed request and keeps retry available without changing the project", async () => {
  const state = makeState(defaultProject());
  const api = makeApi(state, async () => ({ ok: false, error: "Renderer unavailable" }));
  renderEditor(<RenderedReview />, api);
  fireEvent.click(screen.getByRole("button", { name: "Review effects" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Renderer unavailable");
  expect(screen.getByRole("button", { name: "Render current edit" })).toBeEnabled();
  expect(api.state.project).toEqual(state.project);
});
