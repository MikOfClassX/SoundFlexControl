// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fader from "./Fader";

afterEach(cleanup);

describe("native-compatible fader range", () => {
  it("positions major and minor ticks by their dB value", () => {
    const { container } = render(<Fader label="Output volume" value={1} onChange={() => undefined} />);
    const ticks = [...container.querySelectorAll<HTMLElement>(".fader-tick")];
    expect(ticks).toHaveLength(36);
    expect(ticks.filter(tick => tick.classList.contains("major"))).toHaveLength(8);
    for (const tick of ticks) {
      const db = Number(tick.dataset.db);
      expect(parseFloat(tick.style.top)).toBeCloseTo((10 - db) / 70 * 100);
    }
    expect(ticks[0].textContent).toBe("+10");
    expect(ticks.at(-1)?.textContent).toBe("−∞");
  });
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

  it.each([0, 0.25, 10 ** (10 / 20)])("right-click resets gain %s to 0 dB, not mute", (value) => {
    const onChange = vi.fn();
    const { rerender } = render(<Fader label="Input volume" value={value} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Input volume" }) as HTMLInputElement;
    expect(fireEvent.contextMenu(slider)).toBe(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
    expect(slider.value).toBe("0");
    expect(screen.getByTitle("Input volume: 0.0 dB")).toBeTruthy();

    // A reset must not leave the fader editing and block subsequent native updates.
    rerender(<Fader label="Input volume" value={0.5} onChange={onChange} />);
    expect(Number(slider.value)).toBeCloseTo(20 * Math.log10(0.5));
  });

  it("does not reset a disabled fader", () => {
    const onChange = vi.fn();
    render(<Fader label="Output volume" value={0.25} disabled onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Output volume" }) as HTMLInputElement;
    fireEvent.contextMenu(slider);
    expect(onChange).not.toHaveBeenCalled();
    expect(Number(slider.value)).toBeCloseTo(20 * Math.log10(0.25));
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
