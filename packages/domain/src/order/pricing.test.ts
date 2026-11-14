import { describe, expect, it } from "vitest";
import type { ParcelTypeCode, ServiceCode } from "../services";
import { QUOTE_VALIDITY_MS } from "./constants";
import {
  isQuoteValid,
  makeQuote as makeQuoteWith,
  msLeft,
  PRICE_LINES,
  priceKey,
  priceLines as priceLinesWith,
  sumLines,
  type PriceInput,
  type PriceTable,
} from "./pricing";

// The example amounts of the mockup (W14, W15), copied here: the rules take the table as an
// argument, so these tests do not depend on the web app's fixtures.
const TABLE: PriceTable = {
  rows: {
    express: {
      document: { base: 9_000, vat: 2_375 },
      small: { base: 10_500, vat: 2_660 },
      medium: { base: 12_500, vat: 3_040 },
      large: { base: 14_500, vat: 3_420 },
    },
    standard: {
      document: { base: 4_500, vat: 1_520 },
      small: { base: 6_000, vat: 1_805 },
      medium: { base: 8_000, vat: 2_185 },
      large: { base: 10_000, vat: 2_565 },
    },
    scheduled: {
      document: { base: 5_500, vat: 1_710 },
      small: { base: 7_000, vat: 1_995 },
      medium: { base: 9_000, vat: 2_375 },
      large: { base: 11_000, vat: 2_755 },
    },
  },
  distance: 2_500,
  weight: { includedKg: 2, perKg: 500 },
  optionsFragile: 0,
  surcharge: { code: "rain", amount: 1_000, ceiling: null },
  discount: 0,
  stamp: 0,
};

let counter = 0;
const makeQuote = (input: PriceInput, at: number) =>
  makeQuoteWith(input, at, TABLE, `quote-${++counter}`);
const priceLines = (input: PriceInput) => priceLinesWith(input, TABLE);

const SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];
const SIZES: ParcelTypeCode[] = ["document", "small", "medium", "large"];
const T0 = Date.parse("2026-11-04T10:00:00Z");

const ROUTE = { from: "Avenue Habib Bourguiba", to: "Rue Ibn Khaldoun" };

describe("example pricing (R204)", () => {
  it("every line is an integer and the lines are listed in order, for every combination", () => {
    for (const service of SERVICES) {
      for (const parcelType of SIZES) {
        for (const weightKg of [0.5, 1, 2, 2.1, 3, 7, 30]) {
          for (const fragile of [true, false]) {
            const quote = makeQuote(
              { service, parcelType, weightKg, fragile, zone: "A", ...ROUTE },
              T0,
            );
            for (const line of PRICE_LINES)
              expect(Number.isSafeInteger(quote.lines[line])).toBe(true);
            expect(Object.keys(quote.lines)).toEqual([...PRICE_LINES]);
          }
        }
      }
    }
  });

  // Expected totals worked out by hand from the example fixtures: base + distance 2,500 +
  // 0,500 per started kg above 2 kg + rain 1,000 + the row's VAT (options, discount, stamp at 0).
  it.each([
    ["express", "document", 0.5, 9_000 + 2_500 + 0 + 1_000 + 2_375, 0],
    ["standard", "small", 2, 6_000 + 2_500 + 0 + 1_000 + 1_805, 0],
    ["standard", "small", 2.1, 6_000 + 2_500 + 500 + 1_000 + 1_805, 500],
    ["scheduled", "medium", 3, 9_000 + 2_500 + 500 + 1_000 + 2_375, 500],
    ["express", "large", 7, 14_500 + 2_500 + 2_500 + 1_000 + 3_420, 2_500],
    ["standard", "large", 30, 10_000 + 2_500 + 14_000 + 1_000 + 2_565, 14_000],
  ] as const)(
    "%s %s %d kg costs %i millimes (weight line %i)",
    (service, parcelType, weightKg, total, weight) => {
      const quote = makeQuote(
        { service, parcelType, weightKg, fragile: false, zone: "A", ...ROUTE },
        T0,
      );
      expect(quote.lines.weight).toBe(weight);
      expect(quote.totalMillimes).toBe(total);
      expect(sumLines(quote.lines)).toBe(total);
    },
  );

  it("reproduces the mockup amounts for a small parcel of 2 kg", () => {
    const total = (service: ServiceCode) =>
      makeQuote(
        { service, parcelType: "small", weightKg: 2, fragile: true, zone: "A", ...ROUTE },
        T0,
      ).totalMillimes;
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
      ...ROUTE,
    });
    expect(lines.discount).toBe(0);
    expect(lines.stamp).toBe(0);
    expect(lines.weight).toBe(0);
  });

  it("names the surcharge and leaves its ceiling unknown (R207: [PLAFOND])", () => {
    const quote = makeQuote(
      {
        service: "standard",
        parcelType: "small",
        weightKg: 2,
        fragile: false,
        zone: "A",
        ...ROUTE,
      },
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
      ...ROUTE,
    } as const;
    const key = priceKey(base);
    expect(priceKey({ ...base, service: "express" })).not.toBe(key);
    expect(priceKey({ ...base, parcelType: "large" })).not.toBe(key);
    expect(priceKey({ ...base, weightKg: 3 })).not.toBe(key);
    expect(priceKey({ ...base, fragile: true })).not.toBe(key);
    expect(priceKey({ ...base, zone: "B" })).not.toBe(key);
    expect(priceKey({ ...base, from: "Rue Ibn Khaldoun" })).not.toBe(key);
    expect(priceKey({ ...base, to: "Avenue Habib Bourguiba" })).not.toBe(key);
  });
});

describe("price guarantee (R205, fake clock)", () => {
  const quote = makeQuote(
    { service: "standard", parcelType: "small", weightKg: 2, fragile: false, zone: "A", ...ROUTE },
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
