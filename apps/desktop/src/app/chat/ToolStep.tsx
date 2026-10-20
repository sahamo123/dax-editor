// One tool call the assistant made, drawn as a compact row: a spinner, check or cross, the command in plain
// words and its result. Expands to show the exact arguments, so nothing the assistant did is hidden.

import type { ReactElement } from "react";
import type { RunStep } from "../chat-model";
import { humanizeCommand, summarizeArgs } from "../format";
import { Icon } from "../ui/icons";

/** Props of {@link ToolStep}. */
export interface ToolStepProps {
  step: Extract<RunStep, { kind: "tool" }>;
}

/** A single tool call with its outcome. */
export function ToolStep({ step }: ToolStepProps): ReactElement {
  const { result } = step;
  const state = result ? (result.ok ? "ok" : "fail") : "running";
  const args = summarizeArgs(step.args);
  return (
    <details className={`tool tool--${state}`}>
      <summary className="tool__row">
        <span className="tool__icon">
          {state === "running" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Icon name={state === "ok" ? "check" : "x"} size={14} />
          )}
          <span className="sr-only">
            {state === "running" ? "Running" : state === "ok" ? "Succeeded" : "Failed"}:
          </span>
        </span>
        <span className="tool__name">{humanizeCommand(step.name)}</span>
        <span className="tool__summary">{result ? result.summary : args || "Working..."}</span>
        <span className="tool__chev" aria-hidden="true">
          <Icon name="chevronRight" size={12} />
        </span>
      </summary>
      <div className="tool__detail">
        <div className="tool__label">Command</div>
        <code>{step.name}</code>
        <div className="tool__label">Arguments</div>
        <pre>{JSON.stringify(step.args ?? {}, null, 2)}</pre>
        {result ? (
          <>
            <div className="tool__label">Result</div>
            <p>{result.summary}</p>
          </>
        ) : null}
      </div>
    </details>
  );
}
