import { describe, expect, it } from "vitest";
import { dbToLinear, linearToDb, meterPercent } from "./audio";

describe("audio display conversion", () => {
  it("matches the native -60 dB floor and 0 dB unity point", () => {
    expect(linearToDb(0)).toBe(-60);
    expect(linearToDb(1)).toBe(0);
    expect(dbToLinear(-60)).toBe(0);
    expect(dbToLinear(0)).toBe(1);
  });

  it("maps linear RMS values into a bounded meter percentage", () => {
    expect(meterPercent(0)).toBe(0);
    expect(meterPercent(1)).toBe(100);
    expect(meterPercent(10)).toBe(100);
  });
});
