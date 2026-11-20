import { describe, expect, it } from "vitest";
import { PRICE_LINES } from "@fastgo/domain";
import { presentPriceLines } from "./price-lines";
import { readyDraft } from "./test-draft";

const T0 = Date.parse("2026-11-04T10:00:00Z");

describe("the price lines shown for a saved quote (GH-10)", () => {
  it("GH-10-D7 a complete quote shows every line in PRICE_LINES order", () => {
    const quote = readyDraft(T0).quote!;
    expect(presentPriceLines(quote).map(([line]) => line)).toEqual([...PRICE_LINES]);
  });

  it("GH-10-D7 a quote lacking a line skips it: no 0 is shown, the total is not touched", () => {
    const quote = structuredClone(readyDraft(T0).quote!);
    const total = quote.totalMillimes;
    delete (quote.lines as Record<string, unknown>).stamp;
    const shown = presentPriceLines(quote).map(([line]) => line);
    expect(shown).not.toContain("stamp");
    expect(shown).toHaveLength(PRICE_LINES.length - 1);
    expect(quote.totalMillimes).toBe(total);
  });
});
