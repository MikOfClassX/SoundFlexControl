import { describe, expect, it } from "vitest";
import { dbToLinear, formatDb, linearToDb, MAX_DB, meterPercent } from "./audio";

describe("audio display conversion", () => {
  it("matches the native -60 dB floor and 0 dB unity point", () => {
    expect(linearToDb(0)).toBe(-60);
    expect(linearToDb(1)).toBe(0);
    expect(dbToLinear(-60)).toBe(0);
    expect(dbToLinear(0)).toBe(1);
  });

  it("matches native +10 dB fader gain without clipping it to unity", () => {
    const maxGain = 10 ** (10 / 20);
    expect(MAX_DB).toBe(10);
    expect(dbToLinear(10)).toBeCloseTo(maxGain);
    expect(linearToDb(maxGain)).toBeCloseTo(10);
    expect(dbToLinear(20)).toBeCloseTo(maxGain);
    expect(linearToDb(10)).toBe(10);
    expect(formatDb(maxGain)).toBe("10.0 dB");
  });

  it("maps linear RMS values into a bounded meter percentage", () => {
    expect(meterPercent(0)).toBe(0);
    expect(meterPercent(1)).toBe(100);
    expect(meterPercent(10)).toBe(100);
  });
});
