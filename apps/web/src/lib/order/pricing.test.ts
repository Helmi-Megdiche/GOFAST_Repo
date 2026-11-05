import { describe, expect, it } from "vitest";
import type { ParcelTypeCode, ServiceCode } from "../data/services";
import { QUOTE_VALIDITY_MS } from "./constants";
import {
  isQuoteValid,
  makeQuote,
  msLeft,
  PRICE_LINES,
  priceKey,
  priceLines,
  sumLines,
} from "./pricing";

const SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];
const SIZES: ParcelTypeCode[] = ["document", "small", "medium", "large"];
const T0 = Date.parse("2026-11-04T10:00:00Z");

describe("example pricing (R204)", () => {
  it("every line is an integer and the lines add up to the total, for every combination", () => {
    for (const service of SERVICES) {
      for (const parcelType of SIZES) {
        for (const weightKg of [0.5, 1, 2, 2.1, 3, 7, 30]) {
          for (const fragile of [true, false]) {
            const quote = makeQuote({ service, parcelType, weightKg, fragile, zone: "A" }, T0);
            for (const line of PRICE_LINES)
              expect(Number.isSafeInteger(quote.lines[line])).toBe(true);
            expect(sumLines(quote.lines)).toBe(quote.totalMillimes);
            expect(Object.keys(quote.lines)).toEqual([...PRICE_LINES]);
          }
        }
      }
    }
  });

  it("reproduces the mockup amounts for a small parcel of 2 kg", () => {
    const total = (service: ServiceCode) =>
      makeQuote({ service, parcelType: "small", weightKg: 2, fragile: true, zone: "A" }, T0)
        .totalMillimes;
    expect(total("express")).toBe(16_660);
    expect(total("standard")).toBe(11_305);
    expect(total("scheduled")).toBe(12_495);
  });

  it("keeps the zero lines (discount, stamp) instead of dropping them", () => {
    const lines = priceLines({
      service: "standard",
      parcelType: "small",
      weightKg: 2,
      fragile: false,
      zone: "A",
    });
    expect(lines.discount).toBe(0);
    expect(lines.stamp).toBe(0);
    expect(lines.weight).toBe(0);
  });

  it("names the surcharge and leaves its ceiling unknown (R207: [PLAFOND])", () => {
    const quote = makeQuote(
      { service: "standard", parcelType: "small", weightKg: 2, fragile: false, zone: "A" },
      T0,
    );
    expect(quote.surcharge).toEqual({ code: "rain", ceilingMillimes: null });
    expect(quote.lines.surcharge).toBeGreaterThan(0);
  });

  it("a change to any priced field changes the price key", () => {
    const base = {
      service: "standard",
      parcelType: "small",
      weightKg: 2,
      fragile: false,
      zone: "A",
    } as const;
    const key = priceKey(base);
    expect(priceKey({ ...base, service: "express" })).not.toBe(key);
    expect(priceKey({ ...base, parcelType: "large" })).not.toBe(key);
    expect(priceKey({ ...base, weightKg: 3 })).not.toBe(key);
    expect(priceKey({ ...base, fragile: true })).not.toBe(key);
    expect(priceKey({ ...base, zone: "B" })).not.toBe(key);
  });
});

describe("price guarantee (R205, fake clock)", () => {
  const quote = makeQuote(
    { service: "standard", parcelType: "small", weightKg: 2, fragile: false, zone: "A" },
    T0,
  );

  it("is valid for exactly 15 minutes", () => {
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.quotedAt)).toBe(QUOTE_VALIDITY_MS);
    expect(QUOTE_VALIDITY_MS).toBe(15 * 60_000);
    expect(isQuoteValid(quote, T0 + 14 * 60_000 + 59_999)).toBe(true);
    expect(isQuoteValid(quote, T0 + 15 * 60_000)).toBe(false);
  });

  it("counts the time left down to zero, never below", () => {
    expect(msLeft(quote, T0)).toBe(15 * 60_000);
    expect(msLeft(quote, T0 + 7 * 60_000)).toBe(8 * 60_000);
    expect(msLeft(quote, T0 + 20 * 60_000)).toBe(0);
  });

  it("a recalculated quote has a new id and a new expiry", () => {
    const later = makeQuote(quote.input, T0 + 15 * 60_000);
    expect(later.id).not.toBe(quote.id);
    expect(Date.parse(later.expiresAt)).toBe(T0 + 30 * 60_000);
  });
});
