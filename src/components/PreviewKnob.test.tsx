// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PreviewKnob from "./PreviewKnob";

afterEach(cleanup);

describe("native preview knob appearance", () => {
  it.each([[0, 0], [0.01, 1], [0.5, 9], [1, 17]])("lights the Java LED count at volume %s", (value, litCount) => {
    const onChange = vi.fn();
    const { container } = render(<PreviewKnob value={value} onChange={onChange} />);
    expect(container.querySelectorAll(".knob-led")).toHaveLength(17);
    expect(container.querySelectorAll(".knob-led.is-on")).toHaveLength(litCount);
    expect(container.querySelector("image")?.getAttribute("href")).toBe("/assets/knob_icon.png");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the red dot over Java's 120–420 degree sweep without rotating the image", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<PreviewKnob value={0} onChange={onChange} />);
    const dot = () => container.querySelector(".knob-position")!;
    expect(Number(dot().getAttribute("cx"))).toBeCloseTo(24);
    expect(Number(dot().getAttribute("cy"))).toBeCloseTo(30 + 6 * Math.sqrt(3));
    rerender(<PreviewKnob value={0.5} onChange={onChange} />);
    expect(Number(dot().getAttribute("cx"))).toBeCloseTo(30);
    expect(Number(dot().getAttribute("cy"))).toBeCloseTo(18);
    rerender(<PreviewKnob value={1} onChange={onChange} />);
    expect(Number(dot().getAttribute("cx"))).toBeCloseTo(36);
    expect(Number(dot().getAttribute("cy"))).toBeCloseTo(30 + 6 * Math.sqrt(3));
    expect(container.querySelector("image")?.getAttribute("transform")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves the existing range value, step, and change callback", () => {
    const onChange = vi.fn();
    render(<PreviewKnob value={0.8} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Preview monitor volume" }) as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("1");
    expect(slider.step).toBe("0.01");
    expect(slider.value).toBe("0.8");
    fireEvent.change(slider, { target: { value: "0.3" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(0.3);
  });
});
