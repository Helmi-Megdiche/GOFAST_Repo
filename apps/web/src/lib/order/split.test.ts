import { describe, expect, it } from "vitest";
import { kgTextToGrams, splitWhole } from "./split";

describe("splitWhole", () => {
  it("gives each part floor(total / n) and the last part the remainder", () => {
    expect(splitWhole(1000, 3)).toEqual([333, 333, 334]);
    expect(splitWhole(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(splitWhole(5, 1)).toEqual([5]);
  });

  it("always returns n non-negative integers summing to the total", () => {
    // Deterministic pseudo-random totals so a failure can be replayed.
    let seed = 42;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const failures: string[] = [];
    for (let n = 1; n <= 99; n++) {
      for (let i = 0; i < 200; i++) {
        const total = next() % 10_000_001;
        const parts = splitWhole(total, n);
        const ok =
          parts.length === n &&
          parts.every((part) => Number.isInteger(part) && part >= 0) &&
          parts.reduce((a, b) => a + b, 0) === total;
        if (!ok) failures.push(`splitWhole(${total}, ${n})`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("throws on n < 1 or a non-integer total", () => {
    expect(() => splitWhole(10, 0)).toThrow();
    expect(() => splitWhole(10.5, 2)).toThrow();
  });
});

describe("kgTextToGrams", () => {
  it("converts decimal kg text to integer grams", () => {
    expect(kgTextToGrams("0.1")).toBe(100);
    expect(kgTextToGrams("1.005")).toBe(1005);
    expect(kgTextToGrams("2")).toBe(2000);
    expect(kgTextToGrams("2,5")).toBe(2500); // W13 accepts a comma
    expect(kgTextToGrams("١٫٥")).toBe(1500); // Arabic-Indic digits and separator, via toLatinDigits
  });

  it("refuses more than 3 decimals and anything that is not a number", () => {
    expect(kgTextToGrams("1.0005")).toEqual({ refused: "tooManyDecimals" });
    expect(kgTextToGrams("abc")).toEqual({ refused: "invalid" });
  });
});
