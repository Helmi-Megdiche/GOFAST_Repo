import { describe, expect, it } from "vitest";
import { toLatinDigits } from "./digits";

describe("toLatinDigits", () => {
  it("turns Arabic-Indic and Eastern Arabic-Indic digits into Latin digits", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toLatinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("turns the Arabic decimal and thousands separators into . and ,", () => {
    expect(toLatinDigits("١٬١٥٢٫٥")).toBe("1,152.5");
  });

  it("leaves Latin digits and other text alone", () => {
    expect(toLatinDigits("FG-7K4M 12")).toBe("FG-7K4M 12");
  });
});
