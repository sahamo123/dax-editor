// Editing an effect must not create history for each digit or submit invalid numbers.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EffectNumber } from "./EffectFields";

describe("effect numeric fields", () => {
  it("commits once on blur and refuses invalid or unchanged values", () => {
    const onCommit = vi.fn();
    render(<EffectNumber label="Scale" value={1.15} min={1.02} max={3} onCommit={onCommit} />);
    const input = screen.getByLabelText("Scale");
    fireEvent.change(input, { target: { value: "2" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(2);
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "1.15" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
