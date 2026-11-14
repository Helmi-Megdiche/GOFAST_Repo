import { describe, expect, it } from "vitest";
import { exceedsWeightTolerance, formatKg, weightToleranceG } from "./weight";

describe("R208 weight tolerance", () => {
  it("is 500 g up to 5 kg declared, 10 % above", () => {
    expect(weightToleranceG(1000)).toBe(500);
    expect(weightToleranceG(5000)).toBe(500);
    expect(weightToleranceG(5001)).toBe(500); // 10 % of 5001 = 500.1, whole grams
    expect(weightToleranceG(6000)).toBe(600);
    expect(weightToleranceG(20_000)).toBe(2000);
    expect(Number.isInteger(weightToleranceG(7777))).toBe(true);
  });

  it("warns only strictly above declared + tolerance", () => {
    expect(exceedsWeightTolerance(1500, 2000)).toBe(false); // exactly at the limit
    expect(exceedsWeightTolerance(1500, 2001)).toBe(true);
    expect(exceedsWeightTolerance(10_000, 11_000)).toBe(false);
    expect(exceedsWeightTolerance(10_000, 11_001)).toBe(true);
    expect(exceedsWeightTolerance(1500, 900)).toBe(false); // lighter is never a warning
    expect(exceedsWeightTolerance(1500, null)).toBe(false);
  });
});

describe("formatKg", () => {
  it("shows grams as kilograms in the locale's format, with Latin digits", () => {
    expect(formatKg(1500, "fr")).toBe("1,5");
    expect(formatKg(1500, "en")).toBe("1.5");
    expect(formatKg(2300, "ar")).toMatch(/^2[.,٫]3$/);
    expect(formatKg(500, "en")).toBe("0.5");
    expect(formatKg(1005, "en")).toBe("1.005");
    expect(formatKg(2000, "fr")).toBe("2");
  });
});
