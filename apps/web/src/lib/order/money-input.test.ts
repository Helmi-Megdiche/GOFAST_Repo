import { describe, expect, it } from "vitest";
import { millimesInputText, parseMillimes } from "./money-input";

const ok = (millimes: number | null) => ({ ok: true, millimes });
const bad = { ok: false, error: "declaredValueInvalid" };

describe("parseMillimes", () => {
  it.each([
    ["48,500", 48_500],
    ["48.5", 48_500],
    ["48", 48_000],
    ["0,5", 500],
    ["0.005", 5],
    ["1 152,000", 1_152_000],
    ["1\u00a0152,5", 1_152_500],
    ["1152.25", 1_152_250],
    ["  12 ", 12_000],
    ["٤٨٫٥", 48_500],
  ])("fr: %s is %i millimes", (input, millimes) => {
    expect(parseMillimes(input, "fr")).toEqual(ok(millimes));
  });

  it.each([
    ["48.500", 48_500],
    ["48.5", 48_500],
    ["1,152.000", 1_152_000],
    ["1,152", 1_152_000],
    ["48,500", 48_500_000],
    ["12", 12_000],
  ])("en: %s is %i millimes", (input, millimes) => {
    expect(parseMillimes(input, "en")).toEqual(ok(millimes));
  });

  it.each([
    ["٤٨٫٥", 48_500],
    ["۱۲", 12_000],
    ["1,152.5", 1_152_500],
  ])("ar: %s is %i millimes", (input, millimes) => {
    expect(parseMillimes(input, "ar")).toEqual(ok(millimes));
  });

  it("gives null for an empty field (the value is optional)", () => {
    expect(parseMillimes("", "fr")).toEqual(ok(null));
    expect(parseMillimes("   ", "en")).toEqual(ok(null));
  });

  it.each([
    "abc",
    "1,2,3",
    "-5",
    "-5,000",
    "48,5000",
    "1.152,5",
    "1 15,0",
    "12,",
    ".5",
    "1e3",
    "Infinity",
  ])("fr refuses %s", (input) => {
    expect(parseMillimes(input, "fr")).toEqual(bad);
  });

  it.each(["1,15", "1,152,5", "48,5", "1 152.5", "-1", "1.2345", "0,500", "00,500"])(
    "en refuses %s",
    (input) => {
      expect(parseMillimes(input, "en")).toEqual(bad);
    },
  );

  it.each(["0,500", "٠,٥٠٠"])("ar refuses %s (a comma only groups thousands)", (input) => {
    expect(parseMillimes(input, "ar")).toEqual(bad);
  });

  it.each([
    [48_500, "fr", "48,500"],
    [1_152_500, "fr", "1\u00a0152,500"],
    [48_500, "en", "48.500"],
    [1_152_500, "en", "1,152.500"],
    [1_152_500, "ar", "1,152.500"],
  ] as const)(
    "shows %i millimes in the field as %s in %s, and reads it back",
    (millimes, locale, text) => {
      expect(millimesInputText(millimes, locale)).toBe(text);
      expect(parseMillimes(text, locale)).toEqual(ok(millimes));
    },
  );

  it("shows an empty field for no declared value", () => {
    expect(millimesInputText(null, "fr")).toBe("");
  });

  it("refuses an amount above the safe integer range, and never uses floats", () => {
    expect(parseMillimes("9007199254740.991", "en")).toEqual(ok(Number.MAX_SAFE_INTEGER));
    expect(parseMillimes("9007199254740.992", "en")).toEqual(bad);
    expect(parseMillimes("0.1", "en")).toEqual(ok(100));
    expect(parseMillimes("0.3", "en")).toEqual(ok(300));
  });
});
