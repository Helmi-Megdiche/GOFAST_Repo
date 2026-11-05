import { describe, expect, it } from "vitest";
import {
  isValidTrackingCode,
  normalizeTrackingCode,
  randomTrackingCode,
  TRACKING_ALPHABET,
} from "./tracking-code";

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

describe("randomTrackingCode (R203)", () => {
  it("has the FG-XXXX-XXXX shape and uses only the shared alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = randomTrackingCode();
      expect(isValidTrackingCode(code)).toBe(true);
      for (const char of code.replace(/^FG-|-/g, "")) expect(TRACKING_ALPHABET).toContain(char);
    }
  });

  it("throws away bytes 252 to 255 instead of folding them onto A to D", () => {
    // 252..255 would give A..D with a plain modulo. They must be skipped.
    const bytes = [252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7, 35, 36, 71, 251];
    const code = randomTrackingCode((size) => Uint8Array.from(bytes.slice(0, size)));
    expect(code).toBe("FG-ABCD-EFGH");
    const late = randomTrackingCode((size) =>
      Uint8Array.from(
        [255, 255, 255, 255, 255, 255, 255, 255, 35, 36, 71, 251, 0, 0, 0, 0].slice(0, size),
      ),
    );
    expect(late).toBe("FG-9A99-AAAA");
  });
});
