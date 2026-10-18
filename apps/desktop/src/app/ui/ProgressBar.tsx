// A determinate progress bar with the right ARIA role, used for model downloads and background jobs.

import type { ReactElement } from "react";

/** Props of {@link ProgressBar}. */
export interface ProgressBarProps {
  /** 0 to 1. Values outside the range are clamped. */
  value: number;
  /** Accessible name, e.g. "Downloading model". */
  label: string;
}

/** A thin bar showing `value` (0 to 1). */
export function ProgressBar({ value, label }: ProgressBarProps): ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
