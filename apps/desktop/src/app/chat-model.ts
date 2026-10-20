// Pure functions that turn the server's `chat` events into the transcript the chat panel draws, and that decide
// whether "Undo this change" is still safe. No React, no network: easy to test.

import type { HistoryItem } from "@dax/core";
import type { AgentEvent } from "@dax/protocol";

/** One thing the assistant did or said during a run. */
export type RunStep =
  | { kind: "text"; key: string; text: string }
  | { kind: "status"; key: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: unknown;
      /** Absent while the tool is still running. */
      result?: { ok: boolean; summary: string };
    };

/** Everything in the transcript. */
export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "run";
      /** The server's run id. */
      id: string;
      steps: RunStep[];
      status: "running" | "done" | "error" | "cancelled";
      error?: string;
      /** Id of the history state the project was in when the run began; "Undo this change" returns to it. */
      startStateId: number | null;
      /** True from the moment the user pressed Stop until the run ends, so a closing event is read as "stopped". */
      cancelling?: boolean;
      /** How many undo steps were performed by "Undo this change", so it can be redone. */
      undoneSteps?: number;
    }
  | { kind: "notice"; id: string; tone: "error" | "info"; text: string };

/** Add a streamed or whole text chunk; consecutive text events extend one paragraph. */
function appendText(steps: RunStep[], text: string): RunStep[] {
  const last = steps[steps.length - 1];
  if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text: last.text + text }];
  return [...steps, { kind: "text", key: `t${steps.length}`, text }];
}

/** Apply one agent event to the list of steps of a run (and report its end state). */
function applyToRun(
  run: Extract<ChatItem, { kind: "run" }>,
  event: AgentEvent,
): Extract<ChatItem, { kind: "run" }> {
  // A run the user stopped stays stopped even if the server still sends its closing event.
  if (run.status === "cancelled" && (event.type === "done" || event.type === "error")) return run;
  if (run.cancelling && (event.type === "done" || event.type === "error")) {
    return { ...run, status: "cancelled", steps: run.steps.filter((s) => s.kind !== "status") };
  }
  switch (event.type) {
    case "status": {
      const last = run.steps[run.steps.length - 1];
      // A new status replaces the previous one so "Thinking..." does not pile up.
      const steps =
        last?.kind === "status"
          ? [...run.steps.slice(0, -1), { ...last, text: event.text }]
          : [
              ...run.steps,
              { kind: "status" as const, key: `s${run.steps.length}`, text: event.text },
            ];
      return { ...run, steps };
    }
    case "text":
      return {
        ...run,
        steps: appendText(
          run.steps.filter((s) => s.kind !== "status"),
          event.text,
        ),
      };
    case "tool_call":
      return {
        ...run,
        steps: [
          ...run.steps.filter((s) => s.kind !== "status"),
          { kind: "tool", id: event.id, name: event.name, args: event.args },
        ],
      };
    case "tool_result":
      return {
        ...run,
        steps: run.steps.map((s) =>
          s.kind === "tool" && s.id === event.id
            ? { ...s, result: { ok: event.ok, summary: event.summary } }
            : s,
        ),
      };
    case "done":
      return { ...run, status: "done", steps: run.steps.filter((s) => s.kind !== "status") };
    case "error":
      return {
        ...run,
        status: "error",
        error: event.message,
        steps: run.steps.filter((s) => s.kind !== "status"),
      };
  }
}

/**
 * Fold a `chat` event into the transcript. The first event of an unknown `runId` starts a new run whose
 * "undo point" is `startStateId`.
 */
export function applyChatEvent(
  items: ChatItem[],
  runId: string,
  event: AgentEvent,
  startStateId: number | null,
): ChatItem[] {
  const idx = items.findIndex((i) => i.kind === "run" && i.id === runId);
  const existing = items[idx];
  if (existing?.kind === "run") {
    return items.map((i, n) => (n === idx ? applyToRun(existing, event) : i));
  }
  const fresh: Extract<ChatItem, { kind: "run" }> = {
    kind: "run",
    id: runId,
    steps: [],
    status: "running",
    startStateId,
  };
  return [...items, applyToRun(fresh, event)];
}

/** Flag (or unflag) every running run as being stopped by the user. */
export function setCancelling(items: ChatItem[], cancelling: boolean): ChatItem[] {
  return items.map((i) => (i.kind === "run" && i.status === "running" ? { ...i, cancelling } : i));
}

/** Mark every running run as cancelled (the user pressed Stop). */
export function markCancelled(items: ChatItem[]): ChatItem[] {
  return items.map((i) =>
    i.kind === "run" && i.status === "running"
      ? { ...i, status: "cancelled", steps: i.steps.filter((s) => s.kind !== "status") }
      : i,
  );
}

/** The id of the state the project is in right now, or `null` before any state arrived. */
export function currentStateId(history: HistoryItem[]): number | null {
  return history.find((h) => h.current)?.id ?? null;
}

/**
 * How many `undo` steps return the project to `startStateId`, provided every state in between was made by the
 * AI. Returns 0 when there is nothing to undo, and -1 when the chain contains a manual edit or does not lead
 * back to the start (so a blanket "undo the AI" would also throw away the user's own work).
 */
export function aiStepsSince(history: HistoryItem[], startStateId: number | null): number {
  if (startStateId === null) return -1;
  const byId = new Map(history.map((h) => [h.id, h]));
  let node = history.find((h) => h.current);
  let steps = 0;
  while (node && node.id !== startStateId) {
    if (node.source !== "ai") return -1;
    steps++;
    node = node.parent === null ? undefined : byId.get(node.parent);
  }
  return node ? steps : -1;
}
