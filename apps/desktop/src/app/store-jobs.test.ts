// A delayed snapshot must not resurrect completed work or hide newer job events from editor views.
import type { JobInfo } from "@dax/protocol";
import { expect, it } from "vitest";
import { createAppStore } from "./store";
import { makeState } from "./test-utils";

const running: JobInfo = {
  id: "review-job",
  kind: "export",
  label: "Review",
  progress: 0.5,
  status: "running",
};

it.each(["done", "error"] as const)(
  "updates editor state immediately when a job becomes %s",
  (status) => {
    const store = createAppStore();
    store.getState().applyState(makeState({ jobs: [running] }));
    const terminal = { ...running, status, progress: 1 };
    store.getState().applyJob(terminal);
    expect(store.getState().state?.jobs).toContainEqual(terminal);
  },
);

it.each(["done", "error"] as const)(
  "refuses delayed running snapshots/events after %s",
  (status) => {
    const store = createAppStore();
    store.getState().applyState(makeState({ jobs: [running] }));
    const terminal = { ...running, status, progress: 1 };
    store.getState().applyJob(terminal);
    store.getState().applyState(makeState({ jobs: [running] }));
    store.getState().applyJob(running);
    expect(store.getState().jobs[running.id]).toEqual(terminal);
    expect(store.getState().state?.jobs).toContainEqual(terminal);
  },
);

it("retains newly observed jobs when an older snapshot does not contain them", () => {
  const store = createAppStore();
  store.getState().applyState(makeState());
  store.getState().applyJob(running);
  store.getState().applyState(makeState());
  expect(store.getState().state?.jobs).toContainEqual(running);
});
