import { describe, expect, it } from "vitest";
import { contactTypeFromQuery } from "./contact-type";

describe("contactTypeFromQuery", () => {
  it("reads the three request types, in French or English, in any case", () => {
    expect(contactTypeFromQuery("devis")).toBe("quote");
    expect(contactTypeFromQuery("QUOTE")).toBe("quote");
    expect(contactTypeFromQuery("reclamation")).toBe("claim");
    expect(contactTypeFromQuery("claim")).toBe("claim");
    expect(contactTypeFromQuery("question")).toBe("question");
  });

  it("falls back to question for anything else, including Object.prototype names", () => {
    for (const value of [
      "",
      null,
      undefined,
      "nope",
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(contactTypeFromQuery(value), String(value)).toBe("question");
    }
  });
});
