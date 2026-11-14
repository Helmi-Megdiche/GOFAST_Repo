import { describe, expect, it } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone", () => {
  it("writes a Tunisian number as +216 XX XXX XXX, whatever the input format", () => {
    expect(formatPhone("+21650000000")).toBe("+216 50 000 000");
    expect(formatPhone("0021698000001")).toBe("+216 98 000 001");
    expect(formatPhone("50 000 000")).toBe("+216 50 000 000");
  });

  it("returns an empty text for something that is not a number", () => {
    expect(formatPhone("12")).toBe("");
  });
});
