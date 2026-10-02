import { describe, expect, it } from "vitest";

const DESKTOP_VIEWPORTS = [
  [3840, 2160],
  [1920, 1080],
  [1366, 768],
  [1280, 720],
] as const;

function clamp(minimum: number, preferred: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, preferred));
}

function referenceLayout(width: number, height: number, inputCount = 24) {
  const shellPadding = clamp(2, width * 0.0016, 6) * 2;
  const outputWidth = clamp(128, width * 0.085, 326);
  const separator = clamp(6, width * 0.0057, 22) + clamp(2, width * 0.0026, 10) * 2;
  const gap = clamp(3, width * 0.0026, 10);
  const columns = Math.ceil(inputCount / 2);
  const inputAreaWidth = width - shellPadding - outputWidth - separator;
  const stripWidth = (inputAreaWidth - gap * (columns - 1)) / columns;
  const appBarHeight = clamp(34, height * 0.028, 60);
  const mixerHeaderHeight = clamp(56, height * 0.064, 138);
  const bodyHeight = height - appBarHeight - mixerHeaderHeight - shellPadding - 1 - gap;

  return { appBarHeight, bodyHeight, inputAreaWidth, mixerHeaderHeight, outputWidth, stripWidth };
}

describe("viewport layout contract", () => {
  it.each(DESKTOP_VIEWPORTS)("keeps the complete 24-input mixer inside %ix%i", (width, height) => {
    const layout = referenceLayout(width, height);

    expect(layout.inputAreaWidth).toBeGreaterThan(0);
    expect(layout.stripWidth).toBeGreaterThan(85);
    expect(layout.bodyHeight / 2).toBeGreaterThan(300);
    expect(layout.outputWidth).toBeLessThanOrEqual(width * 0.11);
    expect(layout.appBarHeight + layout.mixerHeaderHeight + layout.bodyHeight).toBeLessThanOrEqual(height);
  });

});
