import { describe, expect, it } from "vitest";
import { formatMillimes } from "./money";

const NBSP = " ";

describe("formatMillimes", () => {
  it.each([
    [0, `0,000${NBSP}TND`, `0.000${NBSP}TND`],
    [500, `0,500${NBSP}TND`, `0.500${NBSP}TND`],
    [48500, `48,500${NBSP}TND`, `48.500${NBSP}TND`],
    [1152000, `1${NBSP}152,000${NBSP}TND`, `1,152.000${NBSP}TND`],
    [-48500, `-48,500${NBSP}TND`, `-48.500${NBSP}TND`],
  ])("%i millimes", (millimes, fr, enAr) => {
    expect(formatMillimes(millimes, "fr")).toBe(fr);
    expect(formatMillimes(millimes, "en")).toBe(enAr);
    expect(formatMillimes(millimes, "ar")).toBe(enAr);
  });

  it("always shows 3 decimals", () => {
    expect(formatMillimes(5, "fr")).toBe(`0,005${NBSP}TND`);
    expect(formatMillimes(1000, "en")).toBe(`1.000${NBSP}TND`);
  });

  it("uses Latin digits in Arabic", () => {
    expect(formatMillimes(1152000, "ar")).not.toMatch(/[؀-ۿ]/);
  });

  it("rejects floats and unsafe integers", () => {
    expect(() => formatMillimes(48.5, "fr")).toThrow(RangeError);
    expect(() => formatMillimes(Number.NaN, "fr")).toThrow(RangeError);
    expect(() => formatMillimes(Number.MAX_SAFE_INTEGER + 2, "fr")).toThrow(RangeError);
  });
});
