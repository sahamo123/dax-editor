// Small labelled fields commit one validated command after editing, rather than one history state per keystroke.
import { type ReactElement, useEffect, useState } from "react";

/** Numeric effect field; commits on blur/Enter only when finite, in range and changed. Invalid input is marked and retained for correction. */
export function EffectNumber({
  label,
  value,
  min = 0,
  max = 3600,
  step = 0.1,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit(value: number): void;
}): ReactElement {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const numeric = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(numeric) && numeric >= min && numeric <= max;
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={!valid}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (valid && numeric !== value) onCommit(numeric);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {!valid ? (
        <small>
          Enter a number from {min} to {max}.
        </small>
      ) : null}
    </label>
  );
}

/** Labelled finite-choice field; each explicit selection commits one operation. */
export function EffectSelect({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onCommit(value: string): void;
}): ReactElement {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="input" value={value} onChange={(event) => onCommit(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
