// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fader from "./Fader";

afterEach(cleanup);

describe("native-compatible fader range", () => {
  it("displays unity below the +10 dB maximum and sends linear boost", () => {
    const onChange = vi.fn();
    render(<Fader label="Output volume" value={1} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Output volume" }) as HTMLInputElement;
    expect(slider.min).toBe("-60");
    expect(slider.max).toBe("10");
    expect(slider.value).toBe("0");
    expect(screen.getByText("+10")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "10" } });
    expect(onChange.mock.calls.at(-1)?.[0]).toBeCloseTo(10 ** (10 / 20));
  });

  it("displays native boosted values and keeps the lower endpoint muted", () => {
    const onChange = vi.fn();
    render(<Fader label="Input volume" value={10 ** (10 / 20)} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Input volume" }) as HTMLInputElement;
    expect(slider.value).toBe("10");
    expect(screen.getByTitle("Input volume: 10.0 dB")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "-60" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
