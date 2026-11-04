import { describe, expect, it } from "vitest";
import { isValidTrackingCode, normalizeTrackingCode } from "./tracking-code";

describe("tracking code validator", () => {
  it("trims and uppercases", () => {
    expect(normalizeTrackingCode("  fg-7k4m-2qxp ")).toBe("FG-7K4M-2QXP");
  });

  it("accepts FG-XXXX-XXXX with A-Z and 0-9", () => {
    expect(isValidTrackingCode("FG-7K4M-2QXP")).toBe(true);
    expect(isValidTrackingCode(" fg-7k4m-2qxp ")).toBe(true);
    expect(isValidTrackingCode("FG-0000-9999")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "FG-",
      "FG-7K4M",
      "FG-7K4M-2QX",
      "FG-7K4M-2QXPP",
      "XX-7K4M-2QXP",
      "FG7K4M2QXP",
      "FG-7K4M-2Q_P",
    ]) {
      expect(isValidTrackingCode(bad), bad).toBe(false);
    }
  });
});
